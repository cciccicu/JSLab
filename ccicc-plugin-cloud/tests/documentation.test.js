const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const MarkdownIt = require('../jslab-cloud/node_modules/markdown-it');
const { DOCS, DOC_GROUPS, DOC_SECTIONS, renderDocument } = require('../jslab-cloud/lib/browser-docs-pages');
const { documentationRuntime } = require('./helpers/documentation-runtime');
const { loadUi, host } = require('../../vela-quickapp/tests/helpers/loadUi.cjs');
const docsRoot = path.resolve(__dirname, '../jslab-cloud/generated/docs');

test('generating help resources preserves the centrally authored articles', () => {
  const before = DOCS.map(doc => fs.readFileSync(path.join(docsRoot, `${doc.slug}.md`), 'utf8'));
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/sync-docs.cjs')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(DOCS.map(doc => fs.readFileSync(path.join(docsRoot, `${doc.slug}.md`), 'utf8')), before);
});

test('standalone tutorial examples execute and their controls work with the actual UI compiler', async () => {
  const { createUiSession } = await loadUi();
  const markdown = new MarkdownIt();
  for (const doc of DOCS) {
    const source = fs.readFileSync(path.join(docsRoot, `${doc.slug}.md`), 'utf8');
    const examples = markdown.parse(source, {}).filter(token => token.type === 'fence' && token.info === 'js');
    for (const [index, example] of examples.entries()) {
      const label = `${doc.slug}, example ${index + 1}`;
      for (const mode of ['success', 'failure', 'unsupported']) for (const action of ['confirm', 'cancel']) {
        const { state, callbacks } = host();
        const session = createUiSession(callbacks);
        const answer = value => Promise.resolve({ action, value: action === 'confirm' ? value : null });
        const dialog = {
          text: () => answer('小林'), number: () => answer(60),
          select: options => answer(options.value ?? options.items[0].value),
          confirm: () => answer(null), alert: () => answer(null)
        };
        const quietConsole = { log() {}, info() {}, warn() {}, error() {}, clear() {} };
        const runtime = documentationRuntime(dialog, mode);
        try {
          await new Function('console', 'ui', 'dialog', 'script', 'system', example.content)(
            quietConsole, session.ui, runtime.dialog, runtime.script, runtime.system
          );
          await new Promise(resolve => setImmediate(resolve));
          assert.deepEqual(runtime.errors, [], `${label}, ${mode}`);
          assert.deepEqual(state.errors, [], label);
          for (const node of [...state.nodes]) {
            const value = node.kind === 'switch' ? true : node.kind === 'slider' ? 80 : undefined;
            if (['button', 'switch', 'slider'].includes(node.kind)) {
              assert.equal(session.invoke(node.id, value), true, label);
              await new Promise(resolve => setImmediate(resolve));
              assert.deepEqual(state.errors, [], `${label}, control ${node.id}`);
            }
          }
          assert.deepEqual(runtime.errors, [], label);
          assert.equal(runtime.active.size, 0, `${label}: sample stop controls must release subscriptions`);
        } finally { session.dispose(); }
      }
    }
  }
});

test('all published articles have unique sections, valid local links and a navigation group', () => {
  const markdown = new MarkdownIt();
  const slugs = new Set(DOCS.map(doc => doc.slug));
  assert.equal(slugs.size, DOCS.length);
  assert.ok(['getting-started', 'cloud-guide', 'runtime-api', 'ui-api'].every(slug => slugs.has(slug)));
  for (const group of DOC_GROUPS) assert.ok(DOCS.some(doc => doc.group === group.id));
  for (const section of DOC_SECTIONS) assert.ok(DOCS.some(doc => doc.group === section.group && doc.section === section.id));
  for (const doc of DOCS) {
    assert.ok(DOC_GROUPS.some(group => group.id === doc.group), doc.slug);
    if (doc.section) assert.ok(DOC_SECTIONS.some(section => section.id === doc.section && section.group === doc.group), doc.slug);
    const source = fs.readFileSync(path.join(docsRoot, `${doc.slug}.md`), 'utf8');
    const { headings } = renderDocument(source);
    assert.equal(headings.filter(item => item.level === 1).length, 1, doc.slug);
    const sections = headings.filter(item => item.level === 2).map(item => item.title);
    assert.ok(sections.length > 0, doc.slug);
    assert.equal(new Set(sections).size, sections.length, `${doc.slug}: repeated heading`);
    for (const token of markdown.parse(source, {}).flatMap(token => token.children || [])) {
      const href = token.attrGet('href') || token.attrGet('src') || '';
      const local = /^(?:\.\/)?([a-z-]+)\.(md|d\.ts)(#.*)?$/.exec(href);
      if (local) {
        assert.ok(fs.existsSync(path.join(docsRoot, `${local[1]}.${local[2]}`)), `${doc.slug}: ${href}`);
        if (local[2] === 'md') assert.ok(slugs.has(local[1]), href);
      }
      if (href.startsWith('/jslab-cloud/assets/')) {
        assert.ok(fs.existsSync(path.resolve(docsRoot, '../..', href.slice('/jslab-cloud/'.length))), href);
      }
    }
  }
});
