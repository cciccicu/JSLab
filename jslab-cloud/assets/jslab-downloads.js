(function () {
  'use strict';
  var banner = document.querySelector('[data-jslab-download-banner]');
  var dismissalKey = 'jslab-cloud:downloads-banner:dismissed';
  if (banner) {
    var revision = banner.getAttribute('data-jslab-download-banner');
    try { banner.hidden = window.localStorage.getItem(dismissalKey) === revision; } catch (_) {}
    banner.querySelector('[data-jslab-download-dismiss]').addEventListener('click', function () {
      banner.hidden = true;
      try { window.localStorage.setItem(dismissalKey, revision); } catch (_) {}
    });
  }
  document.querySelectorAll('[data-jslab-download-upload]').forEach(function (form) {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var button = form.querySelector('[type="submit"]');
      if (button.disabled) return;
      var input = form.querySelector('[type="file"]');
      var file = input.files[0];
      var status = form.querySelector('[data-jslab-download-result]');
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) { status.textContent = '安装包不能超过 50 MiB。'; return; }
      button.disabled = true; input.disabled = true;
      status.textContent = '正在上传，请保持页面打开…';
      try {
        var response = await fetch(form.action, { method: 'POST', headers: {
          'Content-Type': 'application/octet-stream', 'Accept': 'application/json',
          'X-CSRF-Token': form.querySelector('[name="_csrf"]').value,
          'X-JSLab-Filename': encodeURIComponent(file.name)
        }, body: file });
        var result;
        try { result = await response.json(); } catch (_) { throw new Error('服务器返回 HTTP ' + response.status + '，请刷新页面检查文件状态后重试。'); }
        if (!response.ok || !result.ok) throw new Error(result.message || '上传失败（HTTP ' + response.status + '）。');
        status.textContent = result.message;
        var row = form.closest('[data-jslab-download-row]');
        row.querySelector('[data-jslab-download-info]').textContent = (result.file.versionName ? 'v' + result.file.versionName : '版本未标注') + ' · ' + (result.file.size / 1024 / 1024).toFixed(1) + ' MiB · ' + result.file.updatedAt.replace('T', ' ').slice(0, 19) + ' UTC';
        row.querySelector('[data-jslab-download-link]').classList.remove('d-none');
        input.value = '';
      } catch (error) { status.textContent = error.message || '上传中断，请检查网络后重试。'; }
      finally { button.disabled = false; input.disabled = false; }
    });
  });
})();
