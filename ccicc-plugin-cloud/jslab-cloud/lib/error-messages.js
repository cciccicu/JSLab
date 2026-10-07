'use strict';

const ERROR_MESSAGES = Object.freeze({
  device_auth_required: '设备令牌无效、已撤销或所属账户不可用，请重新配对设备。',
  auth_required: '当前网页会话尚未登录。',
  activation_required: '云空间尚未激活，请先兑换激活码。',
  rate_limited: '请求频率超过服务限制，请等待一分钟后再试。',
  pairing_not_found: '找不到此配对会话，配对码可能已经过期。',
  invalid_pairing_code: '配对码格式错误、已经使用或已经过期。',
  invalid_code: '配对码必须是 8 位十六进制字符。',
  pairing_unavailable: '配对码已经确认、使用或过期，不能再次确认。',
  invalid_activation_code: '激活码格式错误、已使用或不存在。',
  invalid_activation: '激活码无效或已经使用。',
  runtime_contract_mismatch: '设备与云端的脚本运行契约不一致，请同步更新应用和云插件；本次未调用模型或计费。',
  invalid_ai_request: 'AI 请求缺少有效的生成模式、需求说明或脚本内容。',
  ai_not_configured: '服务器尚未配置代码生成 AI 的地址、密钥或模型。',
  ai_credit_insufficient: '账户的 AI 余额不足以完成本次生成。',
  ai_provider_unavailable: '上游 AI 服务拒绝请求、超时或暂时不可达。',
  ai_invalid_response: '上游 AI 响应中没有可用的脚本代码。',
  not_found: '请求的资源不存在，或当前账户无权访问。',
  invalid_script: '脚本名称、内容或大小不符合要求；代码上限为 48 KiB。',
  invalid_javascript: '脚本存在 JavaScript 语法错误。',
  script_name_exists: '当前云空间已经存在同名脚本。',
  file_exists: '目标位置已经存在同名文件。',
  reason_required: '举报原因不能为空。',
  market_source_rejected: '脚本包含市场不允许发布的内容。',
  name_required: '市场名称不能为空。',
  description_required: '市场说明不能为空。'
});

function withErrorMessage(body) {
  if (!body || !body.error || body.message) return body;
  return Object.assign({}, body, {
    message: ERROR_MESSAGES[body.error] || `请求未完成；服务器错误标识为 ${String(body.error)}。`
  });
}

module.exports = { ERROR_MESSAGES, withErrorMessage };
