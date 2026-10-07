// Historical audit: run against the pre-unification source, not the current runner.
// Read-only audit of the historical Console page. Native APIs and time are mocked.
// Prints observations, not a passing correctness suite; fixes should change them.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const pageSource = require('node:child_process').execFileSync('git',['show','51d6764fe26931fa914064d781d3de5c3fb90a84:vela-quickapp/src/pages/workspace/run-console/run-console.ux'],{cwd:root,encoding:'utf8'});
const script = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/^\s*import[^\n]*\n/gm, '').replace('export default', 'const pageDefinition =');

function fixture(code) {
  const timers = new Map(); const nativeCalls = []; const requests = []; const escaped = [];
  let nextId = 0;
  const schedule = (callback, delay, repeat) => {
    const id = ++nextId; timers.set(id, { callback, delay, repeat }); return id;
  };
  const context = vm.createContext({
    setTimeout: (callback, delay) => schedule(callback, delay, false),
    setInterval: (callback, delay) => schedule(callback, delay, true),
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    getCurrentClock: () => '00:00', navigateBack() {}, vibrate() {},
    createScriptRuntimeApi: (_app, options) => ({
      system: {
        files: { writeText(value) { nativeCalls.push(value.text); } },
        http: { request(value) { requests.push(value); } }
      },
      dialog: {},
      script: { exit() { if (options.isActive()) options.exit(); } }
    })
  });
  const { pageDefinition: page, formatConsoleArgument } = vm.runInContext(
    '(function () { ' + script + '\nreturn { pageDefinition, formatConsoleArgument }; })()', context);
  Object.assign(page, page.private, { code, $app: { $def: { editor: { name: 'audit.js' } } } });
  const runTimers = delay => {
    for (const [id, timer] of Array.from(timers)) {
      if (timer.delay !== delay || !timers.has(id)) continue;
      if (!timer.repeat) timers.delete(id);
      try { timer.callback(); } catch (error) { escaped.push(String(error)); }
    }
  };
  page.runCode(); runTimers(0);
  return { page, format: formatConsoleArgument, runTimers, nativeCalls, requests, escaped, context,
    intervals: () => Array.from(timers.values()).filter(timer => timer.repeat).length };
}

(async () => {
  const observations = {};
  const asynchronous = fixture("setInterval(() => { console.log('tick'); system.files.writeText({ text: 'tick' }); }, 10);");
  const initialRunId = asynchronous.page.runId;
  asynchronous.page.onStop();
  asynchronous.runTimers(10);
  observations.asyncStatus = { status: asynchronous.page.statusText, isRunning: asynchronous.page.isRunning,
    stopInvalidatedRun: asynchronous.page.runId !== initialRunId, nativeCallsAfterStop: asynchronous.nativeCalls.length };
  asynchronous.page.onRerun(); asynchronous.runTimers(0);
  const calls = asynchronous.nativeCalls.length;
  asynchronous.runTimers(10);
  observations.rerun = { liveIntervals: asynchronous.intervals(), nativeCallsInOneTick: asynchronous.nativeCalls.length - calls };

  const throwingNull = fixture('throw null;');
  observations.throwNull = { error: throwingNull.page.error, hasError: throwingNull.page.hasError,
    status: throwingNull.page.statusText, escaped: throwingNull.escaped };
  const throwingString = fixture("throw 'boom';");
  observations.throwString = { error: throwingString.page.error, hasError: throwingString.page.hasError };
  const longError = fixture("throw new Error('x'.repeat(100000));");
  observations.longError = { errorCharacters: longError.page.error.length };

  const asynchronousError = fixture("system.http.request({ success() { throw new Error('callback failed'); } });");
  let nativeError;
  try { asynchronousError.requests[0].success({}); } catch (error) { nativeError = String(error); }
  observations.callbackError = { escaped: nativeError, pageError: asynchronousError.page.error,
    hasError: asynchronousError.page.hasError, status: asynchronousError.page.statusText };
  const returned = fixture("return { then(resolve, reject) { system.files.writeText({ text: 'then observed' }); reject(new Error('returned rejection')); } };");
  observations.returnedThenable = { thenWasObserved: returned.nativeCalls.length > 0, pageError: returned.page.error };

  const truncated = fixture("console.log('x'.repeat(6200));");
  let propertyReads = 0;
  const argument = { get value() { propertyReads++; return 1; } };
  for (let i = 0; i < 100; i++) truncated.page.vwindow.console.log(argument);
  observations.afterTruncation = { propertyReads, displayedCharacters: truncated.page.result.length };
  let nestedReads = 0;
  const nested = { items: Array.from({ length: 3000 }, () => ({ get value() { nestedReads++; return 'payload'; } })) };
  const preview = truncated.format(nested);
  observations.nestedPreview = { propertyReads: nestedReads, previewCharacters: preview.length };

  const logBeforeError = fixture("console.log('important context'); throw new Error('failed');");
  observations.hiddenOutput = { savedOutput: logBeforeError.page.result, hasError: logBeforeError.page.hasError,
    templateHidesOutput: /class="result" if="{{!hasError}}"/.test(pageSource) };

  const dialogSource = fs.readFileSync(path.join(root, 'src/utils/runtime/scriptDialogApi.js'), 'utf8')
    .replace('export function ', 'function ').replace('export default { createScriptDialogApi };', 'return createScriptDialogApi;');
  const makeDialog = new Function(dialogSource)();
  let active = true; let request; let settlement = 'pending';
  const dialog = makeDialog({ openDialog(_type, value) { request = value; return 'id'; } }, () => active);
  dialog.confirm({}).then(() => { settlement = 'resolved'; }, () => { settlement = 'rejected'; });
  active = false; request.callbacks.onCancel(); await Promise.resolve();
  observations.inactiveDialog = { settlement };

  console.log(JSON.stringify(observations, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
