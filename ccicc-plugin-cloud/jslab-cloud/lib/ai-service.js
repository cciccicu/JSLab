const { buildAiSystemPrompt, buildAiUserPrompt } = require('./ai-prompts');
const { DEFAULT_AI_MODEL } = require('./persistent-state');
const { validScriptName } = require('./script-filename');
const { identity: RUNTIME_CONTRACT } = require('./runtime-contract.json');

function estimateTokenCount(value) {
  const text = String(value || '');
  const ascii = (text.match(/[\x00-\x7f]/g) || []).length;
  const cjk = (text.match(/[\u2e80-\u9fff\uf900-\ufaff]/g) || []).length;
  const otherBytes = Buffer.byteLength(text, 'utf8') - ascii - cjk * 3;
  // Provider tokenizers differ. Estimate mixed code/Chinese with a 25% margin;
  // uncommon Unicode retains its byte bound. Settlement uses reported usage.
  return Math.ceil((ascii / 3 + cjk * 1.5 + otherBytes) * 1.25);
}

function recoverAiReservations(state) {
  const { ctx, aiReservations, entitlements } = state;
  // Deployment restarts the whole process; refund interrupted reservations once.
  ctx.db.transaction(() => {
    const orphaned = ctx.db.prepare(`SELECT id,user_id,reserved_cents FROM ${aiReservations} WHERE status='reserved'`).all();
    orphaned.forEach((reservation) => {
      ctx.db.prepare(`UPDATE ${aiReservations} SET status='cancelled', settled_at=datetime('now') WHERE id=? AND status='reserved'`).run(reservation.id);
      ctx.db.prepare(`UPDATE ${entitlements} SET ai_credit_cents=ai_credit_cents+?, updated_at=datetime('now') WHERE user_id=?`)
        .run(reservation.reserved_cents, reservation.user_id);
    });
  })();
}

