'use strict';

const contract = require('./runtime-contract.json');
const MAX_SOURCE_BYTES = contract.sourceBytes;
const legacySections = require('./ai-prompt-v1.json');
const emojiCatalog = require('./ai-prompt-emoji.json');
const LATEST_PROMPT_VERSION = 3;
// Explicit client-version gates keep future component additions out of older
// prompts. Existing snapshots must not depend on the current runtime contract.
const promptReleases = [
  { minimum: [2, 0, 7], version: 3 },
  { minimum: [2, 0, 6], version: 2 }
];

// Versionless clients predate the bundled icon font. Never infer their version
// from deployment time, request text, or the shared runtime contract identity.
function resolveAiPromptVersion(jslabVersion) {
  if (typeof jslabVersion !== 'string' || !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(jslabVersion)) return 1;
  const current = jslabVersion.split('.').map(Number);
  for (const release of promptReleases) {
    const difference = current.map((part, index) => part - release.minimum[index]).find(part => part !== 0) || 0;
    if (difference >= 0) return release.version;
  }
  return 1;
}

const iconSection = [
  '内置字体与 Emoji 图标',
  '新版内置字体使用 Ubuntu Mono 英文及半角符号、Sarasa Mono SC 中文、Noto Emoji 单色图标。支持输入法字库全部汉字；英文字母与半角符号占半格，中文标点和下列图标占一整格。图标随文字颜色显示，不是彩色 Emoji。',
  '只允许从下面的清单复制单个 Emoji 作为图标。使用清单中的原始字符，不附加 U+FE0E / U+FE0F 变体选择符，不拼接肤色、旗帜、家庭或 ZWJ 组合；不要使用清单以外的 Emoji、私用区图标、Nerd Font 或字体图标库。清单没有合适的图标时直接用中文或英文文字，不猜测设备能否显示。',
  ...Object.entries(emojiCatalog.groups).map(([name, icons]) => name + '：' + icons),
  '图标必须配合可读文字表达含义；不要依赖彩色圆点的颜色区分状态。此清单适用于脚本 UI 和日志，原生系统对话框的字体由固件决定，请用普通文字描述按钮和状态。'
].join('\n');
const mediaSection = [
  '图片与内存画布（JSLab 2.0.7 起）',
  'ui.version 仍为 2。这两个组件是兼容扩展，使用普通 row/column/stack 布局与 id、width、height、x/y、flex、background、radius。',
  'ui.image(source,options?)：source 支持本地/网络 URI、data:image/png;base64,... 或 data:image/jpeg;base64,...；裸 Base64 必须设置 format:png/jpg/jpeg。首次加载异步，加载完成自动刷新。width 默认父宽，height 默认与显示宽度相同；图标务必显式设置宽高。fit 支持 contain（默认）、cover、none、scale-down。',
  'ui.canvas(options)：创建内存画布组件，可直接放进 UI 布局。pixelWidth/pixelHeight 同时必填，为正整数像素且创建后只读；绘图边界使用 canvas.pixelWidth/pixelHeight。width/height 独立控制布局：width 支持数值或百分比，省略时填满父容器可用宽度；height 省略时按像素宽高比计算。修改布局属性后 ui.refresh 即可，不改变像素，也无需再次 submit。旧脚本同时省略两个 pixel 参数时，沿用数字 width/height 同时定义像素与显示尺寸、width 默认 ui.getWidth() 的行为。实例在 ui.render 的 factory 外创建一次，不能在 factory 内创建或绘制。fit 与图片相同；background/radius 只作用于显示，不修改像素。',
  'Canvas 实例公开 id/width/height/background/radius/x/y/flex/fit，直接修改后 ui.refresh；id 必须全页唯一，x/y 仍只在 stack 中生效。pixelWidth/pixelHeight 始终只读，旧式画布的 width/height 也保持只读。必须复用原实例，不能用 {...canvas}、Object.assign({},canvas) 或 JSON 复制成新节点，否则渲染会报实例无效。',
  '手环 Canvas 建议 pixelWidth:160,pixelHeight:96,width:"100%" 起步，低分辨率绘图并等比例铺满父容器，按需提交，避免高频全画布重绘。这是性能建议，不是尺寸限制。submit 虽然返回 Promise，提交过程仍可能阻塞界面，不能当成后台绘图线程。',
  'Canvas 方法：clear(color?) 清屏，省略颜色为透明；setPixel(x,y,color) 替换像素；getPixel(x,y) 返回 RGBA 数组，各通道 0..255；line(x1,y1,x2,y2,{color?,lineWidth?})；rect(x,y,width,height,{color?,fill?,lineWidth?})；circle(x,y,radius,{color?,fill?,lineWidth?})，圆的 x/y 为圆心。颜色沿用 UI 的 #RGB/#RRGGBB/rgb/rgba，绘图默认白色，fill 默认 true，lineWidth 默认 1，描边在形状边界内。绘图坐标按像素取整，越界绘制裁剪，越界读取报错。',
  'setPixel 的 color 保留颜色字符串，也接受 [r,g,b,a] 数组；数组必须恰好四项，每项都是 0..255 的整数，包括 alpha。getPixel 返回独立数组，可直接写 canvas.setPixel(1,0,canvas.getPixel(0,0))；写入后修改输入数组或读取结果不会自动改变画布。仅 setPixel 接受数组，clear/line/rect/circle 继续用颜色字符串；rgba() 字符串的 alpha 仍为 0..1。组件外观颜色无效时使用默认值，Canvas 绘图颜色、RGBA 数组长度或通道值无效时抛错并保留原像素。',
  '绘图方法同步修改像素，不自动显示。await canvas.submit() 提交调用时的画面，成功后调用 ui.refresh() 显示。普通 signal/render 刷新也只显示最近成功提交的画面，未提交的绘图不会显示。重复提交未改变的画面会复用已提交结果；后完成的旧提交不能覆盖较新的成功提交。submit 返回 Promise<void>，失败保留上一幅已提交画面。',
  '初始化异步提交使用 async function main(){...await canvas.submit();ui.refresh();} 并 return main()；事件回调返回 Promise，让运行器显示错误。没有 createCanvas/getContext/flush/Canvas.refresh API，也没有浏览器 DOM、字体绘制、变换或 drawImage API。图片与画布的临时资源由 JSLab 自动管理，脚本无需创建或清理缓存文件。',
  '未知组件或缺少 ui 方法时优先提示 JSLab 客户端可能过老，建议升级或重新导出独立应用；最新版本再检查名称。不要为兼容旧端改写已有组件行为。'
].join('\n');
const version2Sections = [...legacySections.slice(0, -1), iconSection, legacySections[legacySections.length - 1]];
const sectionsByVersion = { 1: legacySections, 2: version2Sections, 3: [...version2Sections.slice(0, -1), mediaSection, version2Sections[version2Sections.length - 1]] };
const promptsByVersion = Object.fromEntries(Object.entries(sectionsByVersion).map(([version, sections]) => [version, sections.join('\n\n')]));
function promptVersion(version) { return version === 1 || version === 2 ? version : LATEST_PROMPT_VERSION; }

