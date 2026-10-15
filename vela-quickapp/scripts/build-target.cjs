const {buildApp, targetName} = require('./device-build.cjs');
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Missing value for ' + name);
  return args[index + 1];
}
for (let i=0;i<args.length;i+=2) if (!['--target','--mode','--edition'].includes(args[i])) throw new Error('Unknown option: ' + args[i]);
const edition = option('--edition', 'full');
if (!['full','community'].includes(edition)) throw new Error('Unsupported edition: ' + edition);
buildApp({target:targetName(option('--target', 'bandpro')), community:edition === 'community', mode:option('--mode', 'release')});
