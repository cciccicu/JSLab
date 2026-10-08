const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./helpers/loadUi.cjs');
const { compileStyle, translateStyle } = require('../diagnostics/ui-performance-app/tests/loadStyles.cjs');

test('production object bindings preserve toolkit style values and dependencies without parsing CSS strings', async () => {
  const before = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/run-ui-style-strings.json'), 'utf8'));
  const pageSource = fs.readFileSync(path.join(root, 'src/pages/workspace/run/run.ux'), 'utf8');
  const after = [...pageSource.match(/<template>[\s\S]*?<\/template>/)[0].matchAll(/style="([^"]*)"/g)].map(match => match[1]);
  assert.equal(before.length, 17); assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    const oldBinding = await compileStyle(before[i]); const newBinding = await compileStyle(after[i]);
    for (let frame = 0; frame < 24; frame++) {
      const page = { layoutHeight: 480 + frame * 50, contentTopPadding: frame % 2 ? 102 : 12,
        errorTop: 300, scrollTrackTop: 106, scrollTrackHeight: 360, scrollThumbTop: 112, scrollThumbHeight: 42 };
      const node = { x: frame * 3, y: frame * 5, width: 201.5, height: 50, radius: frame % 3 ? 12 : 0,
        background: ['#abcdef', 'rgba(1, 2, 3, 0.5)', 'transparent'][frame % 3], color: '#ffffff', size: 18 + frame % 12,
        lineHeight: 32 + frame % 10, bold: frame % 2 ? 'bold' : 'normal', align: ['left', 'center', 'right'][frame % 3],
        lines: 1 + frame % 4, copyWidth: 109.5, detailColor: '#aaaaaa', accent: '#ff8800', trackColor: '#333333',
        thumbColor: '#ffffff', qrSize: 144 };
      const reads = [];
      const track = (target, prefix) => new Proxy(target, { get(value, key) { reads.push(prefix + key); return value[key]; } });
      const vm = track(page, 'page.'); const observed = track(node, 'node.');
      const oldStyle = oldBinding(vm, observed); const oldReads = reads.splice(0);
      let objectCalls = 0;
      const newStyle = newBinding(vm, observed, value => {
        assert.equal(typeof value, 'object'); objectCalls++;
        assert.equal(translateStyle(value), value); return value;
      });
      assert.equal(objectCalls, 1);
      assert.deepEqual(newStyle, oldStyle, 'binding ' + i + ', frame ' + frame);
      assert.deepEqual(reads, oldReads, 'dependency reads for binding ' + i);
    }
  }
});
