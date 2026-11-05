const { BAND_BBS_CHANNELS } = require('./browser-downloads');
const { renderPromptDownload } = require('./browser-prompt-download');

function registerHomePage(ctx, options, view) {
  const { downloads, escapeHtml } = options;
  ctx.routes.frontend.get('/', async (req, res) => {
    const android = (await downloads.list()).find(item => item.id === 'android');
    const androidLink = android
      ? `<a href="${escapeHtml(android.url)}" download aria-label="下载 Android 同步器"><span>Android 同步器</span><span aria-hidden="true">↓</span></a>`
      : '<span class="jslab-home-unavailable" aria-disabled="true">Android 同步器暂未提供</span>';
    return view.page(req, res, `
      <section class="plugin-page jslab-cloud-page jslab-public jslab-home-page">
        <div class="jslab-home-hero">
          <div class="jslab-home-intro">
            <div class="jslab-home-brand"><img src="/jslab-cloud/assets/jslab-mark.png" width="48" height="48" alt=""><span>JSLab<small>JAVASCRIPT ON YOUR WRIST</small></span></div>
            <h1>把 JavaScript<br><span>带到手腕上。</span></h1>
            <p class="jslab-home-lead">在小米手环 Pro 与红米手表上编写、运行和分享脚本。</p>
            <div class="jslab-home-actions">
              <a class="btn btn-outline-primary" href="/jslab-cloud/workspace">进入云空间 <span aria-hidden="true">↗</span></a>
              <a class="btn btn-outline-secondary" href="/jslab-cloud/downloads">全部下载 <span aria-hidden="true">↗</span></a>
              <a class="btn btn-outline-secondary" href="https://github.com/cciccicu/JSLab" target="_blank" rel="noopener noreferrer" aria-label="GitHub 源码（在新标签页打开）">GitHub 源码 <span aria-hidden="true">↗</span></a>
            </div>
            <div class="jslab-home-quickstart" aria-labelledby="jslab-get-title">
              <h2 id="jslab-get-title">获取 JSLab 与同步器</h2>
              <div class="jslab-home-quick-grid">
                <a href="${escapeHtml(downloads.astroboxUrl())}" target="_blank" rel="noopener noreferrer"><span>AstroBox 获取</span><span aria-hidden="true">↗</span></a>
                <a href="${BAND_BBS_CHANNELS[0].url}" target="_blank" rel="noopener noreferrer"><span>米坛 · 小米手环 Pro</span><span aria-hidden="true">↗</span></a>
                <a href="${BAND_BBS_CHANNELS[1].url}" target="_blank" rel="noopener noreferrer"><span>米坛 · 红米手表</span><span aria-hidden="true">↗</span></a>
                ${androidLink}
                ${renderPromptDownload()}
              </div>
            </div>
            <p class="jslab-home-support">支持小米手环 Pro 系列与红米手表系列</p>
          </div>
          <figure class="jslab-home-preview" aria-label="JSLab 手环界面示例">
            <div class="jslab-home-preview-top"><span>JSLAB / ON WRIST</span><span>01 — 03</span></div>
            <div class="jslab-home-screens"><div class="jslab-home-screen"><img src="/jslab-cloud/assets/jslab-screen-scripts-20261009.png" width="336" height="480" alt="手环上的 JSLab 脚本列表"></div><div class="jslab-home-screen jslab-home-screen-editor"><img src="/jslab-cloud/assets/jslab-screen-code-20261009.png" width="336" height="480" alt="手环上的 JavaScript 编辑器"></div><div class="jslab-home-screen"><img src="/jslab-cloud/assets/jslab-screen-market-20261009.png" width="336" height="480" alt="手环上的 JS 市场"></div></div>
            <figcaption>腕上编写，随时运行。<span>界面示例</span></figcaption>
          </figure>
        </div>
        <section class="jslab-home-section jslab-home-features" aria-labelledby="jslab-features-title">
          <div class="jslab-home-section-heading"><div><p class="jslab-public-kicker">MADE FOR MAKING</p><h2 id="jslab-features-title">小小屏幕，也有大把可能</h2></div><a href="/jslab-cloud/docs">查看使用文档 <span aria-hidden="true">↗</span></a></div>
          <div class="jslab-home-feature-grid">
            <article><span>01</span><h3>腕上创作</h3><p>在设备上新建、编辑并运行 JavaScript 脚本。</p></article>
            <article><span>02</span><h3>自由传输</h3><p>通过 AstroBox 或 Android 同步器管理脚本。</p></article>
            <article><span>03</span><h3>云端工作</h3><p>手动保存到云空间，也可借助 AI 生成代码。</p></article>
            <article><span>04</span><h3>发现与分享</h3><p>浏览 JS 市场，将自己的作品分享给其他人。</p></article>
          </div>
        </section>
        <div class="jslab-home-footer"><span>想法不必等到回到电脑前。</span><a href="/jslab-cloud/downloads">开始使用 JSLab <span aria-hidden="true">↗</span></a></div>
      </section>`, 'JSLab');
  });
}

module.exports = { registerHomePage };
