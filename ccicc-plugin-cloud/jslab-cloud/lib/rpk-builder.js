'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const JSZip = require('jszip');
const {PNG} = require('pngjs');
const { KJUR, KEYUTIL } = require('jsrsasign');
const SignUtil = require('./rpk-signature/SignUtil').default;
const ZipUtil = require('./rpk-signature/ZipUtil').default;
const generateKeyPair = promisify(crypto.generateKeyPair);
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
function invalid(message) { const error=new Error(message); error.code='invalid_rpk_request'; return error; }
function text(value,max,label) {
  if (typeof value!=='string' || !value.trim() || value.trim().length>max || /[\x00-\x1f\x7f]/.test(value)) throw invalid(label+'无效');
  return value.trim();
}
function validateOptions(body={}) {
  const name=text(body.name,30,'应用名称');
  const packageName=text(body.packageName,120,'包名');
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){1,}$/.test(packageName)) throw invalid('包名需要至少两段小写字母、数字或下划线，每段以字母开头');
  const versionName=text(body.versionName,32,'版本号');
  if (!/^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(versionName)) throw invalid('版本号格式无效');
  const versionCode=Number(body.versionCode);
  if (!/^\d+$/.test(String(body.versionCode)) || !Number.isSafeInteger(versionCode) || versionCode<1 || versionCode>2147483647) throw invalid('versionCode 必须是 1 到 2147483647 的整数');
  const author=text(body.author,80,'作者');
  const options=body.options || {};
  if (typeof options!=='object' || Array.isArray(options)) throw invalid('打包选项无效');
  for (const key of Object.keys(options)) if (!['disableConsole','hideTopBar'].includes(key) || typeof options[key]!=='boolean') throw invalid('打包选项无效');
  let icon=null;
  if (body.iconBase64) {
    if (typeof body.iconBase64!=='string' || body.iconBase64.length>44000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.iconBase64)) throw invalid('图标需要为不超过 32 KiB 的 PNG');
    icon=Buffer.from(body.iconBase64,'base64');
    if (icon.length>32768 || icon.length<33 || !icon.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) || icon.toString('ascii',12,16)!=='IHDR' || icon.readUInt32BE(16)<1 || icon.readUInt32BE(20)<1 || icon.readUInt32BE(16)>512 || icon.readUInt32BE(20)>512) throw invalid('图标需要为有效 PNG，尺寸不超过 512×512，大小不超过 32 KiB');
    try { PNG.sync.read(icon,{checkCRC:true}); }
    catch (_) { throw invalid('PNG 图标数据损坏，请重新导出图标'); }
  }
  return {name,packageName,versionName,versionCode,author,icon,options:{disableConsole:options.disableConsole===true,hideTopBar:options.hideTopBar===true}};
}
function validateSigning(body={}) {
  if (!body || typeof body!=='object' || Array.isArray(body)) throw invalid('签名信息需要 PEM 私钥和证书');
  const privateKey=body.privateKey || '', certificate=body.certificate || '';
  if (!privateKey && !certificate) return null;
  if (typeof privateKey!=='string' || typeof certificate!=='string' || privateKey.length>12000 || certificate.length>12000 || !privateKey || !certificate) throw invalid('请同时上传 PEM 私钥和证书');
  try {
    const key=crypto.createPrivateKey(privateKey), cert=new crypto.X509Certificate(certificate);
    const bits=key.asymmetricKeyDetails?.modulusLength;
    if (key.asymmetricKeyType!=='rsa' || bits<2048 || bits>4096 || !cert.checkPrivateKey(key) || Date.parse(cert.validFrom)>Date.now() || Date.parse(cert.validTo)<=Date.now()) throw new Error('mismatch');
    return {privateKey,certificate};
  } catch (_) { throw invalid('签名需要有效且匹配的 RSA 2048–4096 位 PEM 私钥与 X.509 证书（私钥不得加密）'); }
}
async function generateSigning(author='JSLab') {
  author=text(author,80,'作者');
  const pair=await generateKeyPair('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const date = value => new Date(value).toISOString().replace(/[-:T]/g,'').slice(0,14)+'Z';
  const certificate=KJUR.asn1.x509.X509Util.newCertPEM({
    serial:{hex:crypto.randomBytes(16).toString('hex')}, sigalg:'SHA256withRSA',
    issuer:{array:[[{type:'CN',value:author}]]}, subject:{array:[[{type:'CN',value:author}]]},
    notbefore:{str:date(Date.now()-60000)}, notafter:{str:date(Date.now()+10*365*86400000)},
    sbjpubkey:KEYUTIL.getKey(pair.publicKey), cakey:KEYUTIL.getKey(pair.privateKey)
  });
  const zip=new JSZip();
  zip.file('private.pem',pair.privateKey); zip.file('certificate.pem',certificate);
  return {privateKey:pair.privateKey,certificate,archiveBase64:await zip.generateAsync({type:'base64',compression:'DEFLATE'})};
}
async function importSigningZip(base64) {
  if (typeof base64!=='string' || base64.length>44000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw invalid('签名 ZIP 不能超过 32 KiB');
  try {
    const buffer=Buffer.from(base64,'base64');
    if (buffer.length>32768) throw new Error('size');
    // Bound both archive size and advertised expanded sizes before decompression.
    const zip=await JSZip.loadAsync(buffer);
    const entries=Object.values(zip.files);
    if (entries.length!==2 || !entries.every(file=>!file.dir && ['private.pem','certificate.pem'].includes(file.name) && (file.unsafeOriginalName || file.name)===file.name && file._data.uncompressedSize<=12000)) throw new Error('entries');
    const readPem=file=>new Promise((resolve,reject)=>{
      const chunks=[]; let size=0;
      const stream=file.internalStream('nodebuffer');
      stream.on('data',chunk=>{
        size+=chunk.length;
        if (size>12000) {stream.pause();reject(invalid('PEM 文件超过大小限制'));return;}
        chunks.push(chunk);
      }).on('error',reject).on('end',()=>resolve(Buffer.concat(chunks).toString('utf8'))).resume();
    });
    const signing=validateSigning({privateKey:await readPem(zip.file('private.pem')),certificate:await readPem(zip.file('certificate.pem'))});
    if (!signing) throw new Error('empty');
    return {...signing,archiveBase64:base64};
  } catch (error) {
    if (error.code==='invalid_rpk_request') throw error;
    throw invalid('请选择包含 private.pem 和 certificate.pem 的有效签名 ZIP（无需解压）');
  }
}
function createRpkBuilder(root=path.resolve(__dirname,'..')) {
  let template;
  async function load() {
    if (!template) template=(async()=>{
      // These are immutable engine assets, never user-provided paths or content.
      const buffer=fs.readFileSync(path.join(root,'rpk-template/template.zip'));
      const meta=JSON.parse(fs.readFileSync(path.join(root,'rpk-template/metadata.json'),'utf8'));
      if (digest(buffer)!==meta.sha256 || meta.format!==1) throw new Error('Invalid RPK engine template');
      const zip=await JSZip.loadAsync(buffer);
      return Promise.all(Object.values(zip.files).filter(file=>!file.dir).map(async file=>({path:file.name,content:await file.async('nodebuffer')})));
    })().catch(error=>{template=null; throw error;});
    return template;
  }
  return async function build(script,options,signing) {
    if (typeof script.source!=='string' || Buffer.byteLength(script.source)>48*1024) throw invalid('脚本不能超过 48 KiB');
    const files=new Map((await load()).map(file=>[file.path,file.content]));
    const update=manifest=>({...manifest,package:options.packageName,name:options.name,versionName:options.versionName,versionCode:options.versionCode,author:options.author});
    for (const name of [...files.keys()].filter(name=>/^manifest(?:-\w+)?\.json$/.test(name))) files.set(name,Buffer.from(JSON.stringify(update(JSON.parse(files.get(name))),null,2)));
    const manifest=JSON.parse(files.get('manifest.json'));
    const payload=JSON.stringify({name:script.name,appName:options.name,versionName:options.versionName,author:options.author,options:options.options,code:script.source});
    const app=files.get('app.js').toString('utf8');
    if (app.split('"__JSLAB_MANIFEST_JSON__"').length!==2) throw new Error('Missing embedded manifest marker');
    if (app.split('"__JSLAB_PAYLOAD_JSON__"').length!==2) throw new Error('Missing embedded script payload marker');
    const jsString=value=>JSON.stringify(value).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    files.set('app.js',Buffer.from(app.replace('"__JSLAB_MANIFEST_JSON__"',()=>jsString(JSON.stringify(manifest))).replace('"__JSLAB_PAYLOAD_JSON__"',()=>jsString(payload))));
    files.set('common/payload.json',Buffer.from(payload));
    if (options.icon) files.set('common/logo.png',options.icon);
    const comment=JSON.stringify({originType:'jslab-cloud',toolkit:'2.0.5',component:true});
    files.set('META-INF/build.txt',Buffer.from('originType=jslab-cloud\ntoolkit=2.0.5\ncomponent=true'));
    const digests=Object.fromEntries([...files].map(([name,data])=>[name,digest(data)]));
    files.set('META-INF/CERT',await ZipUtil.createZipBufferFromFileList([{path:'hash.json',content:JSON.stringify({algorithm:'SHA-256',digests})}],comment));
    // Match the toolkit's streaming order: CERT, manifests, app, entry, common, other pages, build info.
    const priority=name=> name==='META-INF/CERT' ? 0 : /^manifest-/.test(name) ? 1 : name==='manifest.json' ? 2 : name==='app.js' ? 3 : name.startsWith(manifest.router.entry+'/') ? 4 : name.startsWith('common/') ? 5 : name==='META-INF/build.txt' ? 9 : 6;
    const resourceList=[...files].sort((a,b)=>priority(a[0])-priority(b[0])).map(([fileBuildPath,fileContentBuffer])=>({fileBuildPath,fileContentBuffer}));
    const target={resourceList,comment,getResource(name){return resourceList.find(file=>file.fileBuildPath===name);}};
    return SignUtil.signPackage(target,Buffer.from(signing.privateKey),Buffer.from(signing.certificate));
  };
}
module.exports={createRpkBuilder,validateOptions,validateSigning,generateSigning,importSigningZip,digest};
