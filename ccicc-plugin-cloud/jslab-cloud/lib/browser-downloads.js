const { DOWNLOAD_SLOTS, normalizeAstroboxResourceUrl } = require('./release-downloads');
const { renderPromptDownload } = require('./browser-prompt-download');

const sizeLabel = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
const versionLabel = item => item.versionName ? `v${item.versionName}` : '版本未标注';
const BAND_BBS_CHANNELS = Object.freeze([
  { device: '小米手环Pro系列', url: 'https://www.bandbbs.cn/resources/8607/' },
  { device: '红米手表系列', url: 'https://www.bandbbs.cn/resources/8733/' }
]);

function renderDownloadChannels(downloads, escapeHtml) {
  const badge = `<a class="jslab-cloud-astrobox-badge" href="${escapeHtml(downloads.astroboxUrl())}" target="_blank" rel="noopener noreferrer" aria-label="从 AstroBox 获取 JSLab 社区版"><img src="/jslab-cloud/assets/astrobox-get-zhcn.svg" alt="从 AstroBox 获取" width="234" height="46"><span class="jslab-cloud-channel-caption">社区版</span></a>`;
  const bandbbs = BAND_BBS_CHANNELS.map(item => `<a class="jslab-cloud-channel-link" href="${item.url}" target="_blank" rel="noopener noreferrer" aria-label="从米坛社区获取 JSLab ${item.device}版"><img src="/jslab-cloud/assets/bandbbs-get-zhcn.svg" alt="从米坛社区获取" width="234" height="46"><span class="jslab-cloud-channel-caption">${item.device}</span></a>`).join('');
  return badge + bandbbs;
}

async function renderDownloadBanner(downloads, escapeHtml) {
  if (!downloads.enabled()) return '';
  const items = await downloads.list();
  if (!items.length) return '';
  const links = items.map(item => `<a class="btn btn-outline-primary jslab-cloud-download-link" href="${item.url}" download><span>${escapeHtml(item.label)}</span><span class="jslab-cloud-download-size">${escapeHtml(versionLabel(item))} · ${sizeLabel(item.size)}</span></a>`).join('');
  return `<aside class="jslab-cloud-download-banner" data-jslab-download-banner="channels-v2-${downloads.revision(items)}" aria-label="应用与同步器下载"><div class="jslab-cloud-download-banner-header"><div class="jslab-cloud-download-banner-content"><h2 class="jslab-cloud-download-title"><a href="/jslab-cloud/downloads">下载 JSLab 与同步器</a></h2><p class="jslab-cloud-download-description">按设备选择完整版或社区版；使用脚本数据编辑功能时，请同时更新设备端与同步器。</p></div><button class="btn btn-sm btn-outline-secondary jslab-cloud-download-dismiss" type="button" data-jslab-download-dismiss aria-label="关闭下载横幅">关闭</button></div><div class="jslab-cloud-download-row"><p class="jslab-cloud-download-label">直接下载</p><div class="jslab-cloud-download-links">${links}</div></div><div class="jslab-cloud-download-row"><p class="jslab-cloud-download-label">社区渠道</p><div class="jslab-cloud-download-links">${renderDownloadChannels(downloads, escapeHtml)}</div></div></aside>`;
}

