import { RUNTIME_CONTRACT } from '../runtime/runtimeContract.js';
import deviceAccount from './deviceAccount.js';
import { request } from './cloudTransport.js';

const AI_TIMEOUT_MS = 330 * 1000;

function generateAi(mode, prompt, source, name) {
  const body = { runtimeContract: RUNTIME_CONTRACT, mode: mode === 'rewrite' ? 'rewrite' : 'create', prompt: String(prompt || ''), name: String(name || '') };
  if (body.mode === 'rewrite') body.source = String(source || '');
  return deviceAccount.getEntitlements().then(capabilities => {
    if (capabilities.runtimeContract !== RUNTIME_CONTRACT) throw new Error('设备与云端运行契约不一致，请同步更新应用和云插件');
    return request('/api/cloud/device/ai/generate', { method: 'POST', body, timeoutMs: AI_TIMEOUT_MS });
  }).then((result) => {
    if (result.runtimeContract !== RUNTIME_CONTRACT) throw new Error('AI 结果的运行契约不一致，未写入编辑器');
    if (typeof result.code !== 'string' || !result.code) throw new Error('ai_invalid_response');
    try { new Function(result.code); } catch (_) { throw new Error('AI 结果语法无效，未写入编辑器'); }
    return { code: result.code, usage: result.usage || {}, remainingCreditCents: Math.max(0, Number(result.remainingCreditCents) || 0) };
  });
}

export default { generateAi };
