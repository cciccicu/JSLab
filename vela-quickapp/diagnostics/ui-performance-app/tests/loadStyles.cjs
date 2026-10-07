const fs = require('node:fs');
const TemplateUtil = require('@aiot-toolkit/parser/lib/ux/translate/vela/utils/TemplateUtil').default;
const context = require('@aiot-toolkit/parser/lib/ux/translate/vela/VelaContext').default;
// Use the exact helper injected into app.ux by our installed build tool.
const loader = fs.readFileSync(require.resolve('@aiot-toolkit/aiotpack/lib/utils/ux/UxLoaderUtils'), 'utf8');
const helper = loader.match(/var \$translateStyle\$ = function \(value\) \{[\s\S]*?\n  \};/);
if (!helper) throw new Error('Toolkit style helper changed; inspect before updating this test');
const translateStyle = new Function(helper[0] + '\nreturn $translateStyle$;')();
async function compileStyle(value) {
  const logs = [];
  const util = new TemplateUtil(context, { filePath: 'style-test.ux', onLog: log => logs.push(log) }, { sourceRoot: 'src' });
  const code = await util.translateAttributeValue({ name: 'style', value }, ['node']);
  if (logs.length) throw new Error(JSON.stringify(logs));
  const create = new Function('_vm_', 'node', 'global', 'return (' + code + ');');
  return (page, node, translate = translateStyle) => create(page, node, { $translateStyle$: translate })();
}
module.exports = { compileStyle, translateStyle };
