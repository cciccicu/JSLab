function method(id, name, description, example, note) {
  return { id, name, description, example: example || '', note: note || '' };
}

function document(id, title, summary, intro, methods, note) {
  return { id, type: 'document', title, summary, intro, methods, note: note || '' };
}

function directory(id, title, summary, items) {
  return { id, type: 'directory', title, summary, items };
}

const START = [
  document('guide-start', '新建、保存与运行', '从文件名选择脚本模式', '新建时选择文件名和模板。普通 .js 在 Console 运行页执行；以 .ui.js 结尾的文件在 UI 运行页执行。保存后从编辑器运行，修改后需要再次运行。', [
    method('start-console', 'demo.js', 'Console 脚本适合计算、输出、输入和一次性任务。', "console.log('Hello, JSLab!')"),
    method('start-ui', 'counter.ui.js', 'UI 脚本使用声明式组件构建可交互界面。', "ui.render([ui.heading('Hello'), ui.text('JSLab')])"),
    method('start-switch-mode', '切换模式', '编辑器菜单会修改 .js / .ui.js 扩展名；切换后同步调整代码 API。', 'demo.js  ->  demo.ui.js')
  ], '文件扩展名是唯一的模式依据，旧版首行模式注释无效。'),
  document('guide-runtime', '运行时对象', '脚本只使用 JSLab 注入的对象', '所有脚本都可使用 script、dialog、system。Console 模式额外提供 console；UI 模式额外提供 ui，且没有 console。不要 import、require 或使用裸 Vela 模块。', [
    method('runtime-common', 'script / dialog / system', '两个模式共用的 API。', "script.toast('已启动')"),
    method('runtime-console', 'console', '仅普通 .js 可用，用于结果输出。', "console.log('结果：', 42)"),
    method('runtime-ui', 'ui', '仅 .ui.js 可用，用于显示状态和操作。', "ui.render([ui.text('准备就绪')])")
  ], 'UI 脚本请用 ui.text、ui.progress 或 script.toast 呈现状态与错误。')
];

const SCRIPT_API = [
  document('api-script-core', 'script', '文件信息、能力、退出和提示', 'script 是每次执行均可使用的脚本控制对象。', [
    method('script-info', 'script.name / script.mode', '当前文件名及模式，mode 为 console 或 ui。', "if (script.mode === 'ui') script.toast(script.name)"),
    method('script-capability', 'script.canUse(capability)', '检查可选系统模块或方法。', "if (script.canUse('@system.sensor.subscribeAccelerometer')) {\n  script.toast('支持加速度计')\n}"),
    method('script-locale', 'script.locale()', '读取当前语言和地区。', "const locale = script.locale()"),
    method('script-exit', 'script.exit()', '退出当前运行页。停止订阅、计时器、上传或媒体后再退出。', 'script.exit()'),
    method('script-toast', 'script.toast(message, duration)', '显示 1500 至 10000 ms 的提示。', "script.toast('保存成功', 1500)")
  ]),
  document('api-script-data', 'script.data 与 script.config', '按脚本文件名隔离的持久化数据', '两者 API 相同，均返回 Promise。data 适合运行数据，config 适合用户设置；单值最多 16 KiB，每个区域最多 64 KiB。', [
    method('script-store-get', 'get(key, fallback)', '读取值，缺失时返回 fallback。', "script.data.get('count', 0).then(value => {\n  script.toast('计数：' + value)\n})"),
    method('script-store-set', 'set(key, value)', '保存 JSON 可序列化数据。', "script.config.set('unit', 'metric').catch(error => script.toast(error.message))"),
    method('script-store-manage', 'delete / clear / all', '删除键、清空区域或读取全部数据。', "script.data.delete('count')")
  ]),
  document('api-dialog', 'dialog', 'Console 与 UI 共用的输入对话框', '所有方法返回 Promise；同一时间只能打开一个对话框。用户取消不是错误，返回 null；无法显示或脚本退出才会 reject。', [
    method('dialog-text', 'dialog.text(options)', '输入文本。', "dialog.text({ title: '名称', maxLength: 20 }).then(value => {\n  if (value !== null) script.toast(value)\n})"),
    method('dialog-number', 'dialog.number(options)', '输入非负整数。', "dialog.number({ title: '数量', initialValue: 1 })"),
    method('dialog-select', 'dialog.select(options)', '从短字符串数组选择。', "dialog.select({ title: '颜色', options: ['红色', '蓝色'] })"),
    method('dialog-confirm', 'dialog.confirm(options)', '确认 true、拒绝 false、返回或取消 null。', "dialog.confirm({ title: '删除', message: '确定删除吗？' })")
  ])
];

