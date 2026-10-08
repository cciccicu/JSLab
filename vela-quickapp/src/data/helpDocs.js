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
  document('guide-start', '新建、保存与运行', '从创建脚本到查看结果', '在首页选择“新建脚本”，输入文件名并选择模板。文件名没有 .js 后缀时会自动补上；创建完成后会打开编辑器。', [
    method('start-editor', '编辑代码', '点击代码区域开始编辑。右上角菜单有 AI 生成、另存为、编辑器设置、帮助，以及当前脚本的清除数据和清除配置。返回时，如果有未保存的修改，可以选择保存、放弃或继续编辑。'),
    method('start-run', '运行当前代码', '收起键盘后，点击编辑器底部的运行按钮。运行会使用当前编辑的内容，但不会自动保存；要保留修改，请点击保存按钮。'),
    method('start-console', '输出日志', '用 console.log 查看计算结果或排查问题。只需要日志的脚本无需创建界面。', "console.log('Hello, JSLab!')"),
    method('start-ui', '显示界面', '任何脚本都可以调用 ui.render 显示界面，也可以同时输出日志。', "console.log('已启动')\nui.render([ui.heading('Hello')])")
  ]),
  document('guide-runtime', '查看界面与日志', '切换视图、返回和重新运行', '界面和日志属于同一次运行。切换视图或从对话框返回时，脚本不会从头执行。', [
    method('runtime-views', '切换界面与日志', '在界面按返回会看到日志；如果脚本已经显示过界面，点击日志区域可回到界面。在日志页按返回会离开运行页。脚本也可调用 ui.show() 或 ui.hide()。'),
    method('runtime-reload', '重新运行或退出', '点击右上角的重载按钮，或调用 script.reload()，可以重新运行这次打开时的代码。script.exit() 会离开运行页。', 'script.reload()')
  ])
];
const SCRIPT_API = [
  document('api-script-core', 'script', '脚本信息与运行控制', '脚本可直接使用 script 对象，不需要导入。', [
    method('script-info', 'script.name', '读取当前脚本的文件名。', 'console.log(script.name)'),
    method('script-capability', 'script.canUse(capability)', '检查设备是否支持某项系统功能。', "if (script.canUse('@system.sensor.subscribeAccelerometer')) {\n  console.log('支持加速度计')\n}"),
    method('script-locale', 'script.locale()', '读取设备的语言和地区信息。', 'console.log(script.locale())'),
    method('script-reload', 'script.reload()', '重新运行这次打开时的代码，包括从编辑器运行时尚未保存的修改。', 'script.reload()'),
    method('script-exit', 'script.exit()', '离开运行页。脚本启动的录音、传感器监听等任务，应在不再使用时主动停止。', 'script.exit()'),
    method('script-toast', 'script.toast(message, duration)', '在屏幕上显示短暂提示；可设置 1500 至 10000 毫秒。', "script.toast('已保存')")
  ], '需要等待异步操作时，把代码放进 async 函数，并在脚本末尾写 return main()；不能直接在最外层使用 await。'),
  document('api-console', 'console', '输出和清空日志', '日志页显示脚本的输出。切换到界面后，日志仍会保留；日志不会自动保存为文件。', [
    method('console-output', 'log / info / warn / error', '可以输出多个值。error 用于标记错误消息，不会让脚本自动退出。', "console.log('结果', 42)"),
    method('console-clear', 'console.clear()', '清空本次运行的日志。', 'console.clear()')
  ], '日志最多保留最近 64 条。记录较多时，最早的内容会被移除。'),
  document('api-script-data', '保存脚本数据', 'script.data 与 script.config', '用 script.data 保存脚本产生的数据，用 script.config 保存设置。两者的用法相同，数据分别保存；不同文件名的脚本也互不共用。', [
    method('script-store-get', 'get(key, fallback)', '读取一个值；没有保存过时返回给定的默认值。', "script.data.get('count', 0).then(value => console.log(value))"),
    method('script-store-set', 'set(key, value)', '保存字符串、数字、布尔值或可序列化的对象。', "script.config.set('unit', 'metric')"),
    method('script-store-manage', 'delete / clear / all', '删除一个键、清空全部数据，或读取全部内容。', "script.data.delete('count')")
  ], '这些方法返回 Promise。单个值最多 16 KiB，data 和 config 各可保存 64 KiB。编辑器菜单可以分别清除当前脚本的数据或配置；重命名脚本时两者会迁移，删除脚本时会一并删除。'),
  document('api-dialog', '对话框', '提示、确认、输入和选择', 'dialog 的方法会在用户完成操作后返回结果。先检查 result.action，再使用 result.value；按返回或取消时，action 为 cancel。', [
    method('dialog-alert', 'dialog.alert', '显示一条消息和确认按钮。', "dialog.alert({ title: '完成', message: '已保存' })"),
    method('dialog-confirm', 'dialog.confirm', '让用户确认操作。设置 secondaryText 可以增加第三个选择，并通过 action 区分结果。', "return dialog.confirm({ title: '保存修改？', confirmText: '保存', secondaryText: '不保存' })\n  .then(result => console.log(result.action))"),
    method('dialog-text', 'dialog.text', '输入文字。可设置初始值 value、提示文字 placeholder、是否必填 required，以及长度和输入语言。', "return dialog.text({ title: '名称', maxLength: 100 })\n  .then(result => {\n    if (result.action === 'confirm') console.log(result.value)\n  })"),
    method('dialog-number', 'dialog.number', '输入整数或小数。可用 min、max 限制范围，用 decimals 设置小数位数；0 表示只输入整数。', "dialog.number({ title: '温度', value: -2.5, min: -20, max: 50, decimals: 1 })"),
    method('dialog-select', 'dialog.select', '从 items 中选择。每项可设置 label、value、description 和 disabled；设置 multiple: true 可多选。', "dialog.select({ items: [\n  { label: '工具', value: 'tool' },\n  { label: '游戏', value: 'game' }\n] })")
  ], '同一时间只能打开一个对话框。文字输入默认最多 64 字，选择列表最多 100 项；取消时的 value 为 null，空字符串和数字 0 则可能是有效输入。')
];

