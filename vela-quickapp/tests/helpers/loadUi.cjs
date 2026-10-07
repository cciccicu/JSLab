const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../..');
function moduleUrl(source) { return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64'); }
async function loadUi() {
  const layoutUrl = moduleUrl(fs.readFileSync(path.join(root, 'src/utils/runtime/uiLayout.js'), 'utf8'));
  const runtime = fs.readFileSync(path.join(root, 'src/utils/runtime/uiRuntime.js'), 'utf8').replace("'./uiLayout.js'", JSON.stringify(layoutUrl));
  const publisher = fs.readFileSync(path.join(root, 'src/utils/runtime/uiPublisher.js'), 'utf8');
  return { ...await import(layoutUrl), ...await import(moduleUrl(runtime)), ...await import(moduleUrl(publisher)) };
}
function host() {
  const state = { paints: 0, publishes: 0, errors: [], top: 84, nodes: [], height: 480 };
  const callbacks = {
    top: () => state.top,
    title: value => { state.title = value; },
    header: value => { const next = value ? 84 : 12; const changed = state.top !== next; state.top = next; return changed; },
    scroll: value => { state.scroll = value; },
    error: error => { state.errors.push(error); },
    publish: (nodes, height, end, changed) => { state.publishes++; if (changed) state.paints++; Object.assign(state, { nodes, height, end }); }
  };
  return { state, callbacks };
}
module.exports = { loadUi, host, root };

async function loadRunnerFixture(code) {
  const { createUiSession, createUiPublisher } = await loadUi();
  const constantsUrl = moduleUrl(fs.readFileSync(path.join(root, 'src/utils/runtime/runtimeContract.js'), 'utf8'));
  const bufferSource = fs.readFileSync(path.join(root, 'src/utils/runtime/consoleBuffer.js'), 'utf8').replace("'./runtimeContract.js'", JSON.stringify(constantsUrl));
  const { createConsoleBuffer, formatError } = await import(moduleUrl(bufferSource));
  const source = fs.readFileSync(path.join(root, 'src/pages/workspace/run/run.ux'), 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm, '').replace('export default','return');
  let captured; const scrolls=[];
  const names=['createUiSession','createUiPublisher','createScriptRuntimeApi','createConsoleBuffer','formatError','getPageElement','scheduleNextTick','getCurrentClock','startPageClock','stopPageClock','setTimeout','clearTimeout','setInterval','clearInterval','vibrate','deliverDialog','cancelOwnedDialog','closeOwnedDialog','back','replace'];
  const values=[createUiSession,createUiPublisher,() => ({system:{capture(value){captured=value;}},script:{},dialog:{}}),createConsoleBuffer,formatError,
    () => ({scrollTo(options){scrolls.push(options);}}),(_page,callback)=>Promise.resolve().then(callback),()=>'00:00',()=>{},()=>{},()=>1,()=>{},()=>1,()=>{},()=>{},()=>{},()=>{},()=>false,()=>{},()=>{}];
  const page=new Function(...names,script)(...values);
  Object.assign(page,page.private,{$app:{$def:{runnerSource:{name:'review.js',code},deliverDialog:()=>false,cancelOwnedDialog:()=>{},closeOwnedDialog:()=>false}}});
  page.onInit();return {page,captured,scrolls};
}
module.exports.loadRunnerFixture=loadRunnerFixture;