const UI_API = [
  document('api-ui-runtime', 'ui 渲染与状态', '仅 .ui.js 可用', 'UI 模式必须调用 ui.render。它没有 console；用组件和 script.toast 显示结果。渲染函数中不要创建请求、订阅或计时器等副作用。', [
    method('ui-render', 'ui.render(view | factory)', '显示一个组件、组件数组或可重绘的函数。', "const count = ui.signal(0)\nui.render(() => [\n  ui.heading('计数器'),\n  ui.text('当前：' + count.get()),\n  ui.button('增加', () => count.update(value => value + 1), { id: 'add' })\n])"),
    method('ui-refresh', 'ui.refresh()', '重新执行当前渲染函数。signal 写入通常会自动刷新。', 'ui.refresh()'),
    method('ui-signal', 'ui.signal(initial)', '状态对象提供 get、set 和 update。', "const busy = ui.signal(false)\nbusy.set(true)"),
    method('ui-page', 'setTitle / showHeader / scroll', '设置标题、隐藏顶栏、滚动到位置/顶部/底部。', "ui.setTitle('设置')\nui.showHeader(false)\nui.scrollTop()")
  ], '最多 40 个根组件；每段文本最多 1024 字符。动态或会重排的交互组件应提供稳定唯一的 id。'),
  document('api-ui-components', 'ui 组件', '文本、操作和展示组件', '组件函数返回传给 ui.render 的描述。按钮回调不带参数；switch 和 slider 回调依次收到 boolean、number。', [
    method('ui-text', 'heading / text', '标题和正文，options 支持 id、size、color、align。字号范围 16 至 36。', "ui.heading('标题', { size: 30 })\nui.text('正文', { align: 'center' })"),
    method('ui-action', 'button / buttonRow', '主按钮或最多四个同行按钮，tone 为 primary、neutral、danger。', "ui.button('退出', () => script.exit(), { id: 'exit', tone: 'neutral' })"),
    method('ui-input', 'switch / slider', '状态开关和数值滑块。slider 可设置 min、max、step。', "ui.switch('启用', true, value => script.toast(String(value)), { id: 'enabled' })"),
    method('ui-display', 'progress / grid', '进度条和只展示的网格。grid 为 2 至 4 列，最多 9 行。', "ui.progress('下载', 68)\nui.grid([{ text: 'A', tone: 'primary' }], { id: 'items', columns: 2 })"),
    method('ui-layout', 'divider / spacer', '分隔线和固定垂直间距。', 'ui.divider()\nui.spacer(16)')
  ])
];

