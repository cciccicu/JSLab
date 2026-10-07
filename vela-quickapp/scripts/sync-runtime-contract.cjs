const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const contract=JSON.parse(fs.readFileSync(path.join(root,'runtime-contract.json'),'utf8'));
const js=`// Generated at build time by scripts/sync-runtime-contract.cjs.\nexport const RUNTIME_CONTRACT = ${JSON.stringify(contract.identity)};\nexport const LOG_LIMITS = ${JSON.stringify(contract.logs)};\nexport const DIALOG_LIMITS = ${JSON.stringify(contract.dialogs)};\n`;
fs.writeFileSync(path.join(root,'vela-quickapp/src/utils/runtime/runtimeContract.js'),js);
fs.writeFileSync(path.join(root,'ccicc-plugin-cloud/jslab-cloud/lib/runtime-contract.json'),JSON.stringify(contract,null,2)+'\n');
console.log('Synced runtime contract '+contract.identity);
