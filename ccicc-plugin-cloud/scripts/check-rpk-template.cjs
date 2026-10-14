const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const templateRoot=path.resolve(__dirname,'../../vela-rpk-template');
execFileSync(process.execPath,[path.join(templateRoot,'scripts/sync-runtime.cjs'),'--check'],{cwd:templateRoot,stdio:'inherit'});
const assetRoot=path.resolve(__dirname,'../jslab-cloud/rpk-template');
const metadata=JSON.parse(fs.readFileSync(path.join(assetRoot,'metadata.json'),'utf8'));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
if(hash(fs.readFileSync(path.join(assetRoot,'template.zip')))!==metadata.sha256)throw new Error('RPK 模板包校验失败');
for(const [name,expected]of Object.entries(metadata.sources)) {
  const buffer=fs.readFileSync(path.join(templateRoot,'src',name));
  const data=/\.(js|ux|css|json|md|txt)$/i.test(name) ? buffer.toString('utf8').replace(/\r\n/g,'\n') : buffer;
  if(hash(data)!==expected)throw new Error('RPK 模板源文件已改变，请在 vela-rpk-template 执行 npm run build：'+name);
}
const contract=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../runtime-contract.json'),'utf8')).identity;
if(JSON.stringify(metadata.runtimeContract)!==JSON.stringify(contract))throw new Error('RPK 模板运行时协议已过期');
console.log('RPK template matches current sources and runtime contract');