const SYSTEM_API = [
  directory('system-device', '设备与文件', 'system.device、system.files、system.display', [
    document('system-device-api', 'system.device', '设备资料与容量', '读取设备信息、ID、序列号和存储容量。设备 ID/序列号受权限和设备支持影响。', [
      method('system-device-info', 'getInfo', '读取设备资料。', "system.device.getInfo({ success: data => script.toast(data.deviceType), fail: () => script.toast('不可用') })"),
      method('system-device-storage', 'getTotalStorage / getAvailableStorage', '读取存储容量。', "system.device.getAvailableStorage({ success: data => script.toast(String(data.size)) })")
    ]),
    document('system-files-api', 'system.files', '文本、二进制与目录', '文件 URI 使用 internal://files/。写入、删除、移动、复制前应由用户明确触发。', [
      method('system-files-text', 'readText / writeText', '读写文本文件。', "system.files.writeText({ uri: 'internal://files/note.txt', text: 'hello' })"),
      method('system-files-manage', 'list / get / access / mkdir / rmdir / move / copy / delete', '列出、检查或管理文件和目录。', "system.files.list({ uri: 'internal://files/', success: data => script.toast(String(data.fileList.length)) })")
    ]),
    document('system-display-api', 'system.display', '亮度与常亮', '读取或设置显示亮度和模式。修改设备设置应由用户主动触发。', [
      method('system-display-value', 'getValue / setValue', '亮度范围为 0 至 255。', "system.display.setValue({ value: 100 })"),
      method('system-display-keep', 'getMode / setMode / setKeepScreenOn', '设置显示模式或常亮。', "system.display.setKeepScreenOn({ keepScreenOn: true })")
    ]),
    document('system-battery-api', 'system.battery', '电量与充电状态', '该模块在部分 Band Pro 设备不可用；调用前检查能力，并始终提供 fail 处理。', [
      method('system-battery-status', 'getStatus', '读取 0 到 1 的电量和 charging 状态。', "if (script.canUse('@system.battery.getStatus')) {\n  system.battery.getStatus({ success: data => script.toast(String(data.level)) })\n}")
    ])
  ]),
  directory('system-network', '网络与配套端', 'system.http、download、upload、companion', [
    document('system-http-api', 'system.http', 'HTTP 请求', '使用对象参数和 success/fail/complete 回调；UI 中把结果写入 signal 或界面状态。', [
      method('system-http-request', 'request(options)', '发送 HTTP 请求。', "system.http.request({\n  url: 'https://example.com/api', responseType: 'json',\n  success: res => script.toast('HTTP ' + res.code),\n  fail: (data, code) => script.toast('请求失败：' + code)\n})")
    ]),
    document('system-transfer-api', 'system.download 与 system.upload', '下载和上传文件', '下载先 start 再 wait；上传返回任务，可 abort 或监听进度。完成或退出时清理任务监听。', [
      method('system-download', 'download.start / download.wait', '创建并等待下载任务。', "system.download.start({ url: 'https://example.com/file', success: task => system.download.wait({ token: task.token, success: data => script.toast(data.uri) }) })"),
      method('system-upload', 'upload.file', '上传文件，返回 UploadTask。', "const task = system.upload.file({ url: 'https://example.com/upload', filePath: 'internal://files/note.txt', name: 'file' })")
    ]),
    document('system-companion-api', 'system.companion', '配套端连接', '通过 instance 获取连接对象；连接状态和传输能力依设备与配套端而定。', [
      method('system-companion-instance', 'instance()', '获取连接对象。', 'const connect = system.companion.instance()'),
      method('system-companion-operations', 'getReadyState / diagnosis / send', '读取状态、诊断或发送数据。', "connect.send({ data: { type: 'hello' } })")
    ])
  ]),
  directory('system-hardware', '传感器、媒体与工具', 'vibration、sensors、location、audio、crypto 等', [
    document('system-feedback-api', 'system.vibration', '触觉反馈', '短震动或长震动。避免在循环和高频回调中调用。', [
      method('system-vibrate', 'vibrate({ mode })', 'mode 为 short 或 long。', "system.vibration.vibrate({ mode: 'short' })")
    ]),
    document('system-sensors-api', 'system.sensors / system.location / system.network', '传感器、定位与网络变化', '调用前用 script.canUse 检查。订阅必须在不再需要时取消；部分能力在 Band Pro 不支持。', [
      method('system-sensor', 'subscribe / unsubscribe', '压力和加速度计订阅。', "system.sensors.subscribeAccelerometer({ interval: 'normal', callback: data => { /* 节流处理 */ } })"),
      method('system-location', 'location.getLocation / subscribe / unsubscribe', '定位需要权限。', "if (script.canUse('@system.geolocation.getLocation')) system.location.getLocation({ success: data => script.toast(String(data.latitude)) })"),
      method('system-network-info', 'network.getType / subscribe / unsubscribe', '网络类型和变化监听。', "system.network.getType({ success: data => script.toast(data.type) })")
    ]),
    document('system-media-api', 'system.audio / recorder / events', '音频、录音与应用内事件', '长时间运行的音频、录音和订阅都需要明确的停止操作，并在退出前释放。', [
      method('system-audio', 'play / pause / stop / getPlayState', '控制音频播放。', 'system.audio.stop()'),
      method('system-recorder', 'start / stop / onframerecorded', '录音控制及音频帧回调。', 'system.recorder.stop()'),
      method('system-events', 'publish / subscribe / unsubscribe', '发布、订阅和取消应用内事件。', "const id = system.events.subscribe({ eventName: 'changed', callback: () => {} })")
    ]),
    document('system-crypto-api', 'system.crypto', '摘要、签名、加解密与 Base64', '不要在脚本中硬编码或持久化密钥。异步方法处理 success/fail。', [
      method('system-crypto-hash', 'hashDigest', '计算摘要。', "const digest = system.crypto.hashDigest({ data: 'hello', algo: 'SHA256' })"),
      method('system-crypto-codec', 'btoa / atob', 'Base64 编码和解码。', "const text = system.crypto.atob(system.crypto.btoa('hello'))")
    ])
  ])
];

const CLOUD = document('guide-cloud', '云端文件与 JS 市场', '手动上传、下载与市场脚本', '云空间只保存当前文件。手环生成一次性配对码和二维码，用户在 ccicc.icu 的网页确认；设备不会保存主站密码。', [
  method('cloud-pair', '手环发起配对', '在云账户生成配对码或二维码，再在网页确认。', '云账户 -> 生成配对码 -> 网页确认'),
  method('cloud-files', '云空间', '从本地文件操作中手动上传，或从云端文件手动下载。', '同名上传会替换云端当前内容'),
  method('cloud-market', 'JS 市场', '市场脚本只下载到本地；发布在网页端完成。', '下载同名文件前确认覆盖')
]);

export const HELP_ROOT = [
  directory('getting-started', '快速开始', '创建、运行与模式选择', START),
  directory('script-api', 'JSLab 脚本 API', 'script、dialog 与 UI', SCRIPT_API.concat([directory('ui-api', 'UI API', '仅 UI 模式的界面组件', UI_API)])),
  directory('system-api', '系统 API', '统一从 system 访问 Vela 能力', SYSTEM_API),
  directory('tools-support', '工具与云端', '云端文件与市场', [CLOUD])
];

export function findHelpNode(id, nodes) {
  const list = nodes || HELP_ROOT;
  for (let index = 0; index < list.length; index += 1) {
    const node = list[index];
    if (node.id === id) return node;
    if (node.type === 'directory') {
      const child = findHelpNode(id, node.items);
      if (child) return child;
    }
  }
  return null;
}

export function getDirectoryItems(id) {
  if (!id) return HELP_ROOT;
  const node = findHelpNode(id);
  return node && node.type === 'directory' ? node.items : HELP_ROOT;
}