const UI_API = [
  document('api-ui-runtime', '显示与更新界面', '显示界面和更新数据', '调用 ui.render 后，脚本就能显示自己的界面。变化的数据可以放在 ui.signal 中，界面会随之更新。', [
    method('ui-render', 'ui.render(view | factory)', '显示一个组件、一组组件，或根据当前状态生成界面的函数。', "const count = ui.signal(0)\nui.render(() => [\n  ui.text('当前：' + count.get(), { lines: 1 }),\n  ui.button('增加', () => count.update(n => n + 1), { id: 'add' })\n])"),
    method('ui-signal', 'ui.signal(initial)', '用 get 读取，用 set 或 update 修改。对象内容变化时，请返回新对象。', "const state = ui.signal({ count: 0 })\nstate.update(old => ({ count: old.count + 1 }))"),
    method('ui-refresh', 'ui.refresh()', '手动请求更新界面。连续修改多次状态时，会合并更新。', 'ui.refresh()'),
    method('ui-page', '标题、顶栏和滚动', '用 setTitle 设置标题，showHeader 控制顶栏；scrollTo、scrollTop 和 scrollBottom 可移动页面。', "ui.setTitle('设置')\nui.showHeader(false)\nui.scrollTop()")
  ], '生成界面的函数只负责返回组件。网络请求、计时器和状态修改请放在函数外或按钮回调中。'),
  document('api-ui-layout', '排列界面内容', '横排、竖排与自由定位', '用 row 横向排列，用 column 纵向排列。需要把按钮放在指定位置时，可用 stack 和 x、y。下面的布局示例可放在 ui.render 中使用。', [
    method('ui-row', 'ui.row(children, options)', '横向排列组件。没有指定宽度的子项默认平分剩余空间。', "ui.row([\n  ui.text('左', { width: 100, lines: 1 }),\n  ui.text('右', { lines: 1 })\n], { gap: 8 })"),
    method('ui-column', 'ui.column(children, options)', '纵向排列组件。可设置间距、内边距、背景色和圆角。', "ui.column([\n  ui.heading('标题'),\n  ui.text('内容')\n], { gap: 8, padding: 12, background: '#262626', radius: 24 })"),
    method('ui-stack', 'ui.stack(children, options)', '让组件叠放，并用 x、y 指定位置。靠后的组件会盖在前面的组件上。', "ui.stack([\n  ui.button('左', () => {}, { id: 'left', x: 0, y: 20, width: 90 }),\n  ui.button('右', () => {}, { id: 'right', x: 220, y: 20, width: 90 })\n], { height: 80 })"),
    method('ui-size', 'width / height / gap / padding', 'width 可用像素或百分比；height、gap 和 padding 使用像素。background 设置背景色，radius 设置圆角。', "ui.text('半宽文字', { width: '50%', lines: 1 })"),
    method('ui-align', 'align / justify / flex', 'align 控制横向或纵向对齐；justify 分配多余空间；row 子项可用 flex 指定宽度比例。', "ui.row([\n  ui.text('1', { flex: 1, lines: 1 }),\n  ui.text('2', { flex: 2, lines: 1 })\n])")
  ], 'row 不会自动换行。文字或按钮需要固定高度时，可设置 height；内容超出高度可能被裁剪。样式请写在组件的 options 中。'),
  document('api-ui-components', '界面组件与颜色', '文字、按钮和二维码等', '组件的颜色和尺寸通过 options 设置。需要响应点击时，给按钮传入回调函数。下面的组件示例可放在 ui.render 中使用。', [
    method('ui-text', 'heading / text', '显示标题或正文。可设置 size、color、bold、align、lines 和 lineHeight。', "ui.text('正文', { color: '#ffffff', lines: 2 })"),
    method('ui-action', 'button / buttonRow', '创建单个按钮或一排按钮。background 设置底色，color 设置文字色；disabled: true 可禁用按钮。', "ui.button('保存', () => script.toast('已保存'), {\n  id: 'save', background: '#0d6eff', color: '#fff'\n})"),
    method('ui-input', 'switch / slider', '创建开关或滑块。回调会收到新值；可用 accent、trackColor、thumbColor 调整颜色。', "ui.switch('启用', true, value => {\n  console.log('当前状态', value)\n}, { id: 'enabled' })"),
    method('ui-display', 'progress / grid', 'progress 显示进度；grid 以 2 至 4 列展示信息，格子不能直接点击。', "ui.progress('下载', 68, { accent: '#0d6eff' })\nui.grid([{ text: 'A' }, { text: 'B' }], { columns: 2 })"),
    method('ui-qr', 'ui.qrcode(value, options)', '显示二维码。size 可设为 96 至 288 像素；建议使用短网址并保持黑白对比。', "ui.qrcode('https://ccicc.icu', { size: 180 })"),
    method('ui-layout', 'divider / spacer', '添加分隔线或留出纵向空白。', "ui.divider({ color: '#666666' })\nui.spacer(16)")
  ], '交互组件建议设置唯一且稳定的 id。组件数量、布局层数和二维码数量没有额外上限。手环性能参考值为约 40 个组件、160 个绘制节点、4 层布局、2 个二维码；较大的界面建议分批显示并降低更新频率。')
];

