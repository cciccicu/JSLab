const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test("configManager", async () => {

  async function loadConfigManager(fileMock) {
    const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'core', 'configManager.js');
    const source = fs.readFileSync(sourcePath, 'utf8')
      .replace("import file from '@system.file';", 'const file = globalThis.__configFileMock;');
    globalThis.__configFileMock = fileMock;
    const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
    return (await import(dataUrl)).default;
  }

  async function run() {
    let storedText = JSON.stringify({
      editor: { font: { size: 18 }, highlight: { enabled: false } }
    });
    let accessCount = 0;
    let readCount = 0;
    let writeCount = 0;
    let failNextWrite = false;
    const fileMock = {
      access(options) {
        accessCount += 1;
        setTimeout(() => options.success(), 0);
      },
      readText(options) {
        readCount += 1;
        setTimeout(() => options.success({ text: storedText }), 0);
      },
      writeText(options) {
        writeCount += 1;
        setTimeout(() => {
          if (failNextWrite) {
            failNextWrite = false;
            options.fail(null, 300);
            return;
          }
          storedText = options.text;
          options.success();
        }, 0);
      }
    };

    const config = await loadConfigManager(fileMock);
    const values = await Promise.all([
      config.init(),
      config.get('editor.font.size', 16),
      config.get('editor.highlight.enabled', true)
    ]);
    assert.deepStrictEqual(values, [true, 18, false]);
    assert.strictEqual(accessCount, 1);
    assert.strictEqual(readCount, 1);

    assert.strictEqual(await config.get('editor.font.size', 16), 18);
    assert.strictEqual(accessCount, 1);
    assert.strictEqual(readCount, 1);

    await Promise.all([
      config.set('editor.font.size', 22),
      config.set('editor.highlight.enabled', true)
    ]);
    assert.strictEqual(writeCount, 2);
    assert.strictEqual(readCount, 1);
    assert.strictEqual(await config.get('editor.font.size', 16), 22);
    assert.strictEqual(await config.get('editor.highlight.enabled', false), true);

    failNextWrite = true;
    await assert.rejects(config.set('editor.font.size', 30), /Failed to write configuration/);
    assert.strictEqual(await config.get('editor.font.size', 16), 22);

    storedText = JSON.stringify({ editor: { font: { size: 26 } } });
    const snapshot = await config.reload();
    assert.strictEqual(snapshot.editor.font.size, 26);
    assert.strictEqual(await config.get('editor.font.size', 16), 26);
    assert.strictEqual(accessCount, 2);
    assert.strictEqual(readCount, 2);

    storedText = '[]';
    assert.deepStrictEqual(await config.reload(), {});
    await config.set('editor.font.size', 24);
    assert.equal(JSON.parse(storedText).editor.font.size, 24);
    storedText = '{"editor":[]}';
    await config.reload();
    await config.set('editor.font.size', 20);
    assert.equal(JSON.parse(storedText).editor.font.size, 20);
  }

  await run();
});

test("deviceInfo", async () => {

  async function loadFormatter() {
    const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'core', 'deviceInfo.js');
    const source = fs.readFileSync(sourcePath, 'utf8')
      .replace("import device from '@system.device';", 'const device = {};')
      .replace(/export default \{[\s\S]*?\};\s*$/, '');
    const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
    return import(dataUrl);
  }

  async function run() {
    const { formatDeviceName } = await loadFormatter();
    assert.strictEqual(formatDeviceName({ brand: 'Xiaomi', model: 'Smart Band 9 Pro' }), 'Xiaomi Smart Band 9 Pro');
    assert.strictEqual(formatDeviceName({ manufacturer: 'Xiaomi', product: 'm66' }), 'Xiaomi m66');
    assert.strictEqual(formatDeviceName({ model: 'Band Pro' }), 'Band Pro');
    assert.strictEqual(formatDeviceName({ deviceType: 'band' }), 'JSLab 手环');
    assert.strictEqual(formatDeviceName({}), 'JSLab 设备');
  }

  await run();
});

