const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');
const { buildAiPromptMarkdown, LATEST_PROMPT_VERSION } = require('./ai-prompts');
const { renderPromptDownload } = require('./browser-prompt-download');
const DOC_GROUPS = [
  ...require('../generated/docs/navigation.json'),
  { id: 'about-jslab', title: '了解 JSLab', description: '项目原理、核心设计与开源代码' }
];

const DOCS = [
  { group: 'getting-started', slug: 'installation', title: '选择版本与安装', description: '认识 JSLab，选择设备安装包，准备需要的配套工具。' },
  { group: 'getting-started', slug: 'getting-started', title: '第一次使用 JSLab', description: '认识首页，创建并运行一个计数器，理解保存与运行的区别。' },
  { group: 'watch-guide', slug: 'watch-guide', title: '管理脚本与使用编辑器', description: '选择文件、编辑和备份代码，调整字号与高亮，清除脚本记录。' },
  { group: 'watch-guide', slug: 'troubleshooting', title: '常见问题与排查', description: '从保存、连接、配对和设备支持入手，找到下一步该做什么。' },
  { group: 'tools-support', slug: 'cloud-guide', title: '云账户与云空间', description: '配对设备、激活账户，在网页编辑并与设备主动交换文件。' },
  { group: 'tools-support', slug: 'sync-guide', title: '手机与 AstroBox 同步', description: '连接 Android 同步器或 AstroBox 插件，管理源码、脚本数据和网络桥接。' },
  { group: 'tools-support', slug: 'ai-guide', title: '使用 AI 生成和改写代码', description: '选择生成方式、描述需求、检查结果，也可下载提示词供其他 AI 使用。' },
  { group: 'sharing', slug: 'market-guide', title: '发现与分享市场作品', description: '浏览、下载、点赞、提交审核，以及更新或撤下自己的作品。' },
  { group: 'sharing', slug: 'rpk-guide', title: '导出为独立应用', description: '将已保存的脚本打包为 RPK，选择设备、保存签名并安装更新。' },
  { group: 'script-api', slug: 'script-basics', title: '脚本基础与运行控制', description: '了解可用对象、异步操作、日志、重新运行和退出。' },
  { group: 'script-api', slug: 'script-storage', title: '保存数据与设置', description: '让脚本记住记录和偏好，理解文件名、备份与删除的关系。' },
  { group: 'script-api', slug: 'runtime-api', title: '对话框与用户输入', description: '询问文字或数字、选择选项和确认操作，正确处理取消。' },
  { group: 'script-api', slug: 'ui-api', title: '制作交互界面', description: '排列文字和按钮，用状态、开关、滑块和二维码构建小工具。' },
  { group: 'script-api', slug: 'ui-images', title: '显示图片', description: '显示本地或网络图片，用简短的 Base64 示例添加小图标。' },
  { group: 'script-api', slug: 'ui-canvas', title: '绘制画布', description: '创建画布、绘制图形、提交显示，并读取或复制像素。' },
  { group: 'system-api', slug: 'system-api', title: '设备接口使用说明', description: '先了解能力检查、参数与回调，以及 JSLab 和小米接口的对应关系。' },
  { group: 'system-api', section: 'system-device', slug: 'device-info', title: '设备信息与存储容量', description: '读取型号、屏幕信息和可用空间，区分屏幕尺寸与界面内容宽度。' },
  { group: 'system-api', section: 'system-device', slug: 'files', title: '读写与管理文件', description: '使用本地文件地址读写文字和二进制内容，管理文件与目录。' },
  { group: 'system-api', section: 'system-device', slug: 'display-battery', title: '屏幕、电量与振动', description: '读取亮度和电量，控制常亮或提供振动反馈。' },
  { group: 'system-api', section: 'system-network', slug: 'http', title: '网络请求与连接状态', description: '发送请求、处理状态码和响应数据，查询或监听网络类型。' },
  { group: 'system-api', section: 'system-network', slug: 'file-transfer', title: '下载与上传文件', description: '等待下载任务完成，处理上传进度、取消与返回结果。' },
  { group: 'system-api', section: 'system-network', slug: 'companion', title: '与配套应用通信', description: '查询连接、诊断故障和发送消息，了解共享连接的使用边界。' },
  { group: 'system-api', section: 'system-hardware', slug: 'sensors-location', title: '传感器与定位', description: '读取加速度、气压、方向或位置，并在结束时停止监听。' },
  { group: 'system-api', section: 'system-hardware', slug: 'media', title: '音频播放与录音', description: '设置音频来源、控制播放、限制录音时长并释放资源。' },
  { group: 'system-api', section: 'system-utilities', slug: 'crypto-events', title: '摘要、编码与公共事件', description: '计算摘要、处理 Base64，订阅公共事件并保存取消所需的 ID。' },
  { group: 'about-jslab', slug: 'how-jslab-works', title: '了解 JSLab 原理', description: '深入脚本运行器与原生 UI、设备端增量编辑器、独立快应用打包的实现与设计取舍。' }
];
const DOC_SECTIONS = [
  { id: 'system-device', group: 'system-api', title: '设备与文件' },
  { id: 'system-network', group: 'system-api', title: '网络与通信' },
  { id: 'system-hardware', group: 'system-api', title: '传感器与媒体' },
  { id: 'system-utilities', group: 'system-api', title: '事件与编码' }
];
const DOWNLOADS = ['runtime-api.d.ts', 'ui-api.d.ts', 'jslab-ai-prompt.md'];

