// Retain the community release entry point; select the device before compilation.
const {buildApp, targetName} = require('./device-build.cjs');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--target')) throw new Error('Usage: release-community.cjs [--target bandpro|redmi-watch5]');
buildApp({target:targetName(args[1] || 'bandpro'), community:true});
