const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const templateRoot=path.resolve(__dirname,'../../vela-rpk-template');
execFileSync(process.execPath,[path.join(templateRoot,'scripts/sync-runtime.cjs'),'--check'],{cwd:templateRoot,stdio:'inherit'});
const assetRoot=path.resolve(__dirname,'../jslab-cloud/rpk-template');
const workspace=path.resolve(__dirname,'../..');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const contract=JSON.parse(fs.readFileSync(path.join(workspace,'runtime-contract.json'),'utf8')).identity;
for(const device of ['bandpro','redmi-watch5']) {
  const asset=device==='bandpro' ? assetRoot : path.join(assetRoot,device);
  const metadata=JSON.parse(fs.readFileSync(path.join(asset,'metadata.json'),'utf8'));
  if(hash(fs.readFileSync(path.join(asset,'template.zip')))!==metadata.sha256 || metadata.device!==device)throw new Error('RPK template mismatch: '+device);
  for(const [name,expected] of Object.entries(metadata.sources)) {
    const buffer=fs.readFileSync(path.join(templateRoot,'src',name));
    const data=/\.(js|ux|css|json|md|txt)$/i.test(name) ? buffer.toString('utf8').replace(/\r\n/g,'\n') : buffer;
    if(hash(data)!==expected)throw new Error('Rebuild RPK template sources: '+name);
  }
  for(const [name,expected] of Object.entries(metadata.targetSources || {})) {
    if(!name.startsWith('vela-quickapp/targets/redmi-watch5/') && !name.startsWith('vela-rpk-template/targets/redmi-watch5/'))throw new Error('Invalid target source path');
    const file=path.resolve(workspace,name);
    if(!file.startsWith(workspace+path.sep))throw new Error('Invalid target source path');
    if(hash(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'))!==expected)throw new Error('Rebuild '+device+' template: '+name);
  }
  if(metadata.runtimeContract!==contract)throw new Error('RPK runtime contract is stale');
}
console.log('Both device templates match their sources and runtime contract');