const SYSTEM_API = [
  directory('system-device', '设备与文件', '设备信息、文件与屏幕', [
    document('system-device-api', 'system.device', '设备信息和存储空间', '读取设备信息、设备标识和存储容量。可获取的字段因设备和权限而异。', [
      method('system-device-info', 'getInfo', '读取设备类型等信息。', "system.device.getInfo({\n  success: data => console.log(data.deviceType),\n  fail: () => script.toast('无法读取设备信息')\n})"),
      method('system-device-storage', 'getTotalStorage / getAvailableStorage', '读取总容量或剩余容量。', "system.device.getAvailableStorage({\n  success: data => console.log(data.size)\n})")
    ]),
    document('system-files-api', 'system.files', '读取和管理文件', '脚本可操作 internal://files/ 中的文件。覆盖、移动或删除文件前，建议先让用户确认。', [
      method('system-files-text', 'readText / writeText', '读取或写入文本文件。', "system.files.writeText({\n  uri: 'internal://files/note.txt', text: 'hello'\n})"),
      method('system-files-manage', 'list / get / access / mkdir / rmdir / move / copy / delete', '查看目录、检查文件，或管理文件与文件夹。', "system.files.list({\n  uri: 'internal://files/',\n  success: data => console.log(data.fileList.length)\n})")
    ]),
    document('system-display-api', 'system.display', '屏幕亮度与常亮', '读取或调整屏幕亮度，也可以让屏幕保持点亮。修改设备设置前，请让用户主动选择。', [
      method('system-display-value', 'getValue / setValue', '读取或设置亮度，数值范围为 0 至 255。', 'system.display.setValue({ value: 100 })'),
      method('system-display-keep', 'getMode / setMode / setKeepScreenOn', '读取或设置显示模式及常亮状态。', 'system.display.setKeepScreenOn({ keepScreenOn: true })')
    ]),
    document('system-battery-api', 'system.battery', '电量与充电状态', '部分设备不支持电池接口。调用前先检查是否可用，并处理读取失败的情况。', [
      method('system-battery-status', 'getStatus', '读取电量比例和充电状态。电量值为 0 至 1。', "if (script.canUse('@system.battery.getStatus')) {\n  system.battery.getStatus({\n    success: data => console.log(data.level, data.charging),\n    fail: () => script.toast('无法读取电量')\n  })\n}")
    ])
  ]),
  directory('system-network', '网络与配套端', '网络请求、传输与连接', [
    document('system-http-api', 'system.http', '发送网络请求', '请求完成后分别在 success 或 fail 中处理结果。界面脚本可以把结果写入 ui.signal 来更新显示。', [
      method('system-http-request', 'request(options)', '发送 HTTP 请求并处理响应。', "system.http.request({\n  url: 'https://example.com/api',\n  responseType: 'json',\n  success: res => console.log(res.data),\n  fail: (data, code) => console.error('请求失败', code)\n})")
    ]),
    document('system-transfer-api', 'system.download 与 system.upload', '下载和上传文件', '下载时先开始任务，再等待完成；上传任务可以取消，也可以监听进度。', [
      method('system-download', 'download.start / download.wait', '下载文件并读取保存位置。', "system.download.start({\n  url: 'https://example.com/file',\n  success: task => system.download.wait({\n    token: task.token,\n    success: data => console.log(data.uri)\n  })\n})"),
      method('system-upload', 'upload.file', '上传本地文件并取得上传任务。', "const task = system.upload.file({\n  url: 'https://example.com/upload',\n  filePath: 'internal://files/note.txt',\n  name: 'file'\n})")
    ]),
    document('system-companion-api', 'system.companion', '与配套端通信', '设备支持配套端连接时，可读取连接状态并发送数据。', [
      method('system-companion-instance', 'instance()', '取得配套端连接对象。', 'const connection = system.companion.instance()'),
      method('system-companion-operations', 'getReadyState / diagnosis / send', '检查连接、诊断问题或发送数据。', "const connection = system.companion.instance()\nconnection.send({ data: { type: 'hello' } })")
    ])
  ]),
  directory('system-hardware', '传感器与媒体', '震动、定位与音频', [
    document('system-feedback-api', 'system.vibration', '震动反馈', '可以发出短震动或长震动。避免在高频循环中反复震动。', [
      method('system-vibrate', 'vibrate({ mode })', 'mode 可设为 short 或 long。', "system.vibration.vibrate({ mode: 'short' })")
    ]),
    document('system-sensors-api', '传感器、定位与网络状态', 'system.sensors / location / network', '设备提供的能力可能不同。订阅变化后，脚本应在不再需要时取消订阅。', [
      method('system-sensor', 'sensors.subscribe / unsubscribe', '读取加速度计或压力传感器的变化。不要在高频回调中持续输出日志。', "let latest = null\nif (script.canUse('@system.sensor.subscribeAccelerometer')) {\n  system.sensors.subscribeAccelerometer({\n    interval: 'normal',\n    callback: data => { latest = data }\n  })\n}"),
      method('system-location', 'location.getLocation / subscribe / unsubscribe', '读取位置或持续监听位置变化；定位需要设备授权。', "if (script.canUse('@system.geolocation.getLocation')) {\n  system.location.getLocation({\n    success: data => console.log(data.latitude)\n  })\n}"),
      method('system-network-info', 'network.getType / subscribe / unsubscribe', '读取网络类型或监听网络变化。', "system.network.getType({\n  success: data => console.log(data.type)\n})")
    ]),
    document('system-media-api', '音频、录音与事件', 'system.audio / recorder / events', '播放、录音和事件订阅可能在脚本界面切换后继续运行。用完后请停止或取消订阅。', [
      method('system-audio', 'audio.play / pause / stop / getPlayState', '播放、暂停、停止音频，或读取播放状态。', 'system.audio.stop()'),
      method('system-recorder', 'recorder.start / stop / onframerecorded', '开始或停止录音，并处理录音数据。', 'system.recorder.stop()'),
      method('system-events', 'events.publish / subscribe / unsubscribe', '在应用内发送事件、监听事件或取消监听。')
    ]),
    document('system-crypto-api', 'system.crypto', '摘要与编码', '可计算摘要、加解密或进行 Base64 编码。涉及密钥时，不要直接把密钥写进脚本。', [
      method('system-crypto-hash', 'hashDigest', '计算数据摘要。', "const digest = system.crypto.hashDigest({\n  data: 'hello', algo: 'SHA256'\n})"),
      method('system-crypto-codec', 'btoa / atob', '进行 Base64 编码或解码。', "const encoded = system.crypto.btoa('hello')\nconsole.log(system.crypto.atob(encoded))")
    ])
  ])
];

