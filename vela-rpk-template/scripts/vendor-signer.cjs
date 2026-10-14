// Development-only extraction of the official ISC signer. No compiler on server.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const from=path.resolve(root,'../vela-quickapp/node_modules/@aiot-toolkit/aiotpack/lib/compiler/javascript/vela/utils/signature');
const to=path.resolve(root,'../ccicc-plugin-cloud/jslab-cloud/lib/rpk-signature');
fs.mkdirSync(to,{recursive:true});
const hashes={};
for (const name of ['SignUtil.js','Signer.js','Base64.js','CRC32.js']) {
  let content=fs.readFileSync(path.join(from,name),'utf8');
  hashes[name]=crypto.createHash('sha256').update(content).digest('hex');
  if (name==='SignUtil.js') {
    const start=content.indexOf('  static async getProjectSignConfig(');
    const end=content.indexOf('  static async signPackage(',start);
    content=content.slice(0,start)+content.slice(end);
    content=content.replace('require("@aiot-toolkit/shared-utils")','require("./shared")')
      .replace('require("../ZipUtil")','require("./ZipUtil")')
      .replace(/^var _(fsExtra|path|CompileMode) = .*\r?\n/gm,'');
  }
  fs.writeFileSync(path.join(to,name),'// Adapted from @aiot-toolkit/aiotpack 2.0.5 (ISC). See NOTICE.md.\n'+content);
}
fs.writeFileSync(path.join(to,'upstream-hashes.json'),JSON.stringify(hashes,null,2)+'\n');
