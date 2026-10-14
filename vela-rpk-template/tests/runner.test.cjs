const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture}=require('./helpers/runner.cjs');
const root=path.resolve(__dirname,'..');
test('legacy UI script loads through the application entry and info page returns without restarting the script',async()=>{
  const code="system.capture({console,ui,dialog,script,system}); ui.render(ui.text('旧脚本运行')); ui.show();";
  const payload={name:'legacy.ui.js',appName:'独立应用',versionName:'1.0.0',author:'作者',options:{hideTopBar:false,disableConsole:false},code};
  const appSource=fs.readFileSync(path.join(root,'src/app.ux'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm,'').replace('export default','return').replace("'__JSLAB_PAYLOAD_JSON__'",()=>JSON.stringify(JSON.stringify(payload)));
  const app=new Function(appSource)();
  const f=await fixture(code,{},()=>app.loadPayload());
  await Promise.resolve();
  const {page,captured}=f;
  assert.equal(captured.length,1);assert.equal(captured[0].script,f.runtime.script);assert.equal(captured[0].dialog,f.runtime.dialog);
  assert.equal(typeof captured[0].console.log,'function');assert.equal(typeof captured[0].ui.grid,'function');
  assert.equal(page.view,'ui');assert.equal(page.showTopBar,true);assert.equal(page.uiNodes[0].text,'旧脚本运行');
  page.showAbout();assert.deepEqual(f.routes,['/about']);page.onHide();page.onShow();assert.equal(captured.length,1);
  page.onDestroy();assert.equal(f.cancelled(),1);
});
test('hidden top bar stays hidden when old scripts request a header or switch to console',async()=>{
  const f=await fixture("ui.showHeader(true); ui.render(ui.text('内容')); ui.show();",{hideTopBar:true});
  assert.equal(f.page.error,'');assert.equal(f.page.hasUi,true);
  assert.equal(f.page.showTopBar,false);assert.equal(f.page.contentTopPadding,12);
  f.page.showConsole();assert.equal(f.page.showTopBar,false);f.page.restoreUi();assert.equal(f.page.showTopBar,false);f.page.onDestroy();
});

test('bundled example runs through the real UI engine without errors',async()=>{
  const example=JSON.parse(fs.readFileSync(path.join(root,'src/common/payload.json'),'utf8'));
  for (const [code,title] of [[example.code,example.appName],[example.code.replace('示例应用','移动端测试'),'移动端测试']]) {
    const payload={...example,appName:title,code};
    const appSource=fs.readFileSync(path.join(root,'src/app.ux'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm,'').replace('export default','return').replace("'__JSLAB_PAYLOAD_JSON__'",()=>JSON.stringify(JSON.stringify(payload)));
    const app=new Function(appSource)();
    const f=await fixture(code,{},()=>app.loadPayload());
    await Promise.resolve();
    assert.equal(f.page.error,'');assert.equal(f.page.view,'ui');assert.equal(f.page.hasUi,true);
    assert.equal(f.page.pageTitle,title);
    assert.deepEqual(f.page.uiNodes.map(node=>node.text),['独立快应用','使用 JSLab 脚本引擎运行']);
    f.page.onDestroy();
  }
});
test('disabled console preserves methods, suppresses output and retains script failures',async()=>{
  const f=await fixture("console.log('隐藏'); console.warn('隐藏'); console.clear(); throw new Error('仍显示的错误');",{disableConsole:true});
  assert.equal(f.page.logText,'');assert.match(f.page.error,/仍显示的错误/);f.page.onDestroy();
  const normal=await fixture("console.log('可见');");assert.equal(normal.page.logText,'可见');normal.page.onDestroy();
});
test('destroyed page never executes a late static resource; background loads resume safely',async()=>{
  let release;
  const pending=new Promise(resolve=>release=resolve);
  const f=await fixture('',{},()=>pending);f.page.onHide();f.page.restoreUi();f.page.onDestroy();
  release({...f.payload,code:'system.capture(1)'});await Promise.resolve();assert.equal(f.captured.length,0);
  let resume;const waiting=new Promise(resolve=>resume=resolve);
  const g=await fixture('',{},()=>waiting);g.page.onHide();resume({...g.payload,code:"ui.render(ui.text('恢复')); ui.show();"});await Promise.resolve();
  g.page.onShow();assert.equal(g.page.uiNodes[0].text,'恢复');g.page.onDestroy();
});
test('script reload targets the standalone runner and script exit terminates the application',async()=>{
  const f=await fixture("system.capture(script);");f.runtime.script.reload();assert.deepEqual(f.routes,['run']);f.page.onDestroy();
  const g=await fixture('');g.runtime.script.exit();assert.equal(g.closed(),1);g.page.onDestroy();
});
