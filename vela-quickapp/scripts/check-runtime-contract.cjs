// Static contract/syntax checks only: no script execution or device simulation.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const parser=require('@babel/parser');
const root=path.resolve(__dirname,'../..'),app=path.join(root,'vela-quickapp');
const read=p=>fs.readFileSync(path.join(app,p),'utf8');
const contract=JSON.parse(fs.readFileSync(path.join(root,'runtime-contract.json'),'utf8'));
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'ccicc-plugin-cloud/jslab-cloud/lib/runtime-contract.json'),'utf8')),contract);
const constants=read('src/utils/runtime/runtimeContract.js');
for(const value of [contract.identity,JSON.stringify(contract.logs),JSON.stringify(contract.dialogs)])assert.ok(constants.includes(value));
function walk(dir) {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(path.join(dir,item.name)):[path.join(dir,item.name)]);}
let sources=0,templates=0;
for(const file of walk(path.join(app,'src')).filter(f=>/\.(js|ux)$/.test(f))){
  const source=fs.readFileSync(file,'utf8'),code=file.endsWith('.ux')?(source.match(/<script>([\s\S]*?)<\/script>/)||[])[1]:source;
  if(code===undefined)continue;
  const ast=parser.parse(code,{sourceType:'module'});sources++;
  if(file.endsWith('scriptTemplates.js')||file.endsWith('ui2048Example.js')){
    function visit(value){
      if(!value||typeof value!=='object')return;
      if(value.type==='TemplateLiteral'&&!value.expressions.length){new Function(value.quasis.map(q=>q.value.cooked).join(''));templates++;}
      for(const key of Object.keys(value))if(!['loc','start','end'].includes(key)){const v=value[key];if(Array.isArray(v))v.forEach(visit);else visit(v);}
    }
    visit(ast);
  }
  if(file.endsWith('.ux')&&code.includes('.openDialog(')){
    assert.doesNotMatch(code,/callbacks\s*:|initialValue\s*:|\boptions\s*:/,file);
    assert.ok(code.includes('this.$app.$def.deliverDialog(this)'),file+' missing app-owned result delivery');
    assert.ok(code.includes('this.$app.$def.cancelOwnedDialog(this)'),file+' missing app-owned owner release');
  }
  if(file!==path.join(app,'src/app.ux'))assert.doesNotMatch(code,/import .*dialogState\.js/,file+' must use the app-owned dialog state');
}
const manifest=JSON.parse(read('src/manifest.json'));
for(const [directory,route] of Object.entries(manifest.router.pages))assert.ok(fs.existsSync(path.join(app,'src',directory,route.component+'.ux')),directory);
assert.equal(manifest.router.pages['pages/workspace/run'].path,'/workspace/run');
assert.ok(!manifest.router.pages['pages/workspace/run-ui']&&!manifest.router.pages['pages/workspace/run-console']);
const runner=read('src/pages/workspace/run/run.ux');
assert.match(runner,/new Function\('console','ui','dialog','script','system'/);
assert.match(runner,/@click="restoreUi"/);assert.doesNotMatch(runner,/@touch(start|move|end)|onUiScroll|showRunMenu|stopScript/);
for(const method of contract.methods.ui)assert.match(read('src/utils/runtime/uiRuntime.js'),new RegExp('\\b'+method+'(?:\\(|,)'));
for(const method of contract.methods.script)assert.match(read('src/utils/runtime/scriptRuntimeApi.js'),new RegExp('\\b'+method+'\\('));
for(const method of contract.methods.dialog)assert.ok(read('src/utils/runtime/scriptDialogApi.js').includes("'"+method+"'"));
for(const method of contract.methods.console)assert.match(read('src/utils/runtime/consoleBuffer.js'),new RegExp('\\b'+method+'\\('));
const layout=read('src/utils/runtime/uiLayout.js');
assert.match(layout,new RegExp('nodes: '+contract.ui.declarations));assert.match(layout,new RegExp('painted: '+contract.ui.paintedNodes));
assert.match(layout,new RegExp('depth: '+contract.ui.depth));assert.match(layout,new RegExp('qrcodes: '+contract.ui.qrcodes));
assert.match(layout,/raw.disabled !== true/);
console.log(`Static contract verified: ${sources} sources, ${templates} embedded scripts, ${contract.identity}`);