test("userError", async () => {

  async function loadFormatter() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'core', 'userError.js'), 'utf8');
    return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  }

  async function run() {
    const { createNativeError, formatError } = await loadFormatter();

    assert.equal(
      formatError(new Error('Failed to write script: 300'), '保存脚本 demo.js'),
      '保存脚本 demo.js：无法写入脚本文件（Vela 300：设备存储 I/O 错误）'
    );
    assert.equal(
      formatError(createNativeError('system.file', 'disk busy', 204), '读取脚本目录'),
      '读取脚本目录：系统接口请求超时（Vela 204：disk busy）'
    );
    assert.equal(
      formatError(new Error('文件正在编辑中，请先退出编辑器'), '删除脚本 demo.js'),
      '删除脚本 demo.js：文件正在编辑中，请先退出编辑器'
    );
    assert.equal(
      formatError(null, '保存编辑器设置'),
      '保存编辑器设置：本地运行时未返回错误详情'
    );
    assert.equal(
      formatError(new Error('internal_code_42'), '读取配置'),
      '读取配置：运行时错误「internal_code_42」'
    );
  }

  await run();
});

test("smallModules", async () => {
  // Pure logic / delegation checks; these do not emulate Vela rendering or native services.
  const root = path.join(__dirname, '..', 'src', 'utils');
  const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const read = name => fs.readFileSync(path.join(root, name), 'utf8');
  async function load(name, replacements = []) {
    let source = read(name);
    for (const [before, after] of replacements) {
      assert(source.includes(before), 'Loader anchor missing: ' + before);
      source = source.replace(before, after);
    }
    return import(url(source));
  }

  async function run() {
    const preferences = await load('editor/editorPreferences.js');
    for (const value of [null, undefined, '', '  ', false, [], {}, Infinity, 'Infinity', NaN]) {
      assert.equal(preferences.normalizeFontSize(value), 16);
    }
    assert.equal(preferences.normalizeFontSize('20.6'), 21);
    assert.equal(preferences.normalizeFontSize(0), 8);
    assert.equal(preferences.normalizeFontSize(100), 48);
    assert.equal(preferences.normalizeFontSize('bad', 22), 22);
    assert.equal(preferences.normalizeFontSize('bad', Infinity), 16);

    const codeEditor = await load('editor/codeEditor.js');
    const fontProfile = { lineHeightRatio: 1.2, lineHeightOffset: 1,
      asciiWidthRatio: 0.5, wideWidthRatio: 1 };
    assert.equal(codeEditor.countWideCharacters('a中b'), 1);
    assert.equal(codeEditor.getCodeWidth(0), 336);
    assert.equal(codeEditor.getLineHeight({ lineHeightRatio: 0.8, lineHeightOffset: -8 }, 8), 1);
    assert.equal(codeEditor.getCharacterWidth('中', fontProfile, 16), 16);

    const routes = await load('core/routeManager.js', [["import router from '@system.router';", 'const router = {};']]);
    for (const input of ['settingsEditor', '/settings/editor/', '/settings//editor', '\\settings\\editor']) {
      assert.equal(routes.resolveRoute(input), '/settings/editor');
    }
    assert.equal(routes.resolveRoute('///'), '/');
    assert.equal(routes.resolveRoute('hap://app/example/page'), 'hap://app/example/page');
    assert.throws(() => routes.resolveRoute('/settings/../editor'), /非法/);

    const feedback = await load('core/uiFeedback.js', [
      ["import prompt from '@system.prompt';", 'const prompt = { showToast: value => globalThis.__smallToast = value };'],
      ["import vibrator from '@system.vibrator';", 'const vibrator = {};']
    ]);
    for (const [duration, expected] of [[undefined, 1500], [300, 1500], ['2000', 2000], [20000, 10000], [Infinity, 1500]]) {
      feedback.showToast(0, duration);
      assert.deepEqual(globalThis.__smallToast, { message: '0', duration: expected });
    }
    delete globalThis.__smallToast;

    const compat = await load('core/runtimeCompat.js');
    let loaded = 0;
    const unavailable = compat.loadOptionalSystemModule({ canIUse() { throw new Error('unsupported query'); } },
      'system.battery', ['getStatus'], () => { loaded += 1; });
    assert.equal(loaded, 0);
    assert.throws(() => unavailable.getStatus(), error => error.code === 203);
    const callbacks = [];
    await new Promise(resolve => unavailable.getStatus({
      fail(_message, code) { callbacks.push(code); },
      complete() { callbacks.push('complete'); resolve(); }
    }));
    assert.deepEqual(callbacks, [203, 'complete']);
    const module = {};
    assert.equal(compat.loadOptionalSystemModule({}, 'system.audio', ['play'], () => module), module);
    let nativeCallback;
    compat.scheduleNextTick({ $nextTick(callback) { nativeCallback = callback; } }, () => callbacks.push('tick'));
    assert.equal(callbacks.length, 2);
    nativeCallback();
    assert.equal(callbacks[2], 'tick');

    const contractUrl = url(read('runtime/runtimeContract.js'));
    const consoleModule = await load('runtime/consoleBuffer.js', [["'./runtimeContract.js'", JSON.stringify(contractUrl)]]);
    const buffer = consoleModule.createConsoleBuffer(() => {});
    const value = Object.create(Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['inherited' + i, i])));
    buffer.console.log(value);
    assert.equal(buffer.read(), '{}');
    for (let i = 0; i < 65; i += 1) buffer.console.log(i);
    assert.match(buffer.read(), /^已省略/);
    buffer.dispose();
    assert.equal(buffer.read(), '');
  }

  await run();
});