function registerDownloadPage(ctx, options, view) {
  const { downloads, escapeHtml } = options;
  if (!downloads) return;
  ctx.routes.frontend.get('/downloads', async (req, res) => {
    const available = new Map((await downloads.list()).map(item => [item.id, item]));
    const arrow = '<svg class="jslab-public-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v11m-4-4 4 4 4-4M4 17v3h16v-3"/></svg>';
    const choice = (id, label, device) => {
      const item = available.get(id);
      if (!item) return `<span class="jslab-download-choice is-unavailable" aria-disabled="true"><span>${label}</span><small>暂未提供</small></span>`;
      return `<a class="jslab-download-choice" href="${escapeHtml(item.url)}" download aria-label="下载${device}${label} ${escapeHtml(versionLabel(item))}"><span>${label}<span class="jslab-download-version">${escapeHtml(versionLabel(item))}</span></span><small>${sizeLabel(item.size)}</small>${arrow}</a>`;
    };
    const android = available.get('android');
    const androidAction = android
      ? `<a class="jslab-download-android-action" href="${escapeHtml(android.url)}" download aria-label="下载 Android 同步器 ${escapeHtml(versionLabel(android))}"><span>下载 APK<span class="jslab-download-version">${escapeHtml(versionLabel(android))}</span></span><small>${sizeLabel(android.size)}</small>${arrow}</a>`
      : '<span class="jslab-download-android-action is-unavailable" aria-disabled="true">暂未提供</span>';
    return view.page(req, res, `
      <section class="plugin-page jslab-cloud-page jslab-public jslab-download-page">
        <header class="jslab-download-header">
          <div><p class="jslab-public-kicker">JSLAB / DOWNLOADS</p><h1>下载 JSLab</h1><p>选择设备与版本，即可开始。</p></div>
          <a class="jslab-public-back" href="/jslab-cloud/">返回首页 <span aria-hidden="true">↗</span></a>
        </header>
        <div class="jslab-download-devices" aria-label="选择手环或手表安装包">
          <section class="jslab-download-device" aria-labelledby="jslab-device-pro">
            <header><span class="jslab-download-device-mark" aria-hidden="true">PRO</span><div><h2 id="jslab-device-pro">小米手环 Pro</h2><p>Pro 系列</p></div></header>
            <div class="jslab-download-choices">${choice('full-pro', '完整版', '小米手环 Pro')}${choice('community-pro', '社区版', '小米手环 Pro')}</div>
          </section>
          <section class="jslab-download-device" aria-labelledby="jslab-device-rw">
            <header><span class="jslab-download-device-mark" aria-hidden="true">RW</span><div><h2 id="jslab-device-rw">红米手表</h2><p>REDMI Watch</p></div></header>
            <div class="jslab-download-choices">${choice('full-rw', '完整版', 'REDMI Watch')}${choice('community-rw', '社区版', 'REDMI Watch')}</div>
          </section>
        </div>
        <section class="jslab-download-android" aria-labelledby="jslab-download-android-title">
          <div class="jslab-download-android-info"><span class="jslab-download-device-mark" aria-hidden="true">A</span><div><h2 id="jslab-download-android-title">Android 同步器</h2><p>手机编辑与传输脚本</p></div></div>${androidAction}
        </section>
        ${renderPromptDownload()}
        <nav class="jslab-download-more" aria-label="其他获取方式">
          <a href="${escapeHtml(downloads.astroboxUrl())}" target="_blank" rel="noopener noreferrer"><span>AstroBox<small>社区版</small></span><span aria-hidden="true">↗</span></a>
          <a href="${BAND_BBS_CHANNELS[0].url}" target="_blank" rel="noopener noreferrer"><span>米坛社区<small>小米手环 Pro</small></span><span aria-hidden="true">↗</span></a>
          <a href="${BAND_BBS_CHANNELS[1].url}" target="_blank" rel="noopener noreferrer"><span>米坛社区<small>红米手表</small></span><span aria-hidden="true">↗</span></a>
        </nav>
        <p class="jslab-download-note">无需登录即可下载。社区版可选择云服务器。</p>
      </section>`, 'JSLab 下载');
  });
}

