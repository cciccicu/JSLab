function registerAdminPages(state, services) {
  const { ctx, marketScripts, reviews, reports, entitlements, aiUsage,
    currentUser, escapeHtml, formatCredit, log, assetsVersion } = state;
  const { marketSnapshot, reviewContentHash, applyMarketDecision, reportSnapshot, resolveMarketReport } = services.market;
  const { issueActivationCodes } = services.activation;
  const encodeReviewSnapshot = snapshot => Buffer.from(JSON.stringify(snapshot), 'utf8').toString('base64');
  const reportStatusLabels = { pending: '待处理', dismissed: '已忽略', taken_down: '已下架' };
  const renderAdminPage = (req, res, issued) => {
    const rows = ctx.db.prepare(`SELECT * FROM ${marketScripts} WHERE status IN ('pending','rejected') OR pending_status IN ('pending','rejected') ORDER BY updated_at`).all().map(row => {
      const snapshot = marketSnapshot(row);
      const review = ctx.db.prepare(`SELECT decision,reason FROM ${reviews} WHERE script_id=? AND content_hash=? ORDER BY id DESC LIMIT 1`).get(row.id, reviewContentHash(snapshot));
      return { ...row, name: snapshot.name, review_snapshot: encodeReviewSnapshot(snapshot), llm_decision: review?.decision, llm_reason: review?.reason };
    });
    const entitlementSummary = ctx.db.prepare(`SELECT COUNT(*) AS activated, COALESCE(SUM(ai_credit_cents), 0) AS credit_cents FROM ${entitlements} WHERE cloud_enabled=1 AND ai_enabled=1`).get();
    const usageSummary = ctx.db.prepare(`SELECT COALESCE(SUM(total_tokens),0) AS tokens,COALESCE(SUM(charged_cents),0) AS charged_cents FROM ${aiUsage}`).get();
    const reportRows = ctx.db.prepare(`SELECT r.*,s.name FROM ${reports} r LEFT JOIN ${marketScripts} s ON s.id=r.script_id ORDER BY (r.status='pending') DESC,r.id DESC LIMIT 20`).all();
    const token = escapeHtml(ctx.security.csrfToken(req));
    const items = rows.map((row) => `<tr><td><a href="/admin/jslab-cloud/scripts/${row.id}"><strong>${escapeHtml(row.name)}</strong><span class="d-block small">查看源码</span></a>${row.pending_status ? '<small class="d-block text-body-secondary">已发布内容的更新，审核通过前线上版本不变</small>' : ''}</td><td data-label="审核状态">${row.llm_decision ? `<span class="badge text-bg-${row.llm_decision === 'approve' ? 'success' : 'danger'}">${row.llm_decision === 'approve' ? 'LLM 已通过' : 'LLM 建议拒绝'}</span><small class="d-block text-body-secondary">${escapeHtml(row.llm_reason)}</small>${row.llm_decision === 'reject' ? '<small class="d-block text-body-secondary">可由管理员人工复核并通过。</small>' : ''}` : `<span class="text-body-secondary">${ctx.config.get('marketModerationMode') === 'llm' ? 'LLM 暂未给出有效结论' : '等待人工审核'}</span>`}</td><td class="text-end jslab-cloud-record-actions"><form method="post" action="/admin/jslab-cloud/scripts/${row.id}/review" class="jslab-cloud-admin-actions"><input type="hidden" name="_csrf" value="${token}"><input type="hidden" name="review_snapshot" value="${escapeHtml(row.review_snapshot)}"><button name="status" value="published" class="btn btn-sm btn-outline-primary">人工通过</button><button name="status" value="rejected" class="btn btn-sm btn-outline-danger">人工拒绝</button></form></td></tr>`).join('');
    const reportItems = reportRows.map((row) => `<tr><td><a href="/admin/jslab-cloud/reports/${row.id}">${escapeHtml(row.name || `已删除的脚本 #${row.script_id}`)}</a></td><td data-label="举报原因">${escapeHtml(row.reason)}</td><td data-label="处理状态">${reportStatusLabels[row.status]}</td><td class="text-body-secondary" data-label="提交时间">${escapeHtml(row.created_at)}</td><td class="text-end jslab-cloud-record-actions"><a class="btn btn-sm btn-outline-primary" href="/admin/jslab-cloud/reports/${row.id}">${row.status === 'pending' ? '查看并处理' : '查看记录'}</a></td></tr>`).join('');
    const issuedCodes = issued && issued.codes && issued.codes.length
      ? `<div class="card jslab-cloud-admin-section"><div class="card-body"><h3 class="h5">已生成激活码</h3><p>请立即复制保存，系统只会保留激活码哈希。</p><textarea class="form-control font-monospace" rows="${Math.min(16, issued.codes.length + 1)}" readonly>${escapeHtml(issued.codes.join('\n'))}</textarea><p class="text-body-secondary mb-0">批次 ${escapeHtml(issued.batchId)} · 共 ${issued.codes.length} 个激活码。</p></div></div>`
      : '';
    ctx.render.adminPage(req, res, `<link rel="stylesheet" href="/jslab-cloud/assets/jslab-cloud.css?v=${assetsVersion}"><div class="jslab-cloud-admin"><div class="page-title"><div><h2>JSLab Cloud 管理</h2><p>管理账户激活、AI 用量和市场审核。</p></div><div class="plugin-actions"><a class="btn btn-outline-primary" href="/admin/jslab-cloud/downloads">安装包下载</a></div></div><div class="jslab-cloud-admin-summary"><div><span>已激活账户</span><strong>${entitlementSummary.activated}</strong></div><div><span>剩余 JSLab 额度</span><strong>¥${formatCredit(entitlementSummary.credit_cents)}</strong></div><div><span>已计费 Token</span><strong>${Number(usageSummary.tokens).toLocaleString()}</strong></div><div><span>AI 费用</span><strong>¥${formatCredit(usageSummary.charged_cents)}</strong></div></div><div class="card jslab-cloud-admin-section"><div class="card-body"><h3 class="h5">批量生成激活码</h3><p class="text-body-secondary">首次兑换激活云空间和 AI，并赠送 ¥2.00；后续每个激活码增加 ¥3.00。</p><form method="post" action="/admin/jslab-cloud/activation-codes" class="jslab-cloud-inline-form"><input type="hidden" name="_csrf" value="${token}"><label class="visually-hidden" for="activation-count">生成数量</label><input id="activation-count" class="form-control" type="number" min="1" max="500" name="count" value="10" required><button class="btn btn-outline-primary">生成激活码</button></form></div></div>${issuedCodes}<div class="card jslab-cloud-admin-section"><div class="card-header"><h3 class="h5 mb-0">市场审核</h3></div><div class="table-responsive"><table class="table align-middle mb-0 jslab-cloud-record-table" role="table"><thead><tr><th scope="col">脚本</th><th scope="col">审核状态</th><th scope="col"><span class="visually-hidden">操作</span></th></tr></thead><tbody>${items || '<tr><td colspan="3" class="text-body-secondary">暂无待审核脚本。</td></tr>'}</tbody></table></div></div><div class="card jslab-cloud-admin-section" id="market-reports"><div class="card-header"><h3 class="h5 mb-0">脚本举报</h3><p class="small text-body-secondary mb-0">待处理优先，显示最近 20 条记录。</p></div><div class="table-responsive"><table class="table align-middle mb-0 jslab-cloud-record-table" role="table"><thead><tr><th scope="col">脚本</th><th scope="col">原因</th><th scope="col">状态</th><th scope="col">提交时间</th><th scope="col"><span class="visually-hidden">操作</span></th></tr></thead><tbody>${reportItems || '<tr><td colspan="5" class="text-body-secondary">暂无举报。</td></tr>'}</tbody></table></div></div></div>`, { page_title: 'JSLab Cloud 管理' });
  };
  ctx.routes.admin.get('/', ctx.users.requireAdmin, (req, res) => renderAdminPage(req, res));
  ctx.routes.admin.get('/reports/:id', ctx.users.requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).send('未找到举报记录。');
    const report = ctx.db.prepare(`SELECT * FROM ${reports} WHERE id=?`).get(id);
    if (!report) return res.status(404).send('未找到举报记录。');
    const row = ctx.db.prepare(`SELECT * FROM ${marketScripts} WHERE id=?`).get(report.script_id);
    const published = row?.status === 'published';
    const resolvedBy = report.resolved_by ? ctx.users.get(report.resolved_by) : null;
    const actions = report.status === 'pending'
      ? `<form method="post" action="/admin/jslab-cloud/reports/${id}/resolve" class="jslab-cloud-admin-actions"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.security.csrfToken(req))}">${published ? `<input type="hidden" name="report_snapshot" value="${reportSnapshot(row)}"><button name="action" value="takedown" class="btn btn-outline-danger">下架脚本</button>` : ''}<button name="action" value="dismiss" class="btn btn-outline-secondary">忽略举报</button></form>`
      : `<p class="text-body-secondary">处理人：${escapeHtml(resolvedBy?.display_name || resolvedBy?.username || `用户 ${report.resolved_by}`)} · 处理时间：${escapeHtml(report.resolved_at)}</p>`;
    return ctx.render.adminPage(req, res, `<link rel="stylesheet" href="/jslab-cloud/assets/jslab-cloud.css?v=${assetsVersion}">
      <section class="plugin-page jslab-cloud-page jslab-cloud-admin">
        <header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">处理脚本举报</h1><p class="plugin-page-description">${escapeHtml(row?.name || `已删除的脚本 #${report.script_id}`)} · ${reportStatusLabels[report.status]}</p></div><div class="plugin-actions"><a class="btn btn-outline-secondary" href="/admin/jslab-cloud#market-reports">返回举报列表</a></div></header>
        <div><h2 class="h5">举报原因</h2><p class="text-break">${escapeHtml(report.reason)}</p><p class="text-body-secondary">提交时间：${escapeHtml(report.created_at)}</p></div>
        ${row ? `<div><h2 class="h5">脚本说明</h2><p class="text-break">${escapeHtml(row.description)}</p></div><div class="card jslab-cloud-source-card"><div class="card-header"><h2 class="h5 mb-0">${published ? '当前公开版本源码' : '脚本源码（未公开发布）'}</h2></div><pre class="jslab-cloud-source" tabindex="0" aria-label="脚本源码"><code>${escapeHtml(row.source)}</code></pre></div>` : '<p>脚本已删除，无需下架。</p>'}
        ${report.status === 'pending' && published ? '<p class="text-body-secondary">下架后，脚本将从市场移除，待审核的更新也会被拒绝。忽略举报会保留脚本当前状态。</p>' : ''}
        <div class="plugin-actions">${actions}</div>
      </section>`, { page_title: '处理脚本举报' });
  });
  ctx.routes.admin.post('/reports/:id/resolve', ctx.users.requireAdmin, ctx.security.csrfProtection, resolveMarketReport);
  ctx.routes.admin.get('/scripts/:id', ctx.users.requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).send('未找到市场脚本');
    const row = ctx.db.prepare(`SELECT * FROM ${marketScripts} WHERE id=?`).get(id);
    if (!row) return res.status(404).send('未找到市场脚本');
    const snapshot = marketSnapshot(row);
    const source = row.pending_status != null ? row.pending_source : row.source;
    const status = row.pending_status != null ? row.pending_status : row.status;
    const needsReview = status === 'pending' || status === 'rejected';
    const statusLabels = { pending: '待审核', rejected: '已拒绝', published: '已发布', draft: '草稿' };
    const author = ctx.users.get(row.owner_user_id);
    const review = ctx.db.prepare(`SELECT decision,reason FROM ${reviews} WHERE script_id=? AND content_hash=? ORDER BY id DESC LIMIT 1`).get(id, reviewContentHash(snapshot));
    const llmResult = review
      ? `<p class="text-body-secondary mb-0"><strong>${review.decision === 'approve' ? 'LLM 已通过' : 'LLM 建议拒绝'}：</strong>${escapeHtml(review.reason)}</p>`
      : '';
    const previousSource = row.status === 'published' && row.pending_status != null
      ? `<details><summary>查看当前已发布版本</summary><pre class="jslab-cloud-source mt-3"><code>${escapeHtml(row.source)}</code></pre></details>`
      : '';
    const actions = needsReview
      ? `<form method="post" action="/admin/jslab-cloud/scripts/${id}/review" class="jslab-cloud-admin-actions"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.security.csrfToken(req))}"><input type="hidden" name="review_snapshot" value="${escapeHtml(encodeReviewSnapshot(snapshot))}"><button name="status" value="published" class="btn btn-outline-primary">人工通过</button><button name="status" value="rejected" class="btn btn-outline-danger">人工拒绝</button></form>`
      : '';
    return ctx.render.adminPage(req, res, `<link rel="stylesheet" href="/jslab-cloud/assets/jslab-cloud.css?v=${assetsVersion}">
      <section class="plugin-page jslab-cloud-page jslab-cloud-admin">
        <header class="plugin-page-header plugin-page-heading">
          <div><h1 class="plugin-page-heading-title">${escapeHtml(snapshot.name)}</h1>
            <p class="plugin-page-description">${escapeHtml(snapshot.description)}</p>
            <p class="text-body-secondary mb-0">作者：${escapeHtml(author?.display_name || author?.username || `用户 ${row.owner_user_id}`)} · ${escapeHtml(statusLabels[status] || status)}</p>
          </div>
          <div class="plugin-actions"><a class="btn btn-outline-secondary" href="/admin/jslab-cloud">返回审核列表</a></div>
        </header>
        ${row.pending_status != null ? '<p class="text-body-secondary mb-0">以下为本次提交的更新内容，审核通过前线上版本不变。</p>' : ''}
        ${llmResult}
        <div class="card jslab-cloud-source-card"><div class="card-header"><h2 class="h5 mb-0">${needsReview ? '待审核源码' : '脚本源码'}</h2></div><pre class="jslab-cloud-source" tabindex="0" aria-label="脚本源码"><code>${escapeHtml(source)}</code></pre></div>
        ${previousSource}
        <div class="plugin-actions">${actions}</div>
      </section>`, { page_title: '市场脚本审核' });
  });
  ctx.routes.admin.post('/activation-codes', ctx.users.requireAdmin, ctx.security.csrfProtection, (req, res) => {
    const admin = currentUser(req); const issued = issueActivationCodes(admin.id, req.body?.count);
    renderAdminPage(req, res, issued);
  });
  ctx.routes.admin.post('/scripts/:id/review', ctx.users.requireAdmin, ctx.security.csrfProtection, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).send('未找到市场脚本');
    const row = ctx.db.prepare(`SELECT * FROM ${marketScripts} WHERE id=?`).get(id);
    if (!row) return res.status(404).send('未找到市场脚本');
    const snapshot = marketSnapshot(row);
    if (typeof req.body?.review_snapshot !== 'string' || req.body.review_snapshot !== encodeReviewSnapshot(snapshot)) {
      return res.status(409).send('脚本内容已更新，请刷新页面后重新审核。');
    }
    const decision = req.body?.status === 'published' ? 'approve' : 'reject';
    if (!applyMarketDecision(id, decision, snapshot)) return res.status(409).send('脚本内容已更新或已删除，请刷新页面后重新审核。');
    log(currentUser(req).id, 'market.review', `${id}:${decision}`);
    return res.redirect('/admin/jslab-cloud');
  });
}

module.exports = { registerAdminPages };
