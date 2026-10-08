const { DEFAULT_MARKET_MODERATION_PROMPT } = require('./persistent-state');
const { scriptFilename } = require('./script-filename');

function createMarketService(state) {
  const { ctx, marketScripts, reviews, reports, json, wantsJson, currentUser, hash, checksum, log, consume, sourceFromBody, validJavaScript, getPositiveInteger, MAX_SOURCE } = state;
  const marketSourceIssue = (source) => {
    const checks = [
      [/\beval\s*\(/, 'dynamic_code'],
      [/\bFunction\s*\(/, 'dynamic_code'],
      [/\bdevice\.(?:getDeviceId|getSerial)\s*\(/, 'device_identifier'],
      [/(?:authorization|bearer|api[_-]?key|device[_-]?token)\s*[:=]\s*['"][^'"]+/i, 'embedded_secret']
    ];
    const match = checks.find(([pattern]) => pattern.test(String(source)));
    return match ? match[1] : null;
  };
  const marketSnapshot = row => {
    const pending = row.pending_status != null;
    return { status: row.status, pendingStatus: row.pending_status,
      name: pending ? row.pending_name : row.name, description: pending ? row.pending_description : row.description,
      tags: pending ? row.pending_tags : row.tags, hash: pending ? row.pending_hash : row.hash };
  };
  const sameMarketSnapshot = (row, snapshot) => {
    if (!row) return false;
    const current = marketSnapshot(row);
    return Object.keys(snapshot).every(key => current[key] === snapshot[key]);
  };
  const reviewContentHash = snapshot => hash(JSON.stringify([snapshot.name, snapshot.description, snapshot.tags, snapshot.hash]));
  const applyMarketDecision = (marketId, decision, snapshot) => ctx.db.transaction(() => {
    const row = ctx.db.prepare(`SELECT * FROM ${marketScripts} WHERE id=?`).get(marketId);
    if (!row) return null;
    if (snapshot && !sameMarketSnapshot(row, snapshot)) return null;
    if (row.pending_status === 'pending' || row.pending_status === 'rejected') {
      if (decision === 'approve') {
        ctx.db.prepare(`UPDATE ${marketScripts} SET name=pending_name,description=pending_description,tags=pending_tags,source=pending_source,hash=pending_hash,checksum=pending_checksum,status='published',pending_name=NULL,pending_description=NULL,pending_tags=NULL,pending_source=NULL,pending_hash=NULL,pending_checksum=NULL,pending_status=NULL,updated_at=datetime('now') WHERE id=?`).run(marketId);
      } else {
        ctx.db.prepare(`UPDATE ${marketScripts} SET pending_status='rejected',updated_at=datetime('now') WHERE id=?`).run(marketId);
      }
    } else {
      ctx.db.prepare(`UPDATE ${marketScripts} SET status=?,updated_at=datetime('now') WHERE id=?`).run(decision === 'approve' ? 'published' : 'rejected', marketId);
    }
    return ctx.db.prepare(`SELECT status,pending_status FROM ${marketScripts} WHERE id=?`).get(marketId);
  })();
  const llmReview = async (scriptId) => {
    const url = String(ctx.config.get('llmApiUrl') || ''); const key = String(ctx.config.get('llmApiKey') || ''); const model = String(ctx.config.get('llmModel') || '');
    const moderationPrompt = String(ctx.config.get('llmModerationPrompt') || DEFAULT_MARKET_MODERATION_PROMPT).trim() || DEFAULT_MARKET_MODERATION_PROMPT;
    if (!url || !key || !model || typeof fetch !== 'function') return null;
    const stored = ctx.db.prepare(`SELECT * FROM ${marketScripts} WHERE id=?`).get(scriptId);
    if (!stored) return null;
    const snapshot = marketSnapshot(stored);
    const row = { ...snapshot, source: stored.pending_status != null ? stored.pending_source : stored.source };
    let timeout = null;
    try {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      timeout = controller ? setTimeout(() => controller.abort(), getPositiveInteger('llmRequestTimeoutMs', 90_000, 300_000)) : null;
      const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: controller ? controller.signal : undefined, body: JSON.stringify({ model, temperature: 0, thinking: { type: 'disabled' }, messages: [{ role: 'system', content: `${moderationPrompt}\n\n当前所有 .js 脚本都具有 console、ui、dialog、script、system；文件名和旧执行类型不决定能力，合法混用日志与 UI 不属于模式错误。\n\n只返回 JSON，不要使用 Markdown：{"decision":"approve|reject","reason":"简短说明"}` }, { role: 'user', content: `Name: ${row.name}\nDescription: ${row.description}\nSource:\n${row.source}` }] }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json(); const content = String(payload?.choices?.[0]?.message?.content || ''); const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ''));
      if (!sameMarketSnapshot(ctx.db.prepare(`SELECT * FROM ${marketScripts} WHERE id=?`).get(scriptId), snapshot)) return null;
      if (parsed.decision !== 'approve' && parsed.decision !== 'reject') throw new Error('Invalid moderation decision');
      const decision = parsed.decision; const reason = String(parsed.reason || '').slice(0, 1000);
      ctx.db.prepare(`INSERT INTO ${reviews} (script_id,model,decision,reason,content_hash) VALUES (?, ?, ?, ?, ?)`).run(scriptId, model, decision, reason, reviewContentHash(snapshot));
      return { decision, reason, snapshot };
    } catch (error) { ctx.logger.warn({ scriptId, error: error.message }, 'LLM moderation failed; leaving script pending'); return null; }
    finally { if (timeout) clearTimeout(timeout); }
  };
  const submitMarket = async (req, res, user, browserForm = false) => {
    const llmModeration = ctx.config.get('marketModerationMode') === 'llm';
    if (llmModeration && !consume(`market-review:${user.id}`, 6, 60_000)) return json(res, 429, { error: 'rate_limited', message: '提交审核过于频繁，请稍后重试。' });
    const source = sourceFromBody(req.body);
    const sourceIssue = marketSourceIssue(source);
    if (sourceIssue) return json(res, 400, { error: 'market_source_rejected', reason: sourceIssue, message: '代码包含市场不允许的内容，请修改后重试。' });
    const marketId = Number(req.body?.marketId || 0);
    const marketName = String(req.body?.marketName || '').trim().slice(0, 124);
    const marketDescription = String(req.body?.marketDescription || '').trim().slice(0, 1000);
    if (!marketName) return json(res, 400, { error: 'name_required', message: '请填写市场名称。' });
    if (!marketDescription) return json(res, 400, { error: 'description_required', message: '请填写市场说明。' });
    if (!source || Buffer.byteLength(source, 'utf8') > MAX_SOURCE) return json(res, 400, { error: 'invalid_script', message: '代码不能为空且不能超过 48 KiB。' });
    if (!validJavaScript(source)) return json(res, 400, { error: 'invalid_javascript', message: '代码存在 JavaScript 语法错误。' });
    const marketTags = JSON.stringify((Array.isArray(req.body?.marketTags) ? req.body.marketTags : String(req.body?.marketTags || '').split(',')).map((tag) => String(tag).trim().slice(0, 40)).filter(Boolean).slice(0, 12));
    let submittedId;
    if (marketId) {
      const existing = ctx.db.prepare(`SELECT id,status,owner_user_id FROM ${marketScripts} WHERE id=? AND owner_user_id=?`).get(marketId, user.id);
      if (!existing) return json(res, 404, { error: 'not_found', message: '市场脚本不存在或无权编辑。' });
      ctx.db.prepare(`UPDATE ${marketScripts} SET pending_name=?,pending_description=?,pending_tags=?,pending_source=?,pending_hash=?,pending_checksum=?,pending_status='pending',updated_at=datetime('now') WHERE id=?`).run(marketName, marketDescription, marketTags, source, hash(source), checksum(source), marketId);
      submittedId = marketId;
    } else {
      const inserted = ctx.db.prepare(`INSERT INTO ${marketScripts} (owner_user_id,name,description,tags,source,hash,checksum,status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`).run(user.id,marketName,marketDescription,marketTags,source,hash(source),checksum(source));
      submittedId = inserted.lastInsertRowid;
    }
    log(user.id, 'market.submit', String(submittedId));
    let review = null;
    if (llmModeration) {
      review = await llmReview(submittedId);
      if (review && !applyMarketDecision(submittedId, review.decision, review.snapshot)) review = null;
    }
    const current = ctx.db.prepare(`SELECT status,pending_status FROM ${marketScripts} WHERE id=?`).get(submittedId);
    const status = current?.pending_status === 'pending' || current?.pending_status === 'rejected' ? current.pending_status : current?.status || 'pending';
    if (browserForm && req.body?._csrf && !wantsJson(req)) return res.redirect('/jslab-cloud/workspace?panel=publications');
    return json(res, 200, { status, marketId: submittedId, review: review && { decision: review.decision, reason: review.reason }, message: '市场脚本已提交审核。' });
  };
  const listMarket = (req, res) => {
    const query = `%${String(req.query?.q || '').slice(0, 80)}%`;
    const scripts = ctx.db.prepare(`SELECT id,name,description,tags,updated_at FROM ${marketScripts} WHERE status='published' AND (name LIKE ? OR description LIKE ?) ORDER BY updated_at DESC LIMIT 50`).all(query, query);
    return json(res, 200, { scripts });
  };
  const getMarketSource = (req, res) => {
    const row = ctx.db.prepare(`SELECT id,owner_user_id,name,description,tags,source,hash,checksum,updated_at FROM ${marketScripts} WHERE id=? AND status='published'`).get(Number(req.params.id));
    if (!row) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { script: { ...row, filename: scriptFilename(row.name) } });
  };
  const reportMarket = (req, res) => {
    const user = currentUser(req);
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!reason) return json(res, 400, { error: 'reason_required' });
    const row = ctx.db.prepare(`SELECT id FROM ${marketScripts} WHERE id=? AND status='published'`).get(Number(req.params.id));
    if (!row) return json(res, 404, { error: 'not_found' });
    ctx.db.prepare(`INSERT INTO ${reports} (script_id,user_id,reason) VALUES (?, ?, ?)`).run(row.id, user.id, reason);
    log(user.id, 'market.report', String(row.id));
    if (req.body?._csrf && !wantsJson(req)) return res.redirect(`/jslab-cloud/workspace/market/${row.id}`);
    return json(res, 200, { reported: true, message: '举报已提交。' });
  };
  return { marketSnapshot, reviewContentHash, applyMarketDecision, submitMarket, listMarket, getMarketSource, reportMarket };
}

module.exports = { createMarketService };