test("dialogState", async () => {
  // Check pure request ownership and the real Vela style compiler; no UI/device simulation.
  const { UxParser } = require('@aiot-toolkit/parser');
  const { ProjectType } = require('@aiot-toolkit/shared-utils');
  const StyleToTypescript = require('@aiot-toolkit/parser/lib/ux/translate/vela/StyleToTypescript').default;
  const root = path.resolve(__dirname, '..');
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const methods = ['openDialog', 'getDialog', 'settleDialog', 'deliverDialog', 'cancelOwnedDialog', 'closeOwnedDialog', 'dialogDestroyed'];
  const limits = JSON.parse(read('../runtime-contract.json')).dialogs;

  function loadDialogState(push, back) {
    const source = read('src/utils/core/dialogState.js').replace(/^import .*;\r?\n/gm, '').replace(/export function /g, 'function ');
    return new Function('push', 'back', 'DIALOG_LIMITS', source + '\nreturn {' + methods.join(',') + '};')(push, back, limits);
  }

  function loadApp(state) {
    const source = read('src/app.ux').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm, '').replace('export default', 'return');
    // app.ux assembles these imports at module load time; this suite only exercises its dialog bridge.
    const clients = { deviceAccount: {}, deviceAi: {}, marketClient: {}, cloudFilesClient: {} };
    return new Function('requestDialog', ...methods.slice(1), ...Object.keys(clients), source)(
      ...methods.map(method => state[method]), ...Object.values(clients)
    );
  }

  async function checkOwnership() {
    let route, failPush = false, backs = 0;
    const state = loadDialogState((name, params) => {
      if (failPush) throw new Error('native route failure');
      route = { name, ...params };
    }, () => { backs++; });
    const app = loadApp(state);
    // A separate bundle really has a separate module; pages must use the app bridge.
    const pageCopy = loadDialogState(() => {}, () => {});
    const owner = {}, otherOwner = {};
    const cases = [
      ['alert', {}, null], ['confirm', { secondaryText: '另存' }, null],
      ['text', { value: '初值' }, '新值'], ['number', { value: 3 }, 5],
      ['select', { items: [{ label: '运行', value: 'run' }] }, 'run']
    ];
    for (const [type, options, value] of cases) {
      const result = app.openDialog(type, options, owner);
      const pageType = type === 'alert' ? 'confirm' : type;
      assert.equal(pageCopy.getDialog(pageType, route.dialogId), null);
      const data = app.getDialog(pageType, route.dialogId);
      assert.ok(data, type + ' must be readable from the app instance');
      assert.equal(app.getDialog(pageType, 'stale-id'), null);
      assert.equal(app.deliverDialog(owner), false, 'opening is not a completed result');
      await assert.rejects(app.openDialog('alert', {}, otherOwner), { code: 'DIALOG_BUSY' });
      assert.equal(app.settleDialog(data, 'confirm', value), true);
      assert.equal(app.settleDialog(data, 'cancel', null), false);
      app.dialogDestroyed(data); // Must preserve an already confirmed result.
      assert.equal(app.deliverDialog(otherOwner), false);
      assert.equal(app.deliverDialog(owner), true);
      assert.deepEqual(await result, { action: 'confirm', value });
      assert.equal(app.deliverDialog(owner), false);
    }
    let result = app.openDialog('confirm', {}, owner);
    const oldData = app.getDialog('confirm', route.dialogId);
    // Invalid-page recovery and native destruction record cancellation before delivery.
    app.dialogDestroyed({ id: route.dialogId });
    assert.equal(app.deliverDialog(owner), true);
    assert.deepEqual(await result, { action: 'cancel', value: null });
    result = app.openDialog('confirm', {}, owner);
    app.dialogDestroyed(oldData); // A late old-page callback cannot cancel a new request.
    assert.equal(app.deliverDialog(owner), false);
    assert.equal(app.closeOwnedDialog(otherOwner), false);
    assert.equal(app.closeOwnedDialog(owner), true);
    assert.equal(backs, 1);
    assert.equal(app.deliverDialog(owner), true);
    assert.deepEqual(await result, { action: 'cancel', value: null });
    result = app.openDialog('text', {}, owner);
    app.cancelOwnedDialog(otherOwner);
    app.cancelOwnedDialog(owner);
    assert.deepEqual(await result, { action: 'cancel', value: null });
    failPush = true;
    await assert.rejects(app.openDialog('alert', {}, owner), { code: 'DIALOG_OPEN_FAILED' });
    failPush = false;
    result = app.openDialog('alert', {}, owner);
    app.cancelOwnedDialog(owner);
    await result;
  }

  async function checkCompiledStyles() {
    for (const name of ['confirm', 'select', 'text-input', 'number-input']) {
      const filePath = path.join(root, 'src/pages/overlay', name, name + '.ux');
      const options = { filePath, projectPath: root, projectType: ProjectType.VELA_UX, content: fs.readFileSync(filePath, 'utf8'), onLog: () => {} };
      const { ast } = await new UxParser(options, { sourceRoot: 'src' }, {}, () => {}).parser();
      const { targetTree } = new StyleToTypescript(options, {}).translate(ast.style, []);
      const style = name => {
        const rule = targetTree.find(([selectors]) => selectors.length === 1 && selectors[0][1] === name);
        assert.ok(rule, filePath + ': missing compiled .' + name);
        return rule[1];
      };
      assert.equal(style('page').width, '336px');
      assert.equal(style('page').height, '480px');
      assert.equal(style('btn').width, '72px');
      assert.equal(style('btn').position, 'absolute');
      if (name === 'number-input') assert.equal(style('input-card').height, '102px');
      else if (name === 'text-input') assert.equal(style('input-card').height, '123px');
      else assert.equal(style(name === 'select' ? 'choices' : 'body').flexDirection, 'column');
    }
  }

  await checkOwnership();
  await checkCompiledStyles();
});

