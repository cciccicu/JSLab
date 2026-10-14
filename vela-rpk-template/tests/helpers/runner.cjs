const fs=require('node:fs');
const path=require('node:path');
const {loadUi}=require('../../../vela-quickapp/tests/helpers/loadUi.cjs');
const root=path.resolve(__dirname,'../..');
function moduleUrl(source){return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');}
async function fixture(code,options={},load) {
  const {createUiSession,createUiPublisher}=await loadUi();
  const contract=moduleUrl(fs.readFileSync(path.join(root,'src/utils/runtime/runtimeContract.js'),'utf8'));
  const buffer=fs.readFileSync(path.join(root,'src/utils/runtime/consoleBuffer.js'),'utf8').replace("'./runtimeContract.js'",JSON.stringify(contract));
  const {createConsoleBuffer,formatError}=await import(moduleUrl(buffer));
  const ux=fs.readFileSync(path.join(root,'src/pages/workspace/run/run.ux'),'utf8');
  const script=ux.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm,'').replace('export default','return');
  const captured=[],routes=[],runtime={dialog:{alert(){}},script:{data:{},config:{}},system:{capture:value=>captured.push(value)}};
  let closed=0,cancelled=0;
  const names=['createUiSession','createUiPublisher','createScriptRuntimeApi','createConsoleBuffer','formatError','getPageElement','scheduleNextTick','getCurrentClock','startPageClock','stopPageClock','setTimeout','clearTimeout','vibrate','replace','app','router'];
  const values=[createUiSession,createUiPublisher,(_app,options)=>{runtime.script.reload=options.reload;runtime.script.exit=options.exit;return runtime;},createConsoleBuffer,formatError,()=>null,(_page,callback)=>Promise.resolve().then(callback),()=>'12:34',()=>{},()=>{},()=>1,()=>{},()=>{},route=>routes.push(route),{terminate(){closed++;}},{push:route=>routes.push(route.uri)}];
  const page=new Function(...names,script)(...values);
  const payload={name:'legacy.ui.js',appName:'独立应用',versionName:'1.0.0',author:'作者',options:{hideTopBar:false,disableConsole:false,...options},code};
  Object.assign(page,page.private,{$app:{$def:{loadPayload:load || (()=>Promise.resolve(payload)),deliverDialog:()=>false,cancelOwnedDialog:()=>cancelled++,closeOwnedDialog:()=>false}}});
  page.onInit();page.onShow();await Promise.resolve();
  return {page,captured,routes,runtime,payload,closed:()=>closed,cancelled:()=>cancelled};
}
module.exports={fixture};
