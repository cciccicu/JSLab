const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');

const DOCS = [
  { slug: 'getting-started', title: '写出你的第一个手环脚本', description: '从打印一句话开始，做一个能点击的计数器。' },
  { slug: 'cloud-guide', title: '使用云空间和 JS 市场', description: '在电脑上写代码，传到手环运行，再分享给其他人。' },
  { slug: 'runtime-api', title: '输入、记录与脚本控制', description: '询问名字、计算金额、选择选项，记住上次运行的结果。' },
  { slug: 'ui-api', title: '制作交互界面', description: '排列文字和按钮，用开关、滑块和二维码完成小工具。' }
];
const DOWNLOADS = ['runtime-api.d.ts', 'ui-api.d.ts'];

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
      token.attrSet('href', `/jslab-cloud/docs/${local[1]}`);
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
  const root = path.join(ctx.rootDir || path.resolve(__dirname, '..'), 'docs');
  const documents = DOCS.map(doc => {
    const source = fs.readFileSync(path.join(root, `${doc.slug}.md`), 'utf8');
    return { ...doc, source, ...renderDocument(source) };
  });
  const header = (title, description) => `<header class="plugin-page-header plugin-page-heading"><div><h1 class="plugin-page-heading-title">${escapeHtml(title)}</h1><p class="plugin-page-description">${escapeHtml(description)}</p></div><div class="plugin-actions">${button('云空间', '/jslab-cloud/workspace', 'btn btn-outline-secondary')}${button('JS 市场', '/jslab-cloud/workspace/market', 'btn btn-outline-secondary')}</div></header>`;
  const docLink = doc => `/jslab-cloud/docs/${doc.slug}`;

  ctx.routes.frontend.get('/docs', (req, res) => {
    const query = String(req.query?.q || '').trim().slice(0, 80);
    const results = documents.filter(doc => `${doc.title}\n${doc.description}\n${doc.source}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    const list = results.map(doc => `<li class="jslab-cloud-docs-item"><h2 class="h5"><a href="${docLink(doc)}">${escapeHtml(doc.title)}</a></h2><p class="text-body-secondary mb-0">${escapeHtml(doc.description)}</p></li>`).join('');
    return page(req, res, `<section class="plugin-page jslab-cloud-page">${header('JSLab 使用指南', '第一次使用？先写一个计数器，再尝试输入、保存和分享。')}<form method="get" action="/jslab-cloud/docs" class="jslab-cloud-search mb-4"><label class="visually-hidden" for="docs-search">搜索文档</label><input id="docs-search" class="form-control" name="q" maxlength="80" value="${escAttr(query)}" placeholder="搜索文档内容"><button class="btn btn-outline-secondary" type="submit">搜索</button></form>${query ? `<p role="status">找到 ${results.length} 篇相关文档。</p>` : ''}<ul class="list-unstyled jslab-cloud-docs-list">${list || '<li>没有找到相关文档，请尝试其他关键词。</li>'}</ul></section>`, 'JSLab 使用指南');
  });

  ctx.routes.frontend.get('/docs/download/:file', (req, res) => {
    const name = req.params.file;
    if (!DOWNLOADS.includes(name)) return res.status(404).send('未找到文档');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    return res.send(fs.readFileSync(path.join(root, name), 'utf8'));
  });

  ctx.routes.frontend.get('/docs/:slug', (req, res) => {
    const doc = documents.find(item => item.slug === req.params.slug);
    if (!doc) return res.status(404).send('未找到文档');
    const sections = doc.headings.filter(item => item.level === 2);
    const toc = sections.length ? `<nav class="jslab-cloud-docs-toc" aria-label="本页目录"><h2 class="h6">本页目录</h2><ul class="list-unstyled">${sections.map(item => `<li><a href="#${item.id}">${escapeHtml(item.title)}</a></li>`).join('')}</ul></nav>` : '';
    const index = documents.indexOf(doc);
    const previous = documents[index - 1];
    const next = documents[index + 1];
    return page(req, res, `<section class="plugin-page jslab-cloud-page">${header(doc.title, doc.description)}<div class="jslab-cloud-docs-layout"><aside class="jslab-cloud-docs-sidebar"><nav aria-label="文档导航"><a href="/jslab-cloud/docs">全部文档</a><ul class="list-unstyled mt-3">${documents.map(item => `<li><a href="${docLink(item)}"${item.slug === doc.slug ? ' aria-current="page"' : ''}>${escapeHtml(item.title)}</a></li>`).join('')}</ul></nav>${toc}</aside><div class="jslab-cloud-docs-body"><article class="content-flow jslab-cloud-docs-content" aria-label="${escAttr(doc.title)}">${doc.html}</article><nav class="plugin-actions jslab-cloud-docs-pagination" aria-label="相邻文档">${previous ? button(`上一篇：${previous.title}`, docLink(previous), 'btn btn-outline-secondary') : ''}${next ? button(`下一篇：${next.title}`, docLink(next), 'btn btn-outline-secondary') : ''}</nav></div></div></section>`, `${doc.title} · JSLab 文档`);
  });
}

module.exports = { DOCS, renderDocument, registerDocsPages };
