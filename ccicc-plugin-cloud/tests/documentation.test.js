const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const MarkdownIt = require('../jslab-cloud/node_modules/markdown-it');
const { DOCS } = require('../jslab-cloud/lib/browser-docs-pages');
const { loadUi, host } = require('../../vela-quickapp/tests/helpers/loadUi.cjs');
const docsRoot = path.resolve(__dirname, '../jslab-cloud/docs');

test('syncing editor declarations preserves independently authored tutorials', () => {
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
      for (const action of ['confirm', 'cancel']) {
        const { state, callbacks } = host();
        const session = createUiSession(callbacks);
        const values = new Map();
        const storage = { get: async (key, fallback) => values.has(key) ? values.get(key) : fallback, set: async (key, value) => { values.set(key, value); } };
        const script = { name: 'tutorial.js', data: storage, config: storage, toast() {}, canUse: () => true };
        const answer = value => Promise.resolve({ action, value: action === 'confirm' ? value : null });
        const dialog = {
          text: () => answer('小林'), number: () => answer(60),
          select: options => answer(options.value ?? options.items[0].value),
          confirm: () => answer(null), alert: () => answer(null)
        };
        const quietConsole = { log() {}, info() {}, warn() {}, error() {}, clear() {} };
        try {
          await new Function('console', 'ui', 'dialog', 'script', 'system', example.content)(
            quietConsole, session.ui, dialog, script, { vibration: { vibrate() {} } }
          );
          assert.deepEqual(state.errors, [], label);
          for (const node of [...state.nodes]) {
            const value = node.kind === 'switch' ? true : node.kind === 'slider' ? 80 : undefined;
            if (['button', 'switch', 'slider'].includes(node.kind)) {
              assert.equal(session.invoke(node.id, value), true, label);
              await Promise.resolve();
              assert.deepEqual(state.errors, [], `${label}, control ${node.id}`);
            }
          }
        } finally { session.dispose(); }
      }
    }
  }
});
