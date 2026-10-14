const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const JSZip=require('../jslab-cloud/node_modules/jszip');
const {createRpkBuilder,validateOptions,validateSigning,generateSigning,importSigningZip,digest}=require('../jslab-cloud/lib/rpk-builder');
const defaultSigning=require('../jslab-cloud/lib/rpk-default-signing');
const {registerRpkApi}=require('../jslab-cloud/lib/rpk-service');
const {createServerContext}=require('../jslab-cloud/lib/server-context');
const {ensurePersistentState}=require('../jslab-cloud/lib/persistent-state');
const defaults={name:'独立应用',packageName:'com.example.standalone',versionName:'1.2.3',versionCode:12,author:'测试作者'};
let keys;
test.before(async()=>{keys=await generateSigning('作者/中文');});
function fixture(dependencies={}) {
  const raw=new DatabaseSync(':memory:'),routes=new Map();
  const ctx={rootDir:path.resolve(__dirname,'../jslab-cloud'),config:{register(){},get(){return null;}},
    db:{table:name=>'cloud_'+name,prepare:sql=>raw.prepare(sql),exec:sql=>raw.exec(sql),transaction:fn=>(...args)=>{raw.exec('BEGIN');try{const result=fn(...args);raw.exec('COMMIT');return result;}catch(error){raw.exec('ROLLBACK');throw error;}}},
    users:{current:req=>req.user || null,requireAuth(req,res,next){return req.user ? next() : res.status(401).json({error:'auth_required'});}},
    security:{csrfProtection(req,res,next){return req.body?._csrf==='token' ? next() : res.status(403).json({error:'csrf'});}},
    routes:{frontend:{post:(url,...handlers)=>routes.set(url,handlers)}}};
  ensurePersistentState(ctx); const state=createServerContext(ctx); registerRpkApi(state,dependencies);
  raw.exec("INSERT INTO cloud_user_entitlements(user_id,cloud_enabled,ai_enabled,ai_credit_cents) VALUES(1,1,1,20),(2,1,1,20); INSERT INTO cloud_scripts(user_id,name,source,hash,checksum) VALUES(1,'旧脚本.js','console.log(1)','hash','sum'),(2,'private.js','secret','hash2','sum2');");
  async function request(body={},id='1',user={id:1},route='/api/cloud/scripts/:id/rpk') {
    const req={user,params:{id},body:{...defaults,signing:keys,requestId:'request-1234567890',_csrf:'token',...body}};
    const res={statusCode:200,headers:{},status(value){this.statusCode=value;return this;},json(body){this.body=body;return this;},setHeader(key,value){this.headers[key]=value;}};
    let i=0; const handlers=routes.get(route); const next=()=>handlers[i++]?.(req,res,next); await next(); return res;
  }
  return {raw,state,routes,request,balance:()=>raw.prepare('SELECT ai_credit_cents FROM cloud_user_entitlements WHERE user_id=1').get().ai_credit_cents};
}
// Independent cryptographic checks: reconstruct the original ZIP sections, verify
// both the RSA signature and the block's SHA-256 digest. A renamed ZIP fails.
function verifySignature(buffer,certificate) {
  let eocd=buffer.length-22;
  while(buffer.readUInt32LE(eocd)!==0x06054b50)eocd--;
  const central=buffer.readUInt32LE(eocd+16);
  assert.equal(buffer.toString('utf8',central-16,central),'RPK Sig Block 42');
  const size=Number(buffer.readBigUInt64LE(central-24));
  const start=central-size-8;
  assert.equal(Number(buffer.readBigUInt64LE(start)),size);
  assert.equal(buffer.readUInt32LE(start+16),0x01000101);
  const signedSize=buffer.readUInt32LE(start+28), signedData=buffer.subarray(start+32,start+32+signedSize);
  const signatures=start+32+signedSize;
  assert.equal(buffer.readUInt32LE(signatures+8),0x0103);
  const signatureSize=buffer.readUInt32LE(signatures+12);
  const signature=buffer.subarray(signatures+16,signatures+16+signatureSize);
  assert.ok(crypto.verify('RSA-SHA256',signedData,certificate,signature));
  const footer=Buffer.from(buffer.subarray(eocd)); footer.writeUInt32LE(start,16);
  const sections=[buffer.subarray(0,start),buffer.subarray(central,eocd),footer];
  const hashes=sections.map(section=>{const prefix=Buffer.alloc(5);prefix[0]=0xa5;prefix.writeUInt32LE(section.length,1);return crypto.createHash('sha256').update(prefix).update(section).digest();});
  const prefix=Buffer.from([0x5a,3,0,0,0]);
  const expected=crypto.createHash('sha256').update(Buffer.concat([prefix,...hashes])).digest();
  assert.ok(expected.equals(signedData.subarray(16,48)));
}
test('generated signing ZIP contains a reusable matching RSA key and certificate',async()=>{
  assert.ok(validateSigning(keys));
  const archive=await JSZip.loadAsync(keys.archiveBase64,{base64:true});
  assert.equal(await archive.file('private.pem').async('string'),keys.privateKey);
  assert.equal(await archive.file('certificate.pem').async('string'),keys.certificate);
  const other=await generateSigning('另一位作者');
  assert.throws(()=>validateSigning({privateKey:other.privateKey,certificate:keys.certificate}),/匹配/);
  assert.throws(()=>validateSigning({privateKey:keys.privateKey}),/同时上传/);
});
test('RPK contains changed manifests and static source, with valid nested signatures and resource digests',async()=>{
  const source="ui.render(() => { ui.text('旧脚本'); }); ui.show(); console.log('</script>\\n');";
  const builder=createRpkBuilder();
  const icon=fs.readFileSync(path.resolve(__dirname,'../../vela-rpk-template/src/common/images/info.png'));
  const options=validateOptions({...defaults,iconBase64:icon.toString('base64'),options:{disableConsole:true,hideTopBar:true}});
  const writes=['writeFile','writeFileSync','createWriteStream','mkdir','mkdirSync'].map(name=>[name,fs[name]]);
  for(const [name] of writes)fs[name]=()=>{throw new Error('Forbidden filesystem write');};
  let buffer;
  try{buffer=await builder({name:'旧脚本.js',source},options,keys);}finally{for(const [name,fn]of writes)fs[name]=fn;}
  verifySignature(buffer,keys.certificate);
  const zip=await JSZip.loadAsync(buffer);
  for(const name of ['manifest.json','manifest-watch.json']){
    const manifest=JSON.parse(await zip.file(name).async('string'));
    assert.equal(manifest.package,defaults.packageName);assert.equal(manifest.name,defaults.name);assert.equal(manifest.versionCode,12);
  }
  const payload=JSON.parse(await zip.file('common/payload.json').async('string'));
  assert.ok(icon.equals(await zip.file('common/logo.png').async('nodebuffer')));
  assert.equal(payload.code,source);assert.equal(payload.name,'旧脚本.js');assert.equal(payload.options.disableConsole,true);
  const app=await zip.file('app.js').async('string');
  assert.ok(app.includes(defaults.packageName));assert.ok(!app.includes('__JSLAB_MANIFEST_JSON__'));assert.ok(!app.includes('icu.ccicc.jslab.template'));
  assert.ok(!app.includes('__JSLAB_PAYLOAD_JSON__'));
  const cert=await zip.file('META-INF/CERT').async('nodebuffer');verifySignature(cert,keys.certificate);
  const certZip=await JSZip.loadAsync(cert),hashes=JSON.parse(await certZip.file('hash.json').async('string'));
  for(const [name,hash]of Object.entries(hashes.digests))assert.equal(digest(await zip.file(name).async('nodebuffer')),hash,name);
  assert.ok(!Object.keys(zip.files).some(name=>/private\.pem|certificate\.pem|\.map$/.test(name)));
  const about=await zip.file('pages/about/about.js').async('string');
  assert.match(about,/由 JSLab Cloud 生成/);assert.match(about,/使用 JSLab 脚本引擎运行/);
  const second=await builder({name:'next.js',source:'console.log(2)'},validateOptions({...defaults,packageName:'com.example.second'}),keys);
  const secondZip=await JSZip.loadAsync(second);
  assert.equal(JSON.parse(await secondZip.file('common/payload.json').async('string')).code,'console.log(2)');
  assert.equal(JSON.parse(await zip.file('common/payload.json').async('string')).code,source);
});
test('final compiled RPK loads exact script data even when firmware rejects resource reads with 202',async()=>{
  const source="globalThis.userCodeExecuted = true;\nconsole.log('中文😀');\n// \" \\ $& $` $' __JSLAB_PAYLOAD_JSON__ __JSLAB_MANIFEST_JSON__\u2028\u2029";
  const options=validateOptions({...defaults,options:{disableConsole:true,hideTopBar:true}});
  const buffer=await createRpkBuilder()({name:'旧脚本.js',source},options,keys);
  verifySignature(buffer,keys.certificate);
  const zip=await JSZip.loadAsync(buffer);
  const app=await zip.file('app.js').async('string');
  let reads=0;
  const native={readText({fail}){reads++;fail('unsupported resource URI',202);}};
  const sandbox={$app_require$:()=>native,setTimeout,clearTimeout,setInterval,clearInterval};
  const factory=vm.runInNewContext('('+app.replace(/^export default /,'')+')',sandbox);
  const exports={};factory(sandbox,sandbox,sandbox,exports,()=>{});
  const first=await exports.default.loadPayload(), second=await exports.default.loadPayload();
  assert.equal(reads,0);assert.equal(sandbox.userCodeExecuted,undefined);
  assert.equal(first,second);assert.equal(first.code,source);
  assert.equal(first.name,'旧脚本.js');assert.equal(first.appName,defaults.name);
  assert.equal(first.options.disableConsole,true);assert.equal(first.options.hideTopBar,true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)),JSON.parse(await zip.file('common/payload.json').async('string')));
  assert.equal(exports.default.manifest.package,defaults.packageName);
  exports.default.onDestroy();
  assert.equal((await exports.default.loadPayload()).code,source);assert.equal(reads,0);
});
test('packaged bundled example executes through the compiled loader and real UI runtime',async()=>{
  const {fixture}=require('../../vela-rpk-template/tests/helpers/runner.cjs');
  const example=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../vela-rpk-template/src/common/payload.json'),'utf8'));
  const options=validateOptions({...defaults,name:example.appName});
  const zip=await JSZip.loadAsync(await createRpkBuilder()({name:example.name,source:example.code},options,keys));
  const app=await zip.file('app.js').async('string');
  const native={readText(){throw new Error('Resource read must not be needed');}};
  const sandbox={$app_require$:()=>native,setTimeout,clearTimeout,setInterval,clearInterval};
  const factory=vm.runInNewContext('('+app.replace(/^export default /,'')+')',sandbox);
  const exports={};factory(sandbox,sandbox,sandbox,exports,()=>{});
  const run=await fixture(example.code,{},()=>exports.default.loadPayload());
  await Promise.resolve();
  assert.equal(run.page.error,'');assert.equal(run.page.view,'ui');assert.equal(run.page.hasUi,true);
  assert.equal(run.page.pageTitle,example.appName);
  assert.deepEqual(run.page.uiNodes.map(node=>node.text),['独立快应用','使用 JSLab 脚本引擎运行']);
  run.page.onDestroy();exports.default.onDestroy();
});
test('adapted signer matches the installed official toolkit for identical ZIP input',async t=>{
  const upstream=path.resolve(__dirname,'../../vela-quickapp/node_modules/@aiot-toolkit/aiotpack/lib/compiler/javascript/vela/utils/signature/SignUtil.js');
  if(!fs.existsSync(upstream))return t.skip('development toolkit is not installed');
  const zip=new JSZip();zip.file('manifest.json',JSON.stringify(defaults));
  const original=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  const hashes=[{name:'manifest.json',hash:crypto.createHash('sha256').update(JSON.stringify(defaults)).digest()}];
  const adapted=require('../jslab-cloud/lib/rpk-signature/SignUtil').default;
  const official=require(upstream).default;
  const a=adapted.doSign(Buffer.from(original),hashes,keys.privateKey,keys.certificate);
  const b=official.doSign(Buffer.from(original),hashes,keys.privateKey,keys.certificate);
  assert.ok(a.equals(b));verifySignature(a,keys.certificate);
  const corrupt=Buffer.from(a);corrupt[50]^=1;
  assert.throws(()=>verifySignature(corrupt,keys.certificate));
});
test('metadata and upload validation rejects unsafe names, version codes, icons and options',()=>{
  for(const body of [{packageName:'../../escape'},{name:'evil\nname'},{versionCode:1.2},{versionCode:0},{versionCode:2147483648},{versionName:'../secret'},{options:{unknown:true}},{options:{disableConsole:'true'}},{iconBase64:Buffer.from('not PNG').toString('base64')}])assert.throws(()=>validateOptions({...defaults,...body}));
  const corrupt=fs.readFileSync(path.resolve(__dirname,'../../vela-rpk-template/src/common/images/info.png'));corrupt[33]^=1;
  assert.throws(()=>validateOptions({...defaults,iconBase64:corrupt.toString('base64')}),/损坏/);
});
test('browser-only RPK API enforces login, CSRF, activation and ownership before billing',async()=>{
  const f=fixture();try{
    assert.equal((await f.request({},'1',null)).statusCode,401);
    assert.equal((await f.request({_csrf:'wrong'})).statusCode,403);
    assert.equal((await f.request({},'2')).statusCode,404);
    f.raw.exec('UPDATE cloud_user_entitlements SET cloud_enabled=0 WHERE user_id=1');
    assert.equal((await f.request()).statusCode,403);assert.equal(f.balance(),20);
    assert.ok(!f.routes.has('/api/cloud/device/scripts/:id/rpk'));
  }finally{f.raw.close();}
});
test('success deducts exactly 10 cents; concurrent retries and restart replays never double charge',async()=>{
  let calls=0,release;
  const gate=new Promise(resolve=>release=resolve);
  const f=fixture({build:async()=>{calls++;await gate;return Buffer.from('RPK');}});
  try{
    const first=f.request(),second=f.request();release();
    const results=await Promise.all([first,second]);
    assert.equal(calls,1);assert.equal(f.balance(),10);assert.equal(results[0].statusCode,200);assert.equal(results[1].statusCode,200);
    assert.equal(results[0].headers['Cache-Control'],'no-store');
    const replay=await f.request();assert.equal(replay.body.chargedCents,0);assert.equal(f.balance(),10);
    const conflict=await f.request({name:'changed'});assert.equal(conflict.statusCode,409);
    assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM cloud_rpk_builds').get().n,1);
  }finally{f.raw.close();}
});
test('failed builds, invalid signing, insufficient balance and concurrent spending leave no failed charges',async()=>{
  const f=fixture({build:async()=>{throw new Error('sensitive detail');}});try{
    const result=await f.request();assert.equal(result.statusCode,503);assert.equal(f.balance(),20);assert.ok(!JSON.stringify(result).includes('sensitive detail'));
    assert.equal((await f.request({signing:{privateKey:'invalid',certificate:'invalid'}})).statusCode,400);assert.equal(f.balance(),20);
    f.raw.exec('UPDATE cloud_user_entitlements SET ai_credit_cents=9');assert.equal((await f.request()).statusCode,402);
  }finally{f.raw.close();}
  let release;const gate=new Promise(resolve=>release=resolve);
  const race=fixture({build:async()=>{await gate;return Buffer.from('RPK');}});try{
    race.raw.exec('UPDATE cloud_user_entitlements SET ai_credit_cents=10');
    const requests=[race.request({requestId:'one-request-12345678'}),race.request({requestId:'two-request-12345678'})];release();
    assert.deepEqual((await Promise.all(requests)).map(r=>r.statusCode).sort(),[200,402]);assert.equal(race.balance(),0);
  }finally{race.raw.close();}
});
test('online signing and fixed default signing have no durable user key or source storage',async()=>{
  let generatedCalls=0; const used=[];
  const f=fixture({build:async(row,options,signing)=>{used.push(signing);return Buffer.from('RPK');},generateSigning:async author=>{generatedCalls++;return generateSigning(author);}});try{
    const generated=await f.request({},'1',{id:1},'/api/cloud/rpk/signing');assert.equal(generated.statusCode,200);assert.ok(validateSigning(generated.body.signing));assert.equal(f.balance(),20);
    const packaged=await f.request({signing:undefined});assert.equal(packaged.statusCode,200);assert.equal(packaged.body.signing,null);assert.equal(f.balance(),10);
    const replay=await f.request({signing:null});assert.equal(replay.statusCode,200);assert.equal(replay.body.chargedCents,0);assert.equal(f.balance(),10);
    assert.equal(generatedCalls,1);assert.deepEqual(used,[defaultSigning,defaultSigning]);
    const row=f.raw.prepare('SELECT * FROM cloud_rpk_builds').get();assert.deepEqual(Object.keys(row),['user_id','request_id','request_hash','charged_cents','created_at']);
  }finally{f.raw.close();}
});
test('signature ZIP imports reusable keys and rejects malformed, mismatched and oversized archives',async()=>{
  const imported=await importSigningZip(keys.archiveBase64);
  assert.equal(imported.privateKey,keys.privateKey);assert.equal(imported.certificate,keys.certificate);
  await assert.rejects(importSigningZip(Buffer.from('not a ZIP').toString('base64')),/ZIP/);
  const archive=await JSZip.loadAsync(keys.archiveBase64,{base64:true});
  archive.file('unexpected.txt','extra');
  await assert.rejects(importSigningZip(await archive.generateAsync({type:'base64'})),/ZIP/);
  archive.remove('unexpected.txt');archive.file('private.pem','x'.repeat(12001));
  await assert.rejects(importSigningZip(await archive.generateAsync({type:'base64',compression:'DEFLATE'})),/ZIP/);
  archive.file('private.pem',(await generateSigning('Other')).privateKey);
  await assert.rejects(importSigningZip(await archive.generateAsync({type:'base64',compression:'DEFLATE'})),/匹配/);
  const f=fixture();try{
    const uploaded=await f.request({archiveBase64:keys.archiveBase64},'1',{id:1},'/api/cloud/rpk/signing');
    assert.equal(uploaded.statusCode,200);assert.equal(uploaded.body.signing.privateKey,keys.privateKey);assert.equal(f.balance(),20);
    assert.equal((await f.request({archiveBase64:'broken'},'1',{id:1},'/api/cloud/rpk/signing')).statusCode,400);
    assert.equal(f.balance(),20);
  }finally{f.raw.close();}
});
test('fixed default signing identity verifies actual RPKs across builder instances',async()=>{
  assert.ok(validateSigning(defaultSigning));
  for (const builder of [createRpkBuilder(),createRpkBuilder()]) {
    verifySignature(await builder({name:'legacy.js',source:'console.log(1)'},validateOptions(defaults),defaultSigning),defaultSigning.certificate);
  }
});