function registerDownloadAdmin(state, downloads) {
  const { ctx, escapeHtml, assetsVersion, currentUser, log } = state;
  ctx.routes.admin.get('/downloads', ctx.users.requireAdmin, async (req, res) => {
    const token = escapeHtml(ctx.security.csrfToken(req));
    const available = new Map((await downloads.list()).map(item => [item.id, item]));
    const rows = DOWNLOAD_SLOTS.map(slot => {
      const item = available.get(slot.id);
      const url = `/jslab-cloud/downloads/${slot.id}`;
      const status = item ? `${escapeHtml(versionLabel(item))} · ${sizeLabel(item.size)} · ${item.updatedAt.replace('T', ' ').slice(0, 19)} UTC` : '尚未上传';
      return `<tr data-jslab-download-row><th scope="row">${escapeHtml(slot.label)}<code class="d-block small">${escapeHtml(slot.filename)}</code></th><td data-label="当前文件"><span data-jslab-download-info>${status}</span><a class="d-block${item ? '' : ' d-none'}" href="${url}" data-jslab-download-link>下载当前安装包</a></td><td data-label="上传替换"><form action="/admin/jslab-cloud/downloads/${slot.id}/upload" method="post" data-jslab-download-upload><input type="hidden" name="_csrf" value="${token}"><label class="visually-hidden" for="download-${slot.id}">${escapeHtml(slot.label)}安装包</label><input class="form-control form-control-sm" id="download-${slot.id}" name="package" type="file" accept="${slot.extension}" required><button class="btn btn-sm btn-outline-primary mt-2" type="submit">上传替换</button><p class="small mb-0 mt-2" role="status" aria-live="polite" data-jslab-download-result></p></form></td></tr>`;
    }).join('');
    return ctx.render.adminPage(req, res, `<link rel="stylesheet" href="/jslab-cloud/assets/jslab-cloud.css?v=${assetsVersion}"><script src="/jslab-cloud/assets/jslab-downloads.js?v=${assetsVersion}" defer></script><section class="plugin-page jslab-cloud-page jslab-cloud-admin"><header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">安装包下载</h1><p class="plugin-page-description">管理云空间首页的下载横幅与五个正式安装包。替换后下载地址保持不变。</p></div><div class="plugin-actions"><a class="btn btn-outline-secondary" href="/jslab-cloud/downloads">查看公开下载页</a><a class="btn btn-outline-secondary" href="/admin/jslab-cloud">返回 JSLab 管理</a></div></header>${req.query?.saved === '1' ? '<div class="alert alert-success" role="status">横幅设置已保存。</div>' : ''}<form method="post" action="/admin/jslab-cloud/downloads/settings" class="jslab-cloud-inline-form"><input type="hidden" name="_csrf" value="${token}"><div class="form-check"><input class="form-check-input" type="checkbox" id="downloads-banner-enabled" name="enabled" value="1"${downloads.enabled() ? ' checked' : ''}><label class="form-check-label" for="downloads-banner-enabled">在云空间首页显示下载横幅</label></div><div class="mt-3"><label class="form-label" for="astrobox-resource-url">AstroBox 资源分享链接</label><input class="form-control" id="astrobox-resource-url" name="astroboxResourceUrl" type="url" maxlength="2048" value="${escapeHtml(downloads.astroboxUrl())}"><p class="small text-body-secondary mt-1 mb-2">徽标点击后打开此资源；留空恢复官方源 JSLab 社区版链接。</p></div><button class="btn btn-outline-primary" type="submit">保存设置</button></form><p class="small text-body-secondary">用户可关闭当前横幅；替换安装包后会重新提示。关闭总开关仅隐藏横幅，已有下载地址仍然可用。</p><div class="table-responsive"><table class="table align-middle jslab-cloud-record-table"><thead><tr><th scope="col">下载项</th><th scope="col">当前文件</th><th scope="col">上传替换</th></tr></thead><tbody>${rows}</tbody></table></div><p class="small text-body-secondary">单个安装包最大 50 MiB。上传完整并校验通过后才替换旧文件。</p><details><summary>直接放置文件</summary><p class="small">也可将安装包按表中的固定文件名放入此目录，刷新页面即可识别。该目录独立于插件安装目录，插件更新会保留文件。</p><code>${escapeHtml(downloads.directory() || '请设置插件配置 downloadsDirectory')}</code></details><noscript><p class="text-danger">上传安装包需要启用浏览器 JavaScript；横幅开关仍可正常保存。</p></noscript></section>`, { page_title: '安装包下载' });
  });
  ctx.routes.admin.post('/downloads/settings', ctx.users.requireAdmin, ctx.security.csrfProtection, (req, res) => {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'astroboxResourceUrl')) {
      try { ctx.config.set('astroboxResourceUrl', normalizeAstroboxResourceUrl(req.body.astroboxResourceUrl)); }
      catch (error) { return res.status(400).send(error.message); }
    }
    ctx.config.set('downloadsBannerEnabled', req.body?.enabled === '1');
    log(currentUser(req).id, 'downloads.banner', req.body?.enabled === '1' ? 'enabled' : 'disabled');
    return res.redirect('/admin/jslab-cloud/downloads?saved=1');
  });
  ctx.routes.admin.post('/downloads/:slot/upload', ctx.users.requireAdmin, ctx.security.csrfProtection, async (req, res) => {
    try {
      const item = await downloads.upload(req.params.slot, req);
      log(currentUser(req).id, 'downloads.replace', item.id);
      return res.json({ ok: true, message: `${item.label}已替换。`, file: { size: item.size, updatedAt: item.updatedAt, url: item.url, versionName: item.versionName, downloadName: item.downloadName } });
    } catch (error) {
      if (!error.status) ctx.logger?.warn({ err: error }, '安装包上传失败');
      return res.status(error.status || 500).json({ ok: false, message: error.status ? error.message : '安装包保存失败，旧文件已保留，请检查下载目录的写入权限后重试。' });
    }
  });
}

module.exports = { renderDownloadBanner, registerDownloadAdmin, registerDownloadPage, BAND_BBS_CHANNELS };
