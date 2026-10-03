const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../..');
function moduleUrl(source) { return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64'); }
async function loadUi() {
  const layoutUrl = moduleUrl(fs.readFileSync(path.join(root, 'src/utils/runtime/uiLayout.js'), 'utf8'));
  const runtime = fs.readFileSync(path.join(root, 'src/utils/runtime/uiRuntime.js'), 'utf8').replace("'./uiLayout.js'", JSON.stringify(layoutUrl));
  return { ...await import(layoutUrl), ...await import(moduleUrl(runtime)) };
}
function host() {
  const state = { paints: 0, publishes: 0, errors: [], top: 102, nodes: [], height: 480 };
  const callbacks = {
    top: () => state.top,
    title: value => { state.title = value; },
    header: value => { const next = value ? 102 : 12; const changed = state.top !== next; state.top = next; return changed; },
    scroll: value => { state.scroll = value; },
    error: error => { state.errors.push(error); },
    publish: (nodes, height, end, changed) => { state.publishes++; if (changed) state.paints++; Object.assign(state, { nodes, height, end }); }
  };
  return { state, callbacks };
}
module.exports = { loadUi, host, root };
