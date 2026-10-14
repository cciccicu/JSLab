'use strict';
const {createRpkBuilder,validateOptions,validateSigning,generateSigning,importSigningZip,digest}=require('./rpk-builder');
const defaultSigning=require('./rpk-default-signing');
const PRICE_CENTS=10;
function registerRpkApi(state, dependencies={}) {
  const {ctx,scripts,entitlements,json,currentUser,entitlementFor,consume}=state;
  const builds=ctx.db.table('rpk_builds');
  const build=dependencies.build || createRpkBuilder(ctx.rootDir);
  const generate=dependencies.generateSigning || generateSigning;
  const pending=new Map();
  let active=0;
  function access(req,res) {
    const user=currentUser(req);
    if (entitlementFor(user.id).cloud_enabled!==1) { json(res,403,{error:'activation_required'}); return null; }
    return user;
  }
  function failure(res,error) {
    if (error.code==='invalid_rpk_request') return json(res,400,{error:error.code,message:error.message});
    // Never log request bodies, scripts, icons, private keys or produced RPKs.
    return json(res,503,{error:'rpk_build_failed',message:'RPK 生成失败，未扣费。请检查引擎模板或稍后重试。'});
  }
  const guards=[ctx.users.requireAuth,ctx.security.csrfProtection];
  ctx.routes.frontend.post('/api/cloud/rpk/signing',...guards,async(req,res)=>{
    const user=access(req,res); if (!user) return;
    res.setHeader('Cache-Control','no-store');
    // 限制并发和请求频率，防止服务器过载。
    if (!consume('rpk-sign:'+user.id,5,60000) || active>=2) return json(res,429,{error:'rate_limited'});
    active++;
    try { return json(res,200,{signing:req.body?.archiveBase64!==undefined ? await importSigningZip(req.body.archiveBase64) : await generate(req.body?.author)}); }
    catch(error){return failure(res,error);} finally {active--;}
  });
  ctx.routes.frontend.post('/api/cloud/scripts/:id/rpk',...guards,async(req,res)=>{
    const user=access(req,res); if (!user) return;
    res.setHeader('Cache-Control','no-store');
    let options,signing,requestHash,row;
    const requestId=req.body?.requestId;
    if (typeof requestId!=='string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) return json(res,400,{error:'invalid_rpk_request',message:'缺少有效的打包请求标识。'});
    if (!/^[1-9]\d*$/.test(String(req.params.id)) || !Number.isSafeInteger(Number(req.params.id))) return json(res,404,{error:'not_found'});
    row=ctx.db.prepare(`SELECT id,name,source FROM ${scripts} WHERE id=? AND user_id=?`).get(Number(req.params.id),user.id);
    if (!row) return json(res,404,{error:'not_found'});
    try {
      options=validateOptions(req.body); signing=validateSigning(req.body.signing==null ? {} : req.body.signing) || validateSigning(defaultSigning);
      requestHash=digest(JSON.stringify({scriptId:row.id,scriptName:row.name,source:row.source,options,certificate:signing?.certificate || ''}));
    } catch(error){return failure(res,error);}
    const key=user.id+':'+requestId;
    const saved=ctx.db.prepare(`SELECT request_hash FROM ${builds} WHERE user_id=? AND request_id=?`).get(user.id,requestId);
    if (saved && saved.request_hash!==requestHash) return json(res,409,{error:'rpk_request_conflict',message:'同一请求标识的脚本或打包信息发生变化，请重新发起打包。'});
    if (pending.has(key)) {
      const existing=pending.get(key);
      if (existing.hash!==requestHash) return json(res,409,{error:'rpk_request_conflict'});
      const result=await existing.promise;
      return json(res,result.status,result.body);
    }
    if (!saved && entitlementFor(user.id).ai_credit_cents<PRICE_CENTS) return json(res,402,{error:'jslab_credit_insufficient',message:'JSLab 额度不足，本次打包需要 ¥0.10。'});
    // 限制并发和请求频率，防止服务器过载。
    if (!consume('rpk-build:'+user.id,5,60000) || active>=2) return json(res,429,{error:'rate_limited'});
    active++;
    const promise=(async()=>{
      try {
        const buffer=await build(row,options,signing);
        const settlement=ctx.db.transaction(()=>{
          const previous=ctx.db.prepare(`SELECT request_hash FROM ${builds} WHERE user_id=? AND request_id=?`).get(user.id,requestId);
          if (previous) return previous.request_hash===requestHash ? 'replay' : 'conflict';
          const debited=ctx.db.prepare(`UPDATE ${entitlements} SET ai_credit_cents=ai_credit_cents-?,updated_at=datetime('now') WHERE user_id=? AND cloud_enabled=1 AND ai_credit_cents>=?`).run(PRICE_CENTS,user.id,PRICE_CENTS);
          if (!debited.changes) return 'insufficient';
          ctx.db.prepare(`INSERT INTO ${builds}(user_id,request_id,request_hash,charged_cents) VALUES(?,?,?,?)`).run(user.id,requestId,requestHash,PRICE_CENTS);
          return 'charged';
        })();
        if (settlement==='insufficient') return {status:402,body:{error:'jslab_credit_insufficient',message:'JSLab 额度不足，未扣费。'}};
        if (settlement==='conflict') return {status:409,body:{error:'rpk_request_conflict'}};
        return {status:200,body:{filename:options.packageName+'.'+options.versionName+'.rpk',rpkBase64:buffer.toString('base64'),signing:null,chargedCents:settlement==='charged' ? PRICE_CENTS : 0,remainingCreditCents:entitlementFor(user.id).ai_credit_cents}};
      } catch(error) {
        return {status:error.code==='invalid_rpk_request' ? 400 : 503,body:{error:error.code==='invalid_rpk_request' ? error.code : 'rpk_build_failed',message:error.code==='invalid_rpk_request' ? error.message : 'RPK 生成失败，未扣费。请稍后重试。'}};
      }
    })();
    pending.set(key,{hash:requestHash,promise});
    try { const result=await promise; return json(res,result.status,result.body); }
    finally {pending.delete(key); active--;}
  });
}
module.exports={registerRpkApi,PRICE_CENTS};
