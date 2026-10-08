const { withErrorMessage } = require('./error-messages');

function createBrowserView(ctx, options) {
  const { escapeHtml } = options;
  const assetVersion = options.assetsVersion;
  const assets = () => `<link rel="stylesheet" href="/jslab-cloud/assets/jslab-cloud.css?v=${assetVersion}"><script src="/jslab-cloud/assets/jslab-cloud.js?v=${assetVersion}" defer></script>`;
  const csrf = (req) => escapeHtml(ctx.security.csrfToken(req));
  const escAttr = (value) => escapeHtml(value).replace(/`/g, '&#96;');
  const page = (req, res, content, title) => ctx.render.withLayout(req, res, `${assets()}${content}`, { page_title: title });
  const button = (label, href, className = 'btn btn-outline-primary') => `<a class="${className}" href="${escAttr(href)}">${escapeHtml(label)}</a>`;
  const isAjax = (req) => String(req.headers?.accept || '').includes('application/json') || req.body?.ajax === '1';
  const json = (res, status, body) => {
    const responseBody = withErrorMessage(body);
    if (typeof res.status === 'function') res.status(status);
    if (typeof res.json === 'function') return res.json(responseBody);
    res.setHeader?.('Content-Type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify(responseBody));
  };
  const modal = (id, title, body, size = '') => `<div class="modal fade jslab-cloud-modal" id="${id}" tabindex="-1" aria-labelledby="${id}-title" aria-hidden="true"><div class="modal-dialog modal-dialog-scrollable ${size}"><div class="modal-content"><div class="modal-header"><h2 class="modal-title fs-5" id="${id}-title">${title}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="关闭"></button></div><div class="modal-body">${body}</div></div></div></div>`;
  const statusBadge = (status) => {
    const labels = { published: '已发布', pending: '待审核', rejected: '已拒绝', draft: '草稿' };
    return `<span class="badge text-bg-${status === 'published' ? 'success' : status === 'pending' ? 'warning' : status === 'rejected' ? 'danger' : 'secondary'}">${labels[status] || labels.draft}</span>`;
  };
  const marketForm = (req) => `<form method="post" action="/jslab-cloud/api/cloud/market/submit" data-cloud-ajax data-cloud-publish-form><input type="hidden" name="_csrf" value="${csrf(req)}"><input type="hidden" name="ajax" value="1"><div class="mb-3"><label class="form-label" for="cloud-market-name">市场名称</label><input id="cloud-market-name" class="form-control" name="marketName" maxlength="124" required></div><div class="mb-3"><label class="form-label" for="cloud-market-description">市场说明</label><textarea id="cloud-market-description" class="form-control" name="marketDescription" maxlength="1000" required></textarea></div><div class="mb-3"><label class="form-label" for="cloud-market-tags">标签</label><input id="cloud-market-tags" class="form-control" name="marketTags" placeholder="工具, 示例"></div><div class="mb-3"><label class="form-label" for="cloud-market-source">代码</label><textarea id="cloud-market-source" class="form-control jslab-cloud-code" name="source" rows="16" required></textarea></div><p class="small text-body-secondary">市场内容是独立快照。来自云空间时只自动填入代码，其他信息仍需填写。</p><button class="btn btn-primary" type="submit">提交审核</button></form>`;
  return { csrf, escAttr, page, button, isAjax, json, modal, statusBadge, marketForm };
}

module.exports = { createBrowserView };