const CLOUD = document('guide-cloud', '云空间与 JS 市场', '配对、传输文件和发布脚本', 'JS 市场的浏览和下载无需配对或激活；从手环发布脚本需要先配对设备，无需激活云空间。云空间的文件传输需要配对并在网页端激活。', [
  method('cloud-pair', '配对设备', '在手环的云账户页点击“生成配对二维码”，再用网页扫码或输入配对码完成确认。', '设置 > 云账户 > 生成配对二维码'),
  method('cloud-files', '上传与下载', '在首页选中本地脚本后，点击底部上传按钮；点击首页云朵进入云空间，选中文件后可下载到本地。文件不会自动同步；同名上传会替换云端文件。'),
  method('cloud-market', '发布到 JS 市场', '先在“设置 > 云账户”完成设备配对，无需激活云空间。打开 JS 市场，点击右上角上传按钮，选择本地脚本并填写名称和用途说明。选脚本和填写资料不需要联网，确认提交后才上传审核；审核通过才会公开。'),
  method('cloud-download', '下载市场脚本', '在市场中点击脚本即可下载到本地。若本地已有同名文件，会先询问是否覆盖。')
]);

export const HELP_ROOT = [
  directory('getting-started', '开始使用', '新建脚本、运行并查看结果', START),
  directory('script-api', '编写脚本', '日志、数据、对话框和界面', SCRIPT_API.concat([directory('ui-api', '制作界面', '布局、组件和状态更新', UI_API)])),
  directory('system-api', '设备功能', '文件、网络和传感器等能力', SYSTEM_API),
  directory('tools-support', '云空间与市场', '配对设备、传输和发布脚本', [CLOUD])
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