function renderDocument(source) {
  const markdown = new MarkdownIt({ html: false, linkify: false });
  const headings = [];
  const defaultHeading = markdown.renderer.rules.heading_open;
  markdown.renderer.rules.heading_open = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const title = tokens[index + 1]?.children
      ?.filter(child => ['text', 'code_inline'].includes(child.type)).map(child => child.content).join('') || '';
    const id = `section-${headings.length + 1}`;
    headings.push({ id, title, level: Number(token.tag.slice(1)) });
    token.attrSet('id', id);
    return defaultHeading ? defaultHeading(tokens, index, options, env, renderer) : renderer.renderToken(tokens, index, options);
  };
  const defaultLink = markdown.renderer.rules.link_open;
  markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const href = token.attrGet('href') || '';
    const local = /^(?:\.\/)?([a-z-]+)\.(md|d\.ts)(#.*)?$/.exec(href);
    if (local && local[2] === 'md' && DOCS.some(doc => doc.slug === local[1])) {
      token.attrSet('href', `/jslab-cloud/docs/${local[1]}${local[3] || ''}`);
    } else if (local && DOWNLOADS.includes(`${local[1]}.${local[2]}`)) {
      token.attrSet('href', `/jslab-cloud/docs/download/${local[1]}.${local[2]}`);
    }
    return defaultLink ? defaultLink(tokens, index, options, env, renderer) : renderer.renderToken(tokens, index, options);
  };
  // Source documents are text: raw HTML stays escaped and unsafe URL schemes are rejected by markdown-it.
  return { html: markdown.render(source), headings };
}