test("projectStructure", async () => {

  const projectRoot = path.join(__dirname, '..');
  const sourceRoot = path.join(projectRoot, 'src');
  const utilsRoot = path.join(sourceRoot, 'utils');

  function walk(directory, extensions) {
    const result = [];
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) result.push(...walk(fullPath, extensions));
      else if (extensions.some(extension => entry.name.endsWith(extension))) result.push(fullPath);
    });
    return result;
  }

  function checkRelativeImports() {
    const missing = [];
    walk(sourceRoot, ['.js', '.ux']).forEach((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      const pattern = /(?:from\s*|import\s*)['"]([^'"]+)['"]/g;
      let match;
      while ((match = pattern.exec(source))) {
        if (!match[1].startsWith('.')) continue;
        const target = path.resolve(path.dirname(filePath), match[1]);
        if (!fs.existsSync(target)) missing.push(path.relative(projectRoot, filePath) + ' -> ' + match[1]);
      }
    });
    assert.deepStrictEqual(missing, [], 'Relative imports must resolve');
  }

  function checkAppOwnedServices() {
    const isolated = [];
    const statefulModules = /\/utils\/(?:files\/(?:jsManager|scriptData)|core\/configManager|cloud\/(?:deviceAccount|deviceAi|marketClient|cloudFilesClient))\.js/;
    walk(path.join(sourceRoot, 'pages'), ['.ux']).forEach((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      if (statefulModules.test(source)) isolated.push(path.relative(projectRoot, filePath));
    });
    assert.deepStrictEqual(isolated, [], 'Pages must use app-owned stateful services');
    const transport = fs.readFileSync(path.join(utilsRoot, 'cloud', 'cloudTransport.js'), 'utf8');
    assert(!/import .*companionBridge\.js/.test(transport), 'Page bundles must not import the app-owned Interconnect connection');
    walk(path.join(sourceRoot, 'pages'), ['.ux']).forEach((filePath) => {
      assert(!/import .*\/utils\/cloud\/cloudTransport\.js/.test(fs.readFileSync(filePath, 'utf8')),
        'Pages must import cloudError rather than the stateful cloud transport: ' + path.relative(projectRoot, filePath));
    });
  }

  checkRelativeImports();
  checkAppOwnedServices();
});
