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
  document('guide-start','新建、保存与运行','统一 JavaScript 运行器','新建时选择名字和用途模板，默认 .js。创建后进入编辑器，关闭编辑器回到首页。所有编辑器的运行都使用当前编辑内容，不自动保存；保存请点保存按钮。Console 与 UI 是同一次执行的两个视图；旧 .ui.js 名字不改动。右上重载复用本次源码快照。',[
    method('start-editor','编辑器操作','返回先关闭菜单、收起键盘或光标控制，再询问未保存修改。v2 右上角菜单提供 AI 生成、另存为和编辑器设置。'),
    method('start-console','日志','计算和日志，无需 UI。',"console.log('Hello, JSLab!')"),
    method('start-ui','界面与日志','所有脚本都可用 UI，同时可以输出日志。',"console.log('启动'); ui.render([ui.heading('Hello')])")
  ]),
  document('guide-runtime','运行时对象','console / ui / dialog / script / system','五个对象同时注入；不要 import、require 或使用裸 Vela 模块。页面初始化一次，UI/Console 切换和对话框恢复不重跑。',[
    method('runtime-views','ui.show / ui.hide','成功 render 后轻点 Console 内容也能恢复 UI；UI 返回到 Console，Console 返回离开。','ui.hide(); ui.show();'),
    method('runtime-reload','script.reload / script.exit','reload 原生替换页面重建本次运行；exit 直接退出。没有运行菜单、停止或页面内重跑。','script.reload()')
  ],'顶层 await 无效，await 放在 async 函数中；return main() 可让宿主观察其拒绝。页替换不等于重启共享 JS context。')
];
const SCRIPT_API = [
  document('api-script-core','script','文件信息、能力、重载、退出和提示','脚本控制对象。',[
    method('script-info','script.name','实际文件名也是持久化命名空间。',"console.log(script.name)"),
    method('script-capability','script.canUse(capability)','查询原生可选能力。',"script.canUse('@system.sensor.subscribeAccelerometer')"),
    method('script-locale','script.locale()','语言及地区。','console.log(script.locale())'),
    method('script-reload','script.reload()','与右上按钮共用完整页面重建，不重新读取磁盘。','script.reload()'),
    method('script-exit','script.exit()','直接退出；自己的原生订阅/媒体任务仍应结束。','script.exit()'),
    method('script-toast','script.toast(message,duration)','1500–10000ms 提示。',"script.toast('已保存')")
  ]),
  document('api-console','console','有界日志','log/info/warn/error/clear；最多64条、合计6144字符、每条1024字符。隐藏 Console 只记录缓冲，错误前日志保留，不自动写文件。',[
    method('console-output','log/info/warn/error','多参数、浅层对象预览；error 只是日志级别。',"console.log('结果',42)"),
    method('console-clear','console.clear()','清空本次日志。','console.clear()')
  ]),
  document('api-script-data','script.data 与 script.config','按文件名隔离','API 相同，都返回 Promise；单值16KiB，每区64KiB。',[
    method('script-store-get','get(key,fallback)','读取或使用默认值。',"script.data.get('count',0).then(console.log)"),
    method('script-store-set','set(key,value)','保存可序列化数据。',"script.config.set('unit','metric')"),
    method('script-store-manage','delete/clear/all','删除键、清空或读取全部。',"script.data.delete('count')")
  ]),
  document('api-dialog','dialog','五种单项对话框','全部返回 Promise<{action,value}>；正常取消 action=cancel,value=null。先检查 action，空串、0、false 是有效业务值。同一时间一个，没有嵌套队列。',[
    method('dialog-alert','dialog.alert','信息提示，确认值 null。',"dialog.alert({title:'完成',message:'已完成'})"),
    method('dialog-confirm','dialog.confirm','可选 secondaryText；通过 action 区分三个动作。',"dialog.confirm({title:'保存？',confirmText:'保存',secondaryText:'不保存',cancelText:'继续编辑'}).then(r => console.log(r.action))"),
    method('dialog-text','dialog.text','value/placeholder/required/minLength/maxLength/language；默认64，最大8000字符，不自动 trim。',"dialog.text({title:'名称',value:'测试',maxLength:100}).then(r => {if(r.action==='confirm') console.log(r.value)})"),
    method('dialog-number','dialog.number','支持负数小数；required/min/max/decimals，默认6位小数，0为整数。',"dialog.number({title:'温度',value:-2.5,min:-20,max:50,decimals:1})"),
    method('dialog-select','dialog.select','items 的 label/value 分开；支持 description/disabled、多选/数量约束，最多100项，原生列表连续滚动。',"dialog.select({items:[{label:'工具',value:'tool'},{label:'游戏',value:'game'}],multiple:true,minSelected:1})")
  ],'无效参数 DIALOG_INVALID；已有对话框 DIALOG_BUSY；打开失败 DIALOG_OPEN_FAILED；退出来源 DIALOG_INACTIVE。结果在来源页面恢复后交付。')
];

