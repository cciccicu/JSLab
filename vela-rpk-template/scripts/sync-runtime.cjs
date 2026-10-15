// Keep the existing script API, UI, storage and dialogs byte-for-byte compatible.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../vela-quickapp/src');
const check = process.argv.includes('--check');
function write(relative, data) {
  const target = path.join(root, 'src', relative);
  if (check) {
    const normalized=value=>/\.(js|ux|css|json|md|txt)$/i.test(relative) ? Buffer.from(Buffer.from(value).toString('utf8').replace(/\r\n/g,'\n')) : Buffer.from(value);
    if (!fs.existsSync(target) || !normalized(fs.readFileSync(target)).equals(normalized(data))) throw new Error('模板源码需要同步：' + relative);
  } else { fs.mkdirSync(path.dirname(target), { recursive:true }); fs.writeFileSync(target, data); }
}
function copy(relative) {
  const from = path.join(source, relative);
  if (fs.statSync(from).isDirectory()) {
    for (const name of fs.readdirSync(from)) copy(path.join(relative, name));
  } else write(relative, fs.readFileSync(from));
}
// Keep the RPK-specific black code-sheet icon with its JSLab badge; do not copy the regular app logo here.
for (const relative of ['utils/runtime', 'utils/files/scriptData.js', 'utils/core/dialogState.js',
  'utils/core/routeManager.js', 'utils/core/runtimeCompat.js', 'utils/core/uiFeedback.js', 'utils/core/time.js',
  'pages/overlay', 'components/InputMethod', 'common/styles/dialog.css',
  ...['hd','back','conform','check','info'].map(name => 'common/images/' + name + '.png')]) copy(relative);
let run = fs.readFileSync(path.join(source, 'pages/workspace/run/run.ux'), 'utf8').replace(/\r\n/g, '\n');
function change(before, after) {
  if (!run.includes(before)) throw new Error('运行页已改变，请更新模板适配：' + before);
  run = run.replace(before, after);
}
change("import { back, replace }", "import app from '@system.app';\nimport router from '@system.router';\nimport { back, replace }");
change('import { back, replace }','import { replace }');
change('    const start = this.$app.$def.runnerSource;\n    this.$app.$def.runnerSource = null;', `    const pending={active:true,visible:true}; runs.set(this,pending);
    this.$app.$def.loadPayload().then(start => {
      if (pending.active) this.startRun(start,pending.visible);
    }, error => { if (pending.active) this.error=formatError(error); });
  },
  startRun(start,visible) {`);
change('active:true, visible:true, start:', 'active:true, visible:visible, start:');
change("header:true, uiTitle:'脚本'", "header:!start.options.hideTopBar, uiTitle:start.appName");
change("header:value => { if (state.header === value)", "header:value => { value=value && !state.start.options.hideTopBar; if (state.header === value)");
change("state.logs = createConsoleBuffer(() => this.queueLogs());", `state.logs = createConsoleBuffer(() => this.queueLogs());
    if (start.options.disableConsole) Object.keys(state.logs.console).forEach(key => { state.logs.console[key]=() => {}; });
    this.showTopBar=state.header; this.contentTopPadding=state.header ? 84 : 12;`);
run = run.replaceAll('state.start.name.slice(0,80)', 'state.start.appName.slice(0,80)');
change('state.session.setVisible(false); this.view=\'console\'; this.showTopBar=true;', "state.session.setVisible(false); this.view='console'; this.showTopBar=!state.start.options.hideTopBar;");
change("else back();", "else app.terminate();");
change("if (action === 'reload') { this.$app.$def.runnerSource={ name:state.start.name, code:state.start.code }; replace('run'); }", "if (action === 'reload') replace('run');");
run = run.replaceAll('this.$app.$def.runnerSource=null; ', '');
change('this.$app.$def.cancelOwnedDialog(this); state.session.dispose(); state.logs.dispose();', 'this.$app.$def.cancelOwnedDialog(this); if (state.session) state.session.dispose(); if (state.logs) state.logs.dispose();');
change('state.session.setVisible(this.view', 'if (state.session) state.session.setVisible(this.view');
change("if (this.view === 'console') this.flushLogs();", "if (state.logs && this.view === 'console') this.flushLogs();");
change('state.visible=false; state.session.setVisible(false);', 'state.visible=false; if (state.session) state.session.setVisible(false);');
change('if (state) state.session.ui.show();', 'if (state && state.session) state.session.ui.show();');
change("state && state.active && state.visible && this.view === 'console'", "state && state.logs && state.active && state.visible && this.view === 'console'");
change("onBack() { vibrate('short'); if (this.view === 'ui') this.showConsole(); else this.navigate('exit'); },", "onBack() { vibrate('short'); const state=runs.get(this); if (!state || !state.session) app.terminate(); else if (this.view === 'ui') this.showConsole(); else this.navigate('exit'); },\n  showAbout() { router.push({uri:'/about'}); },");
change('static src="/common/images/rerun.png" class="btn btn-right-top" @click="reload"', 'static src="/common/images/info.png" class="btn btn-right-top" @click="showAbout"');
run = run.replaceAll('<img ', '<image ');
change('class="console-content" scroll-y="true"', 'class="console-content" style="{{ { top: showTopBar ? \'84px\' : \'12px\', height: showTopBar ? \'396px\' : \'468px\' } }}" scroll-y="true"');
write('pages/workspace/run/run.ux', run);
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
manifest.package='icu.ccicc.jslab.template'; manifest.name='JSLab 模板'; manifest.versionName='1.0.0'; manifest.versionCode=1;
manifest.router.entry='pages/workspace/run';
manifest.router.pages=Object.fromEntries(Object.entries(manifest.router.pages).filter(([key]) => key==='pages/workspace/run' || key.startsWith('pages/overlay/')));
manifest.router.pages['pages/about']={component:'about',path:'/about'};
write('manifest.json', JSON.stringify(manifest,null,2)+'\n');
console.log(check ? 'Runtime sources match' : 'Runtime sources synchronized');