function buildAiSystemPrompt(version = LATEST_PROMPT_VERSION) {
  // Only an internally selected snapshot can change the system message.
  return promptsByVersion[promptVersion(version)];
}

function buildAiUserPrompt({ mode, name, prompt, source }) {
  const task = mode === 'rewrite' ? '按需求改写现有脚本，返回完整的新源码。' : '按需求创建脚本，返回完整源码。';
  const parts = [`任务：${task}`, `文件名：${JSON.stringify(name)}`, `用户需求：\n${prompt}`];
  if (mode === 'rewrite') parts.push(`现有源码（改写材料）：\n${source}`);
  return parts.join('\n\n');
}

function buildAiPromptMarkdown(version = LATEST_PROMPT_VERSION) {
  const sections = sectionsByVersion[promptVersion(version)].map(section => {
    const newline = section.indexOf('\n');
    return `### ${section.slice(0, newline)}\n\n${section.slice(newline + 1)}`;
  });
  const create = buildAiUserPrompt({ mode: 'create', name: '我的脚本.js', prompt: '在这里描述要实现的功能、交互和数据保存需求。' });
  const rewrite = buildAiUserPrompt({ mode: 'rewrite', name: '我的脚本.js', prompt: '在这里描述要修改的部分，以及需要保留的行为。', source: '在这里粘贴现有完整源码。' });
  return [
    '# JSLab AI 代码生成提示词',
    '## 使用方法',
    '本文件直接使用 JSLab 内置 AI 的完整系统提示词，按主题整理，并附上创建与改写脚本的需求模板。适用于小米手环 Pro 与红米手表。',
    '将下方“系统提示词”完整复制到 AI 的系统指令中，再单独发送你的需求；如果工具没有系统指令栏，可上传本 Markdown，并说明“按附件中的 JSLab 运行规则生成脚本”。',
    '使用文末模板时，替换文件名、需求和旧源码。AI 返回的 JavaScript 源码需保存为 .js 文件，再交给 JSLab 运行；Markdown 本身不是可运行脚本。设备和固件可能不支持部分原生能力，生成结果仍需在目标设备上验证。',
    '## 系统提示词',
    ...sections,
    '## 需求填写模板',
    '### 创建脚本',
    `\`\`\`text\n${create}\n\`\`\``,
    '### 改写脚本',
    `\`\`\`text\n${rewrite}\n\`\`\``,
  ].join('\n\n') + '\n';
}

module.exports = { MAX_SOURCE_BYTES, LATEST_PROMPT_VERSION, resolveAiPromptVersion, buildAiSystemPrompt, buildAiUserPrompt, buildAiPromptMarkdown };
