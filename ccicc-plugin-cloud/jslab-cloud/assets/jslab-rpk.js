(function () {
  'use strict';
  var form=document.querySelector('[data-cloud-rpk-form]');
  if (!form) return;
  var signing=null, signingUrl=null, rpkUrl=null, rpkFilename='', busy=false, lastBody='', requestId='';
  var status=form.querySelector('[data-rpk-status]');
  var signingStatus=form.querySelector('[data-rpk-signing-status]');
  var signingDownload=form.querySelector('[data-rpk-signing-download]');
  var progress=form.querySelector('[data-rpk-progress]');
  var download=form.querySelector('[data-rpk-download]');
  function stage(completed,label) {
    progress.classList.remove('d-none');
    progress.querySelector('[role="progressbar"]').setAttribute('aria-valuenow',String(completed));
    progress.querySelector('[data-rpk-progress-bar]').style.width=(completed*25)+'%';
    progress.querySelector('[data-rpk-progress-label]').textContent=label;
  }
  function clearBuild() {
    if (rpkUrl) URL.revokeObjectURL(rpkUrl);
    rpkUrl=null; rpkFilename=''; download.disabled=true;
  }
  function invalidateBuild() {
    clearBuild(); progress.classList.add('d-none'); status.textContent='';
  }
  function blob(base64,type) {
    var binary=atob(base64), bytes=new Uint8Array(binary.length);
    for (var i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:type});
  }
  function clearSigning() {
    signing=null;
    if (signingUrl) URL.revokeObjectURL(signingUrl);
    signingUrl=null; signingDownload.removeAttribute('href'); signingDownload.classList.add('d-none'); signingStatus.textContent='';
  }
  function setBusy(value) {
    busy=value; form.setAttribute('aria-busy',String(value));
    form.querySelectorAll('input,button').forEach(function(input){input.disabled=value;});
    download.disabled=value || !rpkUrl;
  }
  function makeRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID==='function') return window.crypto.randomUUID();
    var bytes=new Uint8Array(16), hex='';
    if (window.crypto && typeof window.crypto.getRandomValues==='function') window.crypto.getRandomValues(bytes);
    else for (var index=0;index<bytes.length;index++) bytes[index]=Math.floor(Math.random()*256);
    bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128;
    for (var i=0;i<bytes.length;i++) hex+=('0'+bytes[i].toString(16)).slice(-2);
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
  }
  async function post(url,body) {
    var response=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':form.elements._csrf.value},body:JSON.stringify(Object.assign({_csrf:form.elements._csrf.value},body))});
    var data;
    try { data=await response.json(); } catch (_) { throw new Error('服务器未返回 JSON（HTTP '+response.status+'）。'); }
    if (!response.ok || data.ok===false || data.error) throw new Error(data.message || '打包请求失败（HTTP '+response.status+'）。');
    return data;
  }
  function keepSigning(value,imported) {
    clearSigning(); signing={privateKey:value.privateKey,certificate:value.certificate};
    signingUrl=URL.createObjectURL(blob(value.archiveBase64,'application/zip'));
    signingDownload.href=signingUrl; signingDownload.classList.remove('d-none');
    signingStatus.textContent=imported ? '签名 ZIP 已验证并应用。' : '签名已生成并应用。请下载 ZIP 保存，下次直接选择该 ZIP。';
  }
  async function generate() {
    var result=await post('/jslab-cloud/api/cloud/rpk/signing',{author:form.elements.author.value});
    keepSigning(result.signing);
  }
  document.addEventListener('click',function(event){
    var button=event.target.closest('[data-cloud-rpk]');
    if (!button || busy) return;
    var source=document.querySelector('[data-cloud-script="'+button.dataset.cloudRpk+'"]');
    if (!source || !window.bootstrap) return;
    form.reset(); clearSigning(); invalidateBuild(); lastBody=''; requestId='';
    form.dataset.scriptId=button.dataset.cloudRpk;
    form.elements.name.value=(source.dataset.name || '').replace(/\.js$/i,'').slice(0,30);
    form.querySelector('[data-rpk-source-name]').textContent=source.dataset.name;
    status.textContent=''; status.className='mt-3';
    window.bootstrap.Modal.getOrCreateInstance(document.getElementById('cloud-rpk-modal')).show();
  });
  form.querySelector('[data-rpk-generate]').addEventListener('click',async function(){
    if (busy) return;
    invalidateBuild(); setBusy(true); signingStatus.textContent='正在生成签名…';
    try { await generate(); form.elements.signingZipFile.value=''; }
    catch(error){ signingStatus.textContent=error.message; }
    finally {setBusy(false);}
  });
  form.elements.signingZipFile.addEventListener('change',async function(){
    if (busy) return;
    invalidateBuild(); clearSigning();
    var file=form.elements.signingZipFile.files[0];
    if (!file) return;
    setBusy(true); signingStatus.textContent='正在验证签名 ZIP…';
    try { var result=await post('/jslab-cloud/api/cloud/rpk/signing',{archiveBase64:await base64File(file,32768)}); keepSigning(result.signing,true); }
    catch(error){ signingStatus.textContent=error.message; }
    finally {setBusy(false);}
  });
  ['input','change'].forEach(function(type){form.addEventListener(type,function(){if (!busy) invalidateBuild();});});
  download.addEventListener('click',function(){
    if (busy || !rpkUrl) return;
    var anchor=document.createElement('a'); anchor.href=rpkUrl; anchor.download=rpkFilename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  });
  function base64File(file,max) {
    if (file.size>max) return Promise.reject(new Error('文件 '+file.name+' 超过 '+(max/1024)+' KiB。'));
    return file.arrayBuffer().then(function(buffer){
      var bytes=new Uint8Array(buffer),binary='';
      for (var i=0;i<bytes.length;i++) binary+=String.fromCharCode(bytes[i]);
      return btoa(binary);
    });
  }
  form.addEventListener('submit',async function(event){
    event.preventDefault(); if (busy) return;
    clearBuild(); setBusy(true); status.className='mt-3'; status.textContent=''; stage(0,'正在读取打包信息…');
    try {
      if (form.elements.signingZipFile.files[0] && !signing) throw new Error('签名 ZIP 未通过验证，请重新选择或清空 ZIP 文件。');
      stage(1,'打包信息已读取，正在准备资源…');
      var icon=form.elements.icon.files[0];
      var body={name:form.elements.name.value,packageName:form.elements.packageName.value,versionName:form.elements.versionName.value,versionCode:form.elements.versionCode.value,author:form.elements.author.value,iconBase64:icon ? await base64File(icon,32768) : '',options:{disableConsole:form.elements.disableConsole.checked,hideTopBar:form.elements.hideTopBar.checked},signing:signing};
      var serialized=JSON.stringify(Object.assign({},body,{signing:signing ? {certificate:signing.certificate} : null}));
      if (serialized!==lastBody) { requestId=makeRequestId(); lastBody=serialized; }
      body.requestId=requestId;
      // Progress follows completed work, rather than a timer or simulated delay.
      stage(2,'资源已准备，服务器正在打包并签名…');
      var result=await post('/jslab-cloud/api/cloud/scripts/'+form.dataset.scriptId+'/rpk',body);
      stage(3,'打包及签名已完成，正在准备下载…');
      rpkUrl=URL.createObjectURL(blob(result.rpkBase64,'application/octet-stream')); rpkFilename=result.filename;
      status.textContent='打包成功，'+(result.chargedCents ? '已扣除 ¥'+(result.chargedCents/100).toFixed(2) : '未重复扣费')+'，JSLab 额度剩余 ¥'+(result.remainingCreditCents/100).toFixed(2)+'。'+(signingUrl ? '请同时下载签名 ZIP。' : '');
      document.querySelectorAll('[data-jslab-credit]').forEach(function(element){element.textContent='¥'+(result.remainingCreditCents/100).toFixed(2);});
      status.className='mt-3 text-success';
      stage(4,'RPK 已生成，点击“下载”保存。');
    } catch(error){status.textContent=error.message; status.className='mt-3 text-danger'; progress.querySelector('[data-rpk-progress-label]').textContent='打包未完成，请检查错误后重试。';}
    finally {setBusy(false);}
  });
  window.addEventListener('pagehide',function(){clearSigning();clearBuild();});
})();
