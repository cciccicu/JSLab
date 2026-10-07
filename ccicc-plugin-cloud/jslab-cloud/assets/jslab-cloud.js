(function () {
  'use strict';

  function copySource(button) {
    var card = button.closest('.jslab-cloud-source-card, .jslab-cloud-editor-card');
    var source = card && card.querySelector('[data-source-editor], .jslab-cloud-source code');
    if (!source) return;
    var value = 'value' in source ? source.value : source.textContent;
    if (!navigator.clipboard) {
      showToast('复制脚本源码：当前浏览器未提供剪贴板写入接口。', true);
      return;
    }
    navigator.clipboard.writeText(value).then(function () {
      var original = button.textContent;
      button.textContent = 'Copied';
      window.setTimeout(function () { button.textContent = original; }, 1400);
    }).catch(function (error) {
      showToast('复制脚本源码：浏览器拒绝写入剪贴板（' + (error && error.name || '未提供异常类型') + '）。', true);
    });
  }

  function initEditor(form) {
    var source = form.querySelector('[data-source-editor]');
    var count = form.querySelector('[data-source-count]');
    var state = form.querySelector('[data-save-state]');
    if (!source) return;
    var draftKey = 'jslab-cloud:draft:' + (form.querySelector('[name="name"]')?.value || 'new');
    var draft = window.localStorage && window.localStorage.getItem(draftKey);
    if (draft && !source.value) source.value = draft;
    var update = function () {
      var bytes = new TextEncoder().encode(source.value).length;
      if (count) count.textContent = bytes.toLocaleString() + ' 字节';
      if (state) state.textContent = bytes > 48 * 1024 ? '源码超过 48 KiB' : '草稿已保存到本地';
      try { window.localStorage.setItem(draftKey, source.value); } catch (_) {}
    };
    source.addEventListener('input', update);
    // Keep local drafts on validation errors and revision conflicts.
    update();
  }

  function showToast(message, danger) {
    var type = danger ? 'danger' : 'success';
    var title = 'JSLab Cloud';
    if (window.CCICC && typeof window.CCICC.toast === 'function') {
      window.CCICC.toast({ type: type, title: title, message: message });
      return;
    }
    if (window.cciccToast && typeof window.cciccToast[type] === 'function') {
      window.cciccToast[type](title, message);
      return;
    }
    document.dispatchEvent(new CustomEvent('ccicc:toast', { detail: { type: type, title: title, message: message } }));
    var host = document.getElementById('ccicc-toast-region');
    if (!host) return;
    var item = document.createElement('div');
    item.className = 'ccicc-toast ccicc-toast--' + type;
    item.setAttribute('role', danger ? 'alert' : 'status');
    item.innerHTML = '<i class="bi bi-' + (danger ? 'x-circle' : 'check-circle') + ' ccicc-toast__icon" aria-hidden="true"></i><div class="ccicc-toast__body"><strong class="ccicc-toast__title">' + title + '</strong><p class="ccicc-toast__message"></p></div><button type="button" class="ccicc-toast__close" aria-label="关闭">×</button>';
    item.querySelector('.ccicc-toast__message').textContent = message;
    item.querySelector('.ccicc-toast__close').addEventListener('click', function () { item.remove(); });
    host.appendChild(item);
    requestAnimationFrame(function () { item.classList.add('is-visible'); });
    window.setTimeout(function () { item.remove(); }, danger ? 5000 : 4200);
  }

  function confirmAction(message) {
    if (!window.bootstrap || !window.bootstrap.Modal) return Promise.resolve(window.confirm(message));
    var element = document.getElementById('cloud-confirm-modal');
    if (!element) {
      element = document.createElement('div');
      element.id = 'cloud-confirm-modal';
      element.className = 'modal fade';
      element.tabIndex = -1;
      element.setAttribute('aria-hidden', 'true');
      element.innerHTML = '<div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h2 class="modal-title fs-5">确认操作</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="关闭"></button></div><div class="modal-body"><p class="mb-0" data-cloud-confirm-message></p></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">取消</button><button type="button" class="btn btn-danger" data-cloud-confirm-accept>确认</button></div></div></div>';
      document.body.appendChild(element);
    }
    element.querySelector('[data-cloud-confirm-message]').textContent = message;
    return new Promise(function (resolve) {
      var accepted = false;
      var accept = element.querySelector('[data-cloud-confirm-accept]');
      var instance = window.bootstrap.Modal.getOrCreateInstance(element);
      var onAccept = function () { accepted = true; instance.hide(); };
      var onHidden = function () { accept.removeEventListener('click', onAccept); resolve(accepted); };
      accept.addEventListener('click', onAccept);
      element.addEventListener('hidden.bs.modal', onHidden, { once: true });
      instance.show();
    });
  }

  async function refreshCsrf(form) {
    var response;
    try {
      response = await fetch(window.location.href, { headers: { Accept: 'text/html' }, cache: 'no-store' });
    } catch (error) {
      throw new Error(requestFailure(error, '刷新表单安全令牌', window.location.href));
    }
    if (!response.ok) throw new Error('刷新表单安全令牌：服务器返回 HTTP ' + response.status + '。');
    var html = await response.text();
    var parsed = new DOMParser().parseFromString(html, 'text/html');
    var fresh = parsed.querySelector('input[name="_csrf"]');
    var current = form.querySelector('input[name="_csrf"]');
    if (!fresh || !current || !fresh.value) throw new Error('刷新表单安全令牌：页面响应中缺少可用的 _csrf 字段。');
    current.value = fresh.value;
    return true;
  }

  function errorMessage(result, status) {
    var known = {
      activation_required: '请先激活云空间。',
      invalid_script: '市场名称或代码格式无效，请检查文件名和代码。',
      market_source_rejected: '代码包含市场不允许的内容，请修改后重试。',
      reason_required: '请填写举报原因。',
      script_name_exists: '云空间中已有同名文件。',
    };
    if (result && (result.message || known[result.error])) return result.message || known[result.error];
    if (result && result.error) return '云服务返回 HTTP ' + status + '，错误标识：' + result.error + '。';
    return '云服务返回 HTTP ' + status + '，响应中没有错误详情。';
  }

  function requestFailure(error, operation, url) {
    var name = error && error.name ? error.name : '未提供异常类型';
    var detail = error && error.message ? error.message : '浏览器未返回错误详情';
    if (error && error.cloudResponse) return detail;
    var target = new URL(url, window.location.href).pathname;
    return operation + '：浏览器无法请求 ' + target + '（' + name + '：' + detail + '）。';
  }

  async function fetchJson(url, options, operation) {
    var response;
    try {
      response = await fetch(url, options || {});
    } catch (error) {
      throw new Error(requestFailure(error, operation, url));
    }
    var result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error(operation + '：服务器返回 HTTP ' + response.status + '，但响应不是有效 JSON（' + (error && error.name || '解析错误') + '）。');
    }
    if (!response.ok) {
      var responseError = new Error(errorMessage(result, response.status));
      responseError.cloudResponse = true;
      throw responseError;
    }
    return result;
  }

  async function submitAjaxForm(form, confirmed, retried) {
    var submit = form.querySelector('[type="submit"]');
    var data = new URLSearchParams(new FormData(form));
    data.set('ajax', '1');
    if (form.matches('[data-cloud-publish-form]') && form.dataset.marketId) data.set('marketId', form.dataset.marketId);
    if (confirmed) data.set('confirm', '1');
    if (submit) submit.setAttribute('aria-busy', 'true');
    try {
      var response;
      try {
        response = await fetch(form.action, { method: (form.method || 'post').toUpperCase(), body: data, headers: { Accept: 'application/json' } });
      } catch (error) {
        throw new Error(requestFailure(error, '提交 JSLab Cloud 表单', form.action));
      }
      var result;
      try {
        result = await response.json();
      } catch (error) {
        throw new Error('提交 JSLab Cloud 表单：服务器返回 HTTP ' + response.status + '，但响应不是有效 JSON（' + (error && error.name || '解析错误') + '）。');
      }
      if (response.status === 403 && !retried && await refreshCsrf(form)) return submitAjaxForm(form, confirmed, true);
      if (response.status === 409 && result.confirm && !confirmed) {
        if (await confirmAction(result.message || '确定继续吗？')) return submitAjaxForm(form, true);
        return;
      }
      if (!response.ok) {
        var responseError = new Error(errorMessage(result, response.status));
        responseError.cloudResponse = true;
        throw responseError;
      }
      showToast(result.message || '操作已完成。', false);
      if (result.removeRow) form.closest('[data-cloud-row]')?.remove();
      if (result.removeCard) form.closest('.jslab-cloud-market-item')?.remove();
      if (form.matches('[data-cloud-editor-modal]')) result.reload = true;
      if (form.matches('[data-cloud-publish-form]')) {
        var publishModal = form.closest('.modal');
        if (publishModal && window.bootstrap) window.bootstrap.Modal.getOrCreateInstance(publishModal).hide();
        form.reset();
        window.setTimeout(function () { window.location.href = '/jslab-cloud/workspace/market?tab=mine'; }, 650);
      }
      if (result.reload) window.setTimeout(function () { window.location.reload(); }, 700);
      if (!result.reload && !form.matches('[data-cloud-publish-form]')) form.reset();
    } catch (error) {
      showToast(error && error.message ? error.message : '提交 JSLab Cloud 表单：浏览器没有返回错误详情。', true);
    } finally {
      if (submit) submit.removeAttribute('aria-busy');
    }
  }

  document.addEventListener('click', async function (event) {
    var button = event.target.closest('[data-copy-source]');
    if (button) copySource(button);
    var confirmButton = event.target.closest('[data-confirm]');
    if (confirmButton && !confirmButton.closest('[data-cloud-ajax]')) {
      event.preventDefault();
      if (await confirmAction(confirmButton.getAttribute('data-confirm'))) {
        var form = confirmButton.form;
        if (form) form.requestSubmit ? form.requestSubmit(confirmButton) : form.submit();
      }
    }
    var newButton = event.target.closest('[data-cloud-new]');
    var editButton = event.target.closest('[data-cloud-edit]');
    if (newButton || editButton) {
      var editorForm = document.querySelector('[data-cloud-editor-modal]');
      var editorModal = document.getElementById('cloud-editor-modal');
      if (!editorForm || !editorModal || !window.bootstrap) return;
      editorForm.reset();
      editorForm.action = '/jslab-cloud/scripts/new';
      editorForm.querySelector('[data-cloud-editor-id]').value = '';
      editorForm.querySelector('[data-cloud-delete]').classList.add('d-none');
      if (editButton) {
        var script = document.querySelector('[data-cloud-script="' + editButton.getAttribute('data-cloud-edit') + '"]');
        if (!script) return;
        editorForm.action = '/jslab-cloud/workspace/scripts/' + editButton.getAttribute('data-cloud-edit') + '/save';
        editorForm.querySelector('[data-cloud-editor-id]').value = editButton.getAttribute('data-cloud-edit');
        editorForm.querySelector('[name="name"]').value = script.dataset.name || '';
        editorForm.querySelector('[name="source"]').value = script.dataset.source || '';
        editorForm.querySelector('[data-cloud-delete]').classList.remove('d-none');
      }
      window.bootstrap.Modal.getOrCreateInstance(editorModal).show();
    }
    var publishButton = event.target.closest('[data-cloud-publish]');
    if (publishButton) {
      var publishForm = document.querySelector('[data-cloud-publish-form]');
      var publishModal = document.getElementById('cloud-publish-modal');
      var sourceScript = document.querySelector('[data-cloud-script="' + publishButton.getAttribute('data-cloud-publish') + '"]');
      if (!publishForm || !publishModal || !sourceScript || !window.bootstrap) return;
      publishForm.reset();
      publishForm.querySelector('[name="source"]').value = sourceScript.dataset.source || '';
      window.bootstrap.Modal.getOrCreateInstance(publishModal).show();
    }
    var marketEditButton = event.target.closest('[data-cloud-market-edit]');
    if (marketEditButton) {
      var editModal = document.getElementById('cloud-publish-modal');
      var editForm = document.querySelector('[data-cloud-publish-form]');
      if (!editModal || !editForm || !window.bootstrap) return;
      var marketManageUrl = '/jslab-cloud/api/cloud/market/' + marketEditButton.getAttribute('data-cloud-market-edit') + '/manage';
      fetchJson(marketManageUrl, { headers: { Accept: 'application/json' } }, '读取待编辑的市场脚本').then(function (result) {
        if (!result.script) throw new Error('读取待编辑的市场脚本：成功响应中缺少 script 字段。');
        editForm.reset();
        editForm.dataset.marketId = result.script.id;
        editForm.querySelector('[name="marketName"]').value = result.script.name || '';
        editForm.querySelector('[name="marketDescription"]').value = result.script.description || '';
        editForm.querySelector('[name="marketTags"]').value = Array.isArray(result.script.tags) ? result.script.tags.join(', ') : String(result.script.tags || '').replace(/[\[\]"]+/g, '');
        editForm.querySelector('[name="source"]').value = result.script.source || '';
        window.bootstrap.Modal.getOrCreateInstance(editModal).show();
      }).catch(function (error) { showToast(error && error.message ? error.message : '读取待编辑的市场脚本：浏览器没有返回错误详情。', true); });
    }
    var deleteButton = event.target.closest('[data-cloud-delete]');
    if (deleteButton) {
      var deleteForm = deleteButton.closest('[data-cloud-editor-modal]');
      var deleteId = deleteForm && deleteForm.querySelector('[data-cloud-editor-id]').value;
      if (!deleteId || !(await confirmAction('确定删除此云空间文件吗？'))) return;
      var originalAction = deleteForm.action;
      deleteForm.action = '/jslab-cloud/workspace/scripts/' + deleteId + '/delete';
      await submitAjaxForm(deleteForm, false);
      deleteForm.action = originalAction;
    }
  });

  document.addEventListener('submit', async function (event) {
    var form = event.target.closest('[data-cloud-ajax]');
    if (!form) return;
    event.preventDefault();
    var confirmButton = event.submitter && event.submitter.closest('[data-confirm]');
    if (confirmButton && !(await confirmAction(confirmButton.getAttribute('data-confirm')))) return;
    submitAjaxForm(form, false);
  });

  document.querySelectorAll('[data-cloud-editor]').forEach(initEditor);

  var requestedPanelOpened = false;
  function openRequestedPanel() {
    if (requestedPanelOpened) return true;
    var panel = new URLSearchParams(window.location.search).get('panel');
    var panelIds = { activation: 'cloud-activation-modal', pairing: 'cloud-pairing-modal', devices: 'cloud-pairing-modal', editor: 'cloud-editor-modal' };
    var publishId = new URLSearchParams(window.location.search).get('publish');
    if (publishId && window.bootstrap && window.bootstrap.Modal) {
      var publishElement = document.getElementById('cloud-publish-modal');
      var publishForm = document.querySelector('[data-cloud-publish-form]');
      if (publishElement && publishForm) {
        var publishSourceUrl = '/jslab-cloud/api/cloud/scripts/' + encodeURIComponent(publishId);
        fetchJson(publishSourceUrl, { headers: { Accept: 'application/json' } }, '读取待发布的云空间文件').then(function (result) {
          if (!result.script) throw new Error('读取待发布的云空间文件：成功响应中缺少 script 字段。');
          publishForm.reset();
          publishForm.dataset.marketId = '';
          publishForm.querySelector('[name="source"]').value = result.source || '';
          window.bootstrap.Modal.getOrCreateInstance(publishElement).show();
        }).catch(function (error) { showToast(error && error.message ? error.message : '读取待发布的云空间文件：浏览器没有返回错误详情。', true); });
        requestedPanelOpened = true;
        return true;
      }
    }
    if (!panelIds[panel] || !window.bootstrap || !window.bootstrap.Modal) return false;
    var panelElement = document.getElementById(panelIds[panel]);
    if (!panelElement) return false;
    var scriptId = new URLSearchParams(window.location.search).get('script');
    if (panel === 'editor' && scriptId) document.querySelector('[data-cloud-edit="' + scriptId + '"]')?.click();
    else window.bootstrap.Modal.getOrCreateInstance(panelElement).show();
    requestedPanelOpened = true;
    return true;
  }
  if (!openRequestedPanel()) {
    document.addEventListener('DOMContentLoaded', openRequestedPanel, { once: true });
    window.addEventListener('load', openRequestedPanel, { once: true });
    window.setTimeout(openRequestedPanel, 150);
  }
}());