const UI_API = [
  document('api-ui-runtime', 'ui 渲染与状态', 'UI API v2', '所有脚本调用 ui.render 成功提交后显示界面；同时可输出 console 日志。渲染函数保持纯函数，不在其中请求网络、创建计时器或更新状态。', [
    method('ui-render', 'ui.render(view | factory)', '立即显示组件、数组或纯渲染函数的结果。null 和 false 不占位置。', "const count = ui.signal(0)\nui.render(() => [\n  ui.text('当前：' + count.get(), { lines: 1 }),\n  ui.button('增加', () => count.update(n => n + 1), { id: 'add' })\n])"),
    method('ui-refresh', 'ui.refresh()', '请求重绘；同一轮多次更新合并一次，不立即刷新。', 'ui.refresh()'),
    method('ui-signal', 'ui.signal(initial)', 'get/set/update 立即读写值。相同值或相同对象引用不刷新；对象请创建新对象。', "const state = ui.signal({ count: 0 })\nstate.update(old => ({ count: old.count + 1 }))"),
    method('ui-page', 'setTitle / showHeader / scroll', '标题最多80字符；显示顶栏时内容从84px开始，隐藏后从12px开始。', "ui.setTitle('设置')\nui.showHeader(false)\nui.scrollTop()")
  ], '40个声明节点（含布局、buttonRow按钮，不含grid格子）；布局最多4层；展开后最多160个绘制节点；二维码最多2个。超限显示错误，不截断。id全页唯一、最长56字符且不能以$开头。'),
  document('api-ui-layout', '行、列与叠放', '少量布局描述，浅层渲染', '布局容器默认不生成原生节点。设置background才绘制背景。尺寸单位为设计像素，页面内容宽324px；默认根节点纵向间距10px。', [
    method('ui-row', 'ui.row(children, options)', '横向排列；未指定宽度的子项按flex分配剩余宽度，默认等分。', "ui.row([\n  ui.text('左', { width: 100, lines: 1 }),\n  ui.text('右', { lines: 1 })\n], { gap: 8, align: 'center' })"),
    method('ui-column', 'ui.column(children, options)', '纵向排列；可嵌套row/column。子项默认填满宽度。', "ui.column([ui.heading('标题'), ui.text('内容')], { padding: 12, gap: 8, background: '#24262a', radius: 24 })"),
    method('ui-stack', 'ui.stack(children, options)', '叠放，后面的子项在上；子项通过x/y定位，需指定较小width才能水平移动。', "ui.stack([\n  ui.text('底层', { lines: 1 }),\n  ui.text('右上', { width: 80, x: 220, y: 0, lines: 1 })\n], { height: 80 })"),
    method('ui-size', 'width / height / gap / padding', 'width支持像素或百分比；height为像素。gap默认8、范围0–48；padding为统一内边距0–48。背景用background，圆角用radius。', "ui.column([ui.text('居中', { width: '60%', lines: 1 })], { align: 'center' })"),
    method('ui-align', 'align / justify / flex', '布局align支持start/center/end；justify还支持between。row按高度对齐，column按宽度对齐；justify分配剩余主轴空间。flex只分配row子项的剩余宽度。', "ui.row([ui.text('1', { flex: 1, lines: 1 }), ui.text('2', { flex: 2, lines: 1 })])")
  ], '不支持CSS、递归原生组件或自动换行row。布局height不会压缩内容；叶子height会裁剪内容。短标签推荐lines:1；自动文本高度采用保守估算，精确面板显式设置lines/lineHeight。'),
  document('api-ui-components', '组件与颜色', '现有组件 + 二维码', '交互使用原生点击和数值变化；按钮 disabled 排除回调并显示禁用样式。', [
    method('ui-text', 'heading / text', 'size为16–36；color文字色；align为left/center/right；支持bold、lines、lineHeight及通用宽高背景。', "ui.text('正文', { lines: 2, color: '#abc', lineHeight: 32 })"),
    method('ui-action', 'button / buttonRow', '按钮color控制文字、background控制背景。tone仍支持primary/neutral/danger。buttonRow最多4项，子按钮id有效。', "ui.button('操作', run, { id: 'run', background: '#176b45', color: '#fff' })"),
    method('ui-input', 'switch / slider', 'color为标题色、background为卡片背景、accent为滑轨强调色、thumbColor为滑块色。slider另有trackColor、min/max/step；switch另有detail/detailColor。最小宽160px。', "ui.switch('启用', true, value => script.toast(String(value)), { id: 'enabled', accent: '#176b45' })"),
    method('ui-display', 'progress / grid', 'progress用accent强调进度，兼容原color进度色；grid为2–4列、最多9行，只展示。格子支持background/color，文字最多8字符。', "ui.progress('下载', 68, { accent: '#176b45' })\nui.grid([{ text: 'A', background: '#174', color: '#fff' }], { columns: 2 })"),
    method('ui-qr', 'ui.qrcode(value, options)', '内容1–256字符；size为96–288、默认160，包含四周8px空白；color/background默认黑白。同屏最多2个。', "ui.column([ui.qrcode('https://ccicc.icu', { id: 'qr', size: 180 })], { align: 'center' })"),
    method('ui-layout', 'divider / spacer', 'divider支持color/height；spacer控制垂直间距。', "ui.divider({ color: '#456' })\nui.spacer(16)")
  ], '推荐不透明#RGB/#RRGGBB/rgb(r,g,b)，兼容有效rgba。没有opacity。未知颜色回退默认值。尺寸过窄、重复id、节点超限会提示具体错误。')
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
  method('cloud-market', 'JS 市场', '市场右上角可选择本地脚本，填写名称、说明与标签后提交审核；市场脚本也可下载到本地。', '下载同名文件前确认覆盖')
]);

export const HELP_ROOT = [
  directory('getting-started', '快速开始', '创建、运行与视图切换', START),
  directory('script-api', 'JSLab 脚本 API', 'script、dialog 与 UI', SCRIPT_API.concat([directory('ui-api', 'UI API', '所有脚本可用的界面组件', UI_API)])),
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
