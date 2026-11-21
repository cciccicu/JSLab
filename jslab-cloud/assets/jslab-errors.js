(function () {
  'use strict';
  var prefix = /^\[(浏览器|前端|接口)\]\s*/;
  function create(source, message) {
    var error = new Error('[' + source + '] ' + message);
    error.jslabSource = source;
    return error;
  }
  function browser(message) { return create('浏览器', message); }
  function frontend(message) { return create('前端', message); }
  function api(message, status) { return create('接口', (status ? 'HTTP ' + status + '：' : '') + message); }
  function format(error) {
    var message = typeof error === 'string' ? error : error && error.message;
    if (message && prefix.test(message)) return message;
    if (!message || !/[\u3400-\u9fff]/.test(message)) message = '页面处理失败' + (error && error.name ? '（' + error.name + '）' : '') + '。';
    return frontend(message).message;
  }
  async function request(url, options, operation) {
    try { return await fetch(url, options); }
    catch (_) { throw browser(operation + '：请求未能完成，请检查网络和浏览器权限后重试。'); }
  }
  async function readJson(response, operation) {
    var result;
    try { result = await response.json(); }
    catch (error) {
      if (error && error.name === 'SyntaxError') throw api(operation + '：服务器响应不是有效 JSON。', response.status);
      throw browser(operation + '：读取服务器响应失败，请检查网络后重试。');
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw api(operation + '：服务器响应格式无效。', response.status);
    return result;
  }
  async function readFile(file, max, label) {
    if (file.size > max) throw frontend(label + '「' + file.name + '」超过 ' + (max / 1024) + ' KiB。');
    var buffer;
    try { buffer = await file.arrayBuffer(); }
    catch (error) { throw browser('无法读取' + label + '「' + file.name + '」，请重新选择本地文件后重试' + (error && error.name ? '（' + error.name + '）' : '') + '。'); }
    var bytes = new Uint8Array(buffer), binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  window.JSLabErrors = { browser: browser, frontend: frontend, api: api, format: format, request: request, readJson: readJson, readFile: readFile };
}());