function registerDocsPages(ctx, options, view) {
  const { escapeHtml } = options;
  const { escAttr, page, button } = view;
  const root = path.join(ctx.rootDir || path.resolve(__dirname, '..'), 'generated/docs');
  const documents = DOCS.map(doc => {
    const source = fs.readFileSync(path.join(root, `${doc.slug}.md`), 'utf8');
    return { ...doc, source, ...renderDocument(source) };
  });
  const header = (title, description) => `<header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">${escapeHtml(title)}</h1><p class="plugin-page-description">${escapeHtml(description)}</p></div></header>`;
  const docLink = doc => `/jslab-cloud/docs/${doc.slug}`;
  const groupFor = doc => DOC_GROUPS.find(group => group.id === doc.group);
  const articleLink = (doc, current) => `<a href="${docLink(doc)}"${doc.slug === current ? ' aria-current="page"' : ''}>${escapeHtml(doc.title)}</a>`;
  const branch = (id, title, children, open) => `<li><details class="jslab-cloud-docs-nav-group" data-docs-group="${id}"${open ? ' open' : ''}><summary><span>${escapeHtml(title)}</span><i class="bi bi-chevron-right" aria-hidden="true"></i></summary><ul>${children}</ul></details></li>`;
  const sidebar = (current, query) => {
    const leaf = doc => `<li class="jslab-cloud-docs-nav-article">${articleLink(doc, current?.slug)}</li>`;
    const navigation = DOC_GROUPS.map(group => {
      const articles = documents.filter(doc => doc.group === group.id);
      const children = articles.filter(doc => !doc.section).map(leaf).join('')
        + DOC_SECTIONS.filter(section => section.group === group.id).map(section => branch(
          section.id, section.title, articles.filter(doc => doc.section === section.id).map(leaf).join(''), current?.section === section.id
        )).join('');
      return branch(group.id, group.title, children, current ? current.group === group.id : group.id === 'getting-started');
    }).join('');
    return `<aside class="jslab-cloud-docs-sidebar"><details class="jslab-cloud-docs-navigation" data-docs-navigation open><summary class="jslab-cloud-docs-mobile-toggle"><span><i class="bi bi-list" aria-hidden="true"></i>文档目录与搜索</span><i class="bi bi-chevron-down" aria-hidden="true"></i></summary><div class="jslab-cloud-docs-sidebar-content"><a class="jslab-cloud-docs-brand" href="/jslab-cloud/docs"><i class="bi bi-journal-text" aria-hidden="true"></i><span>JSLab<span>帮助与使用指南</span></span></a><form method="get" action="/jslab-cloud/docs" class="jslab-cloud-docs-search"><label class="visually-hidden" for="docs-search">搜索帮助</label><input id="docs-search" class="form-control" name="q" maxlength="80" value="${escAttr(query || '')}" placeholder="搜索文档"><button class="btn btn-outline-secondary" type="submit" aria-label="搜索"><i class="bi bi-search" aria-hidden="true"></i></button></form><nav class="jslab-cloud-docs-tree" aria-label="文档导航"><a class="jslab-cloud-docs-overview" href="/jslab-cloud/docs"${!current && !query ? ' aria-current="page"' : ''}>帮助首页</a><ul>${navigation}</ul></nav><nav class="jslab-cloud-docs-resources" aria-label="JSLab 相关入口"><a href="/jslab-cloud/downloads"><i class="bi bi-download" aria-hidden="true"></i>下载 JSLab</a><a href="/jslab-cloud/workspace">云空间<i class="bi bi-arrow-up-right" aria-hidden="true"></i></a><a href="/jslab-cloud/workspace/market">JS 市场<i class="bi bi-arrow-up-right" aria-hidden="true"></i></a></nav></div></details></aside>`;
  };
  const layout = (content, current, query) => `<section class="plugin-page jslab-cloud-page jslab-cloud-docs-page"><div class="jslab-cloud-docs-layout">${sidebar(current, query)}<div class="jslab-cloud-docs-body">${content}</div></div></section><script src="/jslab-cloud/assets/jslab-docs.js?v=${escAttr(options.assetsVersion)}" defer></script>`;

  ctx.routes.frontend.get('/docs', (req, res) => {
    const query = String(req.query?.q || '').trim().slice(0, 80);
    const results = documents.filter(doc => `${doc.title}\n${doc.description}\n${doc.source}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    const searchItem = doc => {
      const position = Math.max(0, doc.source.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) - 40);
      const excerpt = doc.source.slice(position, position + 160).replace(/[#`*\n\r]+/g, ' ').trim();
      return `<li class="jslab-cloud-docs-item"><p class="small text-body-secondary mb-1">${escapeHtml(groupFor(doc).title)}</p><h2 class="h5">${articleLink(doc)}</h2><p>${escapeHtml(doc.description)}</p><p class="small text-body-secondary mb-0">${escapeHtml(excerpt)}…</p></li>`;
    };
    const categories = DOC_GROUPS.map(group => `<section class="jslab-cloud-docs-category" aria-labelledby="group-${group.id}"><h2 id="group-${group.id}" class="h4">${escapeHtml(group.title)}</h2><p class="text-body-secondary">${escapeHtml(group.id === 'getting-started' ? '选择版本、安装应用，再完成第一次运行。' : group.description)}</p><ul class="list-unstyled">${documents.filter(doc => doc.group === group.id).map(doc => `<li><h3 class="h6">${articleLink(doc)}</h3><p class="small text-body-secondary">${escapeHtml(doc.description)}</p></li>`).join('')}</ul></section>`).join('');
    const start = `<nav class="jslab-cloud-docs-start" aria-label="按使用目标开始阅读"><h2 class="h5">从这里开始</h2><ul class="list-unstyled mb-0"><li><a href="/jslab-cloud/docs/installation">第一次接触 JSLab</a><span>选择版本并安装</span></li><li><a href="/jslab-cloud/docs/watch-guide">已经在设备上使用</a><span>查找操作与设置</span></li><li><a href="/jslab-cloud/docs/cloud-guide">想在手机或电脑上编辑</a><span>连接、保存与同步</span></li><li><a href="/jslab-cloud/docs/script-basics">准备编写自己的脚本</a><span>从基础到接口参考</span></li></ul></nav>`;
    const content = `${header(query ? '搜索帮助文档' : 'JSLab 帮助与使用指南', query ? `搜索“${query}”的结果` : '从日常使用到编写脚本，找到你需要的操作步骤与接口说明。')}${query ? `<p role="status">找到 ${results.length} 篇相关文档。 <a href="/jslab-cloud/docs">清除搜索</a></p><ul class="list-unstyled jslab-cloud-docs-list">${results.map(searchItem).join('') || '<li>没有找到相关文档，请尝试其他关键词。</li>'}</ul>` : `${start}<div class="jslab-cloud-docs-categories">${categories}</div>`}`;
    return page(req, res, layout(content, null, query), 'JSLab 帮助与使用指南');
  });

  ctx.routes.frontend.get('/docs/download/:file', (req, res) => {
    const name = req.params.file;
    if (!DOWNLOADS.includes(name)) return res.status(404).send('未找到文档');
    res.setHeader('Content-Type', name === 'jslab-ai-prompt.md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    if (name === 'jslab-ai-prompt.md') {
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(buildAiPromptMarkdown(req.query?.version === '1' ? 1 : req.query?.version === '2' ? 2 : LATEST_PROMPT_VERSION));
    }
    return res.send(fs.readFileSync(path.join(root, name), 'utf8'));
  });

  ctx.routes.frontend.get('/docs/:slug', (req, res) => {
    const doc = documents.find(item => item.slug === req.params.slug);
    if (!doc) return res.status(404).send('未找到文档');
    const sections = doc.headings.filter(item => item.level === 2);
    const toc = sections.length ? `<details class="jslab-cloud-docs-outline"><summary><span>本页目录</span><i class="bi bi-chevron-down" aria-hidden="true"></i></summary><nav class="jslab-cloud-docs-toc" aria-label="本页目录"><ul>${sections.map(item => `<li><a href="#${item.id}">${escapeHtml(item.title)}</a></li>`).join('')}</ul></nav></details>` : '';
    const index = documents.indexOf(doc);
    const previous = documents[index - 1];
    const next = documents[index + 1];
    const group = groupFor(doc);
    const section = DOC_SECTIONS.find(item => item.id === doc.section);
    const breadcrumbs = `<nav class="jslab-cloud-docs-breadcrumb" aria-label="当前位置"><a href="/jslab-cloud/docs">帮助首页</a><i class="bi bi-chevron-right" aria-hidden="true"></i><a href="/jslab-cloud/docs#group-${group.id}">${escapeHtml(group.title)}</a>${section ? `<i class="bi bi-chevron-right" aria-hidden="true"></i><span>${escapeHtml(section.title)}</span>` : ''}</nav>`;
    const content = `${breadcrumbs}${header(doc.title, doc.description)}${toc}<article class="content-flow jslab-cloud-docs-content" aria-label="${escAttr(doc.title)}">${doc.html}</article>${doc.slug === 'ai-guide' ? renderPromptDownload() : ''}<nav class="plugin-actions jslab-cloud-docs-pagination" aria-label="相邻文档">${previous ? button(`上一篇：${previous.title}`, docLink(previous), 'btn btn-outline-secondary') : ''}${next ? button(`下一篇：${next.title}`, docLink(next), 'btn btn-outline-secondary') : ''}</nav>`;
    return page(req, res, layout(content, doc), `${doc.title} · JSLab 文档`);
  });
}

module.exports = { DOC_GROUPS, DOC_SECTIONS, DOCS, renderDocument, registerDocsPages };
