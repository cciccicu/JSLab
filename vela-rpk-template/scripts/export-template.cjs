const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeSource } = require('./source-content.cjs');
const root = path.resolve(__dirname,'..');
const JSZip = require(require.resolve('jszip',{paths:[root,path.resolve(root,'../vela-quickapp'),path.resolve(root,'../jslab-cloud')]}));
const assetRoot = path.resolve(root,'../jslab-cloud/rpk-template');
function files(dir, base=dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry => {
    const absolute=path.join(dir,entry.name);
    return entry.isDirectory() ? files(absolute,base) : [{name:path.relative(base,absolute).replace(/\\/g,'/'),data:fs.readFileSync(absolute)}];
  }).sort((a,b)=>a.name.localeCompare(b.name));
}
async function exportTemplate(project = root, device = 'bandpro') {
  if (!['bandpro','redmi-watch5'].includes(device)) throw new Error('Unsupported template device');
  const target = device === 'bandpro' ? assetRoot : path.join(assetRoot,device);
  const zip=new JSZip();
  for (const item of files(path.join(project,'build'))) {
    // Rebuild metadata after injecting user resources; never ship development maps.
    if (item.name.startsWith('META-INF/') || item.name.endsWith('.map')) continue;
    let data=item.data;
    if (item.name==='app.js') {
      const content=data.toString('utf8');
      const matches=[...content.matchAll(/JSON\.parse\('\{"package":"icu\.ccicc\.jslab\.template".*?'\)/g)];
      if (matches.length!==1) throw new Error('Expected one embedded application manifest');
      const payloadMarkers=[...content.matchAll(/(['"])__JSLAB_PAYLOAD_JSON__\1/g)];
      if (payloadMarkers.length!==1) throw new Error('Expected one embedded script payload marker');
      data=Buffer.from(content.replace(matches[0][0],'JSON.parse("__JSLAB_MANIFEST_JSON__")').replace(payloadMarkers[0][0],'"__JSLAB_PAYLOAD_JSON__"'));
    }
    zip.file(item.name,data,{date:new Date('2020-01-01T00:00:00Z'),createFolders:false});
  }
  if (!zip.file('common/payload.json')) throw new Error('Missing static payload resource');
  const buffer=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  const hashes=Object.fromEntries(files(path.join(root,'src')).map(item=>[item.name,crypto.createHash('sha256').update(normalizeSource(item.name,item.data)).digest('hex')]));
  const targetSources = {};
  if (device !== 'bandpro') for (const owner of [path.resolve(root,'../vela-quickapp'),root]) {
    const overlay = path.join(owner,'targets',device);
    if (!fs.existsSync(overlay)) continue;
    for (const item of files(overlay)) if (fs.existsSync(path.join(project,'src',item.name))) {
      const name = path.relative(path.resolve(root,'..'),path.join(overlay,item.name)).replace(/\\/g,'/');
      targetSources[name] = crypto.createHash('sha256').update(normalizeSource(item.name,item.data)).digest('hex');
    }
  }
  fs.mkdirSync(target,{recursive:true});
  fs.writeFileSync(path.join(target,'template.zip'),buffer);
  fs.writeFileSync(path.join(target,'metadata.json'),JSON.stringify({format:1,device,toolkit:'2.0.5',runtimeContract:JSON.parse(fs.readFileSync(path.resolve(root,'../types/runtime-contract.json'),'utf8')).identity,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),sources:hashes,targetSources},null,2)+'\n');
  console.log('Exported '+device+' template: '+buffer.length+' bytes');
}
module.exports = {exportTemplate};
if (require.main === module) exportTemplate().catch(error=>{console.error(error);process.exitCode=1;});
