function rpkForm(req,user,view) {
  const {csrf,escAttr}=view;
  const field=(name,label,value='',extra='')=>`<div class="col-md-6"><label class="form-label" for="rpk-${name}">${label}</label><input class="form-control" id="rpk-${name}" name="${name}" value="${escAttr(value)}" ${extra}></div>`;
  return `<form data-cloud-rpk-form>
    <input type="hidden" name="_csrf" value="${csrf(req)}">
    <p>脚本：<strong data-rpk-source-name></strong></p>
    <p class="text-body-secondary">生成独立 Vela 快应用，每次成功打包扣除 ¥0.10 JSLab 额度。</p>
    <div class="row g-3">
      ${field('name','应用名称','','maxlength="30" required')}
      ${field('packageName','包名','','maxlength="120" placeholder="com.example.myapp" pattern="[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+" required')}
      ${field('versionName','版本号','1.0.0','maxlength="32" required')}
      ${field('versionCode','versionCode','1','type="number" min="1" max="2147483647" step="1" required')}
      ${field('author','作者',user.display_name || user.username,'maxlength="80" required')}
      <div class="col-md-6"><label class="form-label" for="rpk-icon">图标（可选）</label><input id="rpk-icon" class="form-control" type="file" name="icon" accept="image/png"><div class="form-text">PNG，最大 32 KiB、512×512；留空使用 JSLab 脚本生成图标。</div></div>
    </div>
    <fieldset class="mt-3"><legend class="h6">打包选项</legend>
      <div class="form-check"><input class="form-check-input" id="rpk-console" name="disableConsole" type="checkbox"><label class="form-check-label" for="rpk-console">禁用 console 日志输出</label></div>
      <div class="form-check"><input class="form-check-input" id="rpk-header" name="hideTopBar" type="checkbox"><label class="form-check-label" for="rpk-header">隐藏顶栏</label></div>
      <div class="form-text">禁用日志仍会显示运行错误。保留顶栏时，右上角信息按钮可查看应用信息及 JSLab 介绍。</div>
    </fieldset>
    <fieldset class="mt-3"><legend class="h6">签名信息（可选）</legend>
      <p class="small text-body-secondary">首次可在线生成签名并下载 ZIP 保存；之后直接选择该 ZIP，无需解压。留空使用固定的 JSLab 共享默认签名。</p>
      <label class="form-label" for="rpk-signing-zip">签名 ZIP（可选）</label><input id="rpk-signing-zip" class="form-control" name="signingZipFile" type="file" accept=".zip,application/zip"><div class="form-text">最大 32 KiB，包含 private.pem 和 certificate.pem。</div>
      <div class="plugin-actions mt-3"><button class="btn btn-outline-secondary" type="button" data-rpk-generate>在线生成签名</button><a class="btn btn-outline-secondary d-none" data-rpk-signing-download download="jslab-signing.zip">下载签名 ZIP</a></div>
      <p class="small text-body-secondary mt-2" data-rpk-signing-status role="status"></p>
    </fieldset>
    <div class="mt-3 d-none" data-rpk-progress><div class="progress" role="progressbar" aria-label="打包步骤" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0"><div class="progress-bar" data-rpk-progress-bar style="width:0%"></div></div><p class="small text-body-secondary mt-2 mb-0" data-rpk-progress-label aria-live="polite"></p></div>
    <p class="mt-3" data-rpk-status role="status" aria-live="polite"></p>
    <div class="plugin-actions"><button class="btn btn-outline-primary" type="submit">打包 · ¥0.10</button><button class="btn btn-outline-secondary" type="button" data-rpk-download disabled>下载</button></div>
  </form>`;
}
module.exports={rpkForm};
