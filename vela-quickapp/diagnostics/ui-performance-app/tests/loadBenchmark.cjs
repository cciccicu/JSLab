const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function load(overrides = {}) {
  const read = name => fs.readFileSync(path.join(root, 'src/utils', name), 'utf8');
  const layout = url(read('uiLayout.js'));
  const runtime = url(read('uiRuntime.js').replace("'./uiLayout.js'", JSON.stringify(layout)));
  const optimizedLayout = url(overrides.optimizedLayout || read('optimized/uiLayout.js'));
  const optimizedRuntime = url(read('optimized/uiRuntime.js').replace("'./uiLayout.js'", JSON.stringify(optimizedLayout)));
  const benchmark = read('benchmark.js').replace("'./uiLayout.js'", JSON.stringify(layout))
    .replace("'./uiRuntime.js'", JSON.stringify(runtime))
    .replace("'./optimized/uiRuntime.js'", JSON.stringify(optimizedRuntime))
    .replace("'./optimized/uiPublisher.js'", JSON.stringify(url(read('optimized/uiPublisher.js'))))
    .replace("'./ui2048Example.js'", JSON.stringify(url(overrides.gameSource || read('ui2048Example.js'))));
  return import(url(benchmark));
}
module.exports = { load, root };