function createAiService(state) {
  const { ctx, entitlements, aiReservations, aiUsage, entitlementFor, hasAiAccess, sourceFromBody, validSource, validJavaScript, consume, log, getPositiveInteger, MAX_SOURCE, MAX_AI_PROMPT_CHARS } = state;
  const getPositiveNumber = (key, fallback, maximum) => {
    const value = Number(ctx.config.get(key));
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.min(maximum, value);
  };
  const getTokenPrices = () => ({
    input: getPositiveNumber('aiInputCentsPerMillionTokens', 500, 1_000_000),
    cachedInput: getPositiveNumber('aiCachedInputCentsPerMillionTokens', 500, 1_000_000),
    output: getPositiveNumber('aiOutputCentsPerMillionTokens', 1000, 1_000_000)
  });
  const tokenCost = (inputTokens, outputTokens, cachedInputTokens, prices) => {
    const cached = Math.min(inputTokens, Math.max(0, cachedInputTokens));
    const cacheMiss = inputTokens - cached;
    return Math.max(1, Math.ceil((cacheMiss * prices.input + cached * prices.cachedInput + outputTokens * prices.output) / 1_000_000));
  };
  const stripCodeFence = (value) => {
    const content = String(value || '').trim();
    const match = content.match(/^```(?:javascript|js)?\s*\n?([\s\S]*?)\n?```$/i);
    return (match ? match[1] : content).trim();
  };
  const reserveAiCredit = (userId, reservedCents) => {
    const reserve = ctx.db.transaction(() => {
      const result = ctx.db.prepare(`UPDATE ${entitlements} SET ai_credit_cents=ai_credit_cents-?, updated_at=datetime('now')
        WHERE user_id=? AND cloud_enabled=1 AND ai_enabled=1 AND ai_credit_cents>=?`).run(reservedCents, userId, reservedCents);
      if (!result.changes) return null;
      const reservation = ctx.db.prepare(`INSERT INTO ${aiReservations} (user_id,reserved_cents) VALUES (?, ?)`)
        .run(userId, reservedCents);
      return { id: Number(reservation.lastInsertRowid), reservedCents };
    });
    return reserve();
  };
  const cancelAiReservation = (reservationId) => {
    const cancel = ctx.db.transaction(() => {
      const reservation = ctx.db.prepare(`SELECT * FROM ${aiReservations} WHERE id=? AND status='reserved'`).get(reservationId);
      if (!reservation) return false;
      const changed = ctx.db.prepare(`UPDATE ${aiReservations} SET status='cancelled', settled_at=datetime('now') WHERE id=? AND status='reserved'`)
        .run(reservationId);
      if (!changed.changes) return false;
      ctx.db.prepare(`UPDATE ${entitlements} SET ai_credit_cents=ai_credit_cents+?, updated_at=datetime('now') WHERE user_id=?`)
        .run(reservation.reserved_cents, reservation.user_id);
      return true;
    });
    return cancel();
  };
  const settleAiReservation = (reservationId, userId, mode, model, inputTokens, outputTokens, cachedInputTokens, prices) => {
    const chargedCents = tokenCost(inputTokens, outputTokens, cachedInputTokens, prices);
    const settle = ctx.db.transaction(() => {
      const reservation = ctx.db.prepare(`SELECT * FROM ${aiReservations} WHERE id=? AND user_id=? AND status='reserved'`)
        .get(reservationId, userId);
      if (!reservation) return null;
      // An estimate is not a cap. Supplement atomically without spending
      // another in-flight request's reservation or allowing negative credit.
      const extraCents = chargedCents - reservation.reserved_cents;
      if (extraCents > 0) {
        const extra = ctx.db.prepare(`UPDATE ${entitlements} SET ai_credit_cents=ai_credit_cents-?, updated_at=datetime('now')
          WHERE user_id=? AND ai_credit_cents>=?`).run(extraCents, userId, extraCents);
        if (!extra.changes) return null;
      }
      const refundCents = Math.max(0, reservation.reserved_cents - chargedCents);
      if (refundCents) ctx.db.prepare(`UPDATE ${entitlements} SET ai_credit_cents=ai_credit_cents+?, updated_at=datetime('now') WHERE user_id=?`)
        .run(refundCents, userId);
      const settled = ctx.db.prepare(`UPDATE ${aiReservations} SET status='settled', settled_at=datetime('now') WHERE id=? AND status='reserved'`)
        .run(reservationId);
      if (!settled.changes) return null;
      ctx.db.prepare(`INSERT INTO ${aiUsage} (user_id,mode,model,input_tokens,output_tokens,total_tokens,charged_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(userId, mode, model, inputTokens, outputTokens, inputTokens + outputTokens, chargedCents);
      return { chargedCents, remainingCreditCents: entitlementFor(userId).ai_credit_cents };
    });
    return settle();
  };
  const generateAiSource = async (user, body) => {
    if (body?.runtimeContract !== RUNTIME_CONTRACT) return { error: 'runtime_contract_mismatch', status: 409 };
    const mode = body?.mode === 'rewrite' ? 'rewrite' : body?.mode === 'create' ? 'create' : '';
    const prompt = String(body?.prompt || '').trim();
    const source = sourceFromBody(body);
    const name = String(body?.name || '').trim();
    if (!mode || !prompt || prompt.length > MAX_AI_PROMPT_CHARS || !validScriptName(name, mode === 'rewrite') || Buffer.byteLength(source, 'utf8') > MAX_SOURCE) {
      return { error: 'invalid_ai_request', status: 400 };
    }
    if (!hasAiAccess(user)) return { error: 'activation_required', status: 403 };
    const url = String(ctx.config.get('aiApiUrl') || '');
    const key = String(ctx.config.get('aiApiKey') || '');
    const model = String(ctx.config.get('aiModel') || DEFAULT_AI_MODEL);
    const maxTokens = getPositiveInteger('aiMaxOutputTokens', 8192, 16384);
    if (!url || !key || !model || typeof fetch !== 'function') return { error: 'ai_not_configured', status: 503 };
    if (!consume(`ai:${user.id}`, 6, 60_000)) return { error: 'rate_limited', status: 429 };
    const userRequest = buildAiUserPrompt({ mode, name, prompt, source });
    const systemPrompt = buildAiSystemPrompt();
    const prices = getTokenPrices();
    // Include message overhead and the configured maximum output. Prices are
    // fixed for this request even if an administrator updates them mid-flight.
    const estimatedCost = tokenCost(estimateTokenCount(systemPrompt + userRequest) + 128, maxTokens, 0, prices);
    const reservation = reserveAiCredit(user.id, estimatedCost);
    if (!reservation) return { error: 'ai_credit_insufficient', status: 402 };
    let payload;
    let timeout = null;
    try {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      timeout = controller ? setTimeout(() => controller.abort(), getPositiveInteger('aiRequestTimeoutMs', 90_000, 300_000)) : null;
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: controller ? controller.signal : undefined,
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: maxTokens, thinking: { type: 'disabled' }, messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userRequest }
        ] })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payload = await response.json();
    } catch (error) {
      cancelAiReservation(reservation.id);
      ctx.logger.warn({ userId: user.id, error: error.message }, 'AI generation request failed');
      return { error: 'ai_provider_unavailable', status: 502 };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    const code = stripCodeFence(payload?.choices?.[0]?.message?.content);
    const inputTokens = Number(payload?.usage?.prompt_tokens);
    const outputTokens = Number(payload?.usage?.completion_tokens);
    const cachedInputTokens = Number(payload?.usage?.prompt_tokens_details?.cached_tokens || 0);
    const finishReason = payload?.choices?.[0]?.finish_reason;
    if (finishReason === 'length' || finishReason === 'content_filter' || !code || !validSource(name, code, mode === 'rewrite') || !validJavaScript(code) || !Number.isSafeInteger(inputTokens) || inputTokens < 0 || !Number.isSafeInteger(outputTokens) || outputTokens < 0 || !Number.isSafeInteger(inputTokens + outputTokens) || !Number.isSafeInteger(cachedInputTokens) || cachedInputTokens < 0 || cachedInputTokens > inputTokens) {
      cancelAiReservation(reservation.id);
      return { error: 'ai_invalid_response', status: 502 };
    }
    const billing = settleAiReservation(reservation.id, user.id, mode, model, inputTokens, outputTokens, cachedInputTokens, prices);
    if (!billing) {
      cancelAiReservation(reservation.id);
      return { error: 'ai_credit_insufficient', status: 402 };
    }
    log(user.id, 'ai.generate', `${mode}:${billing.chargedCents}`);
    return { runtimeContract: RUNTIME_CONTRACT, code, usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, chargedCents: billing.chargedCents }, remainingCreditCents: billing.remainingCreditCents };
  };
  return { generateAiSource };
}

module.exports = { recoverAiReservations, createAiService, estimateTokenCount };
