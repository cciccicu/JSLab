function method(id, name, description, example, note) {
  return { id, name, description, example: example || '', note: note || '' };
}

function document(id, title, summary, intro, methods, note) {
  return { id, type: 'document', title, summary, intro, methods, note: note || '' };
}

function directory(id, title, summary, items) {
  return { id, type: 'directory', title, summary, items };
}

const TUTORIALS = [
  document('guide-start', '新建、保存与运行', '从第一个脚本开始', '在“新建 JS”中选择模板或空白脚本，输入文件名并保存。编辑器中的运行按钮会根据首行模式声明打开 Console 或 UI 运行页。修改代码后需要再次运行。', [
    method('hello', 'console.log()', '向 Console 运行页输出文本或值。少量、分段输出更适合手环屏幕。', "console.log('Hello, JSLab!')\nconsole.log(2 + 3)")
  ], '单个脚本最大 48 KiB；一次输出过多文本可能导致内存不足。'),
  document('guide-input', 'Console 模式与输入', '输出结果，并让用户输入内容', '未声明模式时，JSLab 使用 Console 模式。input(message, callback) 会打开输入界面，并在确认或取消后以字符串调用 callback；空输入返回空字符串。', [
    method('input', 'input(message, callback)', '显示输入提示，并在 callback 中接收用户输入的字符串。', "input('请输入名字', name => {\n  if (name) console.log('你好，' + name)\n})"),
    method('number', 'Number(value)', '在输入回调中将文本转换为数字，并在使用前检查是否有效。', "input('请输入数值', text => {\n  const value = Number(text)\n  if (isNaN(value)) console.log('请输入有效数字')\n})")
  ], '同步死循环会阻塞运行页；请把长计算拆分，避免无限 while 循环。'),
  document('guide-storage', '数据持久化', '为设置、分数和小型状态保存数据', 'storage 适合少量键值数据；file 适合脚本、导出文本和更大的内容。所有文件 URI 都应使用应用的 internal://files/ 目录。', [
    method('storage-example', '保存并读取', '异步读写要在 success 与 fail 回调中处理结果。', "storage.set({ key: 'score', value: '42', success: () => console.log('已保存') })\nstorage.get({ key: 'score', success: data => console.log(data) })"),
    method('file-example', '文本文件', '使用 file.writeText 与 file.readText 写入、读取文本。', "file.writeText({ uri: 'internal://files/note.txt', text: 'hello' })")
  ], '不要把脚本或大文本拼成一个超大的 storage 值。'),
  document('guide-editor-font', '编辑器字体与度量', 'Ubuntu Mono 与编辑器排版配置', 'JSLab 仅内置 Ubuntu Mono，保证包体和渲染结果一致。手环“设置-字体”是独立页面，可调整行高倍率、行高偏移、ASCII 字宽和宽字符字宽。度量参数会影响光标位置、点按定位和横向滚动宽度。', [
    method('font-metrics', '受限度量参数', '参数是数值配置，不执行公式或 JavaScript。这样既可校准不同字体的排版，又不会让同步配置获得脚本执行权限。', '行高倍率：1\nASCII 字宽：0.5\n宽字符字宽：1')
  ], '修改度量参数后，编辑器会按新配置重新计算排版。'),
  document('guide-system', '系统能力与兼容性', '调用 Vela 原生模块前先处理失败分支', 'JSLab 已把常用 Vela 模块注入脚本作用域，无需 import。系统版本与手环型号会影响接口可用性；位置、设备标识等能力还会受到权限限制。', [
    method('feedback-example', '震动反馈', '最稳妥的入门系统能力之一。', "vibrator.vibrate({ mode: 'short' })"),
    method('failure-example', '失败处理', '网络、权限与硬件接口必须提供 fail 回调。', "fetch.fetch({ url: 'https://example.com', success: res => console.log(res.code), fail: (data, code) => console.log('失败：' + code) })")
  ], '目录中的“不支持手环 9 Pro”标记表示官方设备支持表不包含该接口。')
];

const UI_API = [
  document('ui-runtime', 'UI 模式、渲染与状态', '进入 UI 模式并让界面随状态更新', '将模式声明写在第一个非空行。ui.render 可以接收组件或返回组件数组的函数；使用 ui.signal 创建状态后，set 或 update 会刷新该渲染函数。', [
    method('ui-mode', '// @jslab-mode ui', '启用 UI 模式，未声明时默认使用 Console 模式。', "// @jslab-mode ui\nui.render([ui.text('你好')])"),
    method('ui-render', 'ui.render(view | factory)', '提交组件树或渲染函数。', "ui.render(() => [ui.heading('标题'), ui.text('内容')])"),
    method('ui-refresh', 'ui.refresh()', '重新执行当前渲染函数。', 'ui.refresh()'),
    method('ui-signal', 'ui.signal(initialValue)', '创建具备 get、set、update 的状态对象，写入后自动刷新。', "const count = ui.signal(0)\ncount.update(value => value + 1)")
  ], '单次渲染最多 40 个根组件；文本最多保留 1024 个字符。'),
  document('ui-page', 'UI 页面控制', '设置标题、顶栏、全屏、返回与提示', '这些方法只在 UI 模式可用。全屏会隐藏 JSLab 顶栏，脚本必须提供自己的可见返回入口。', [
    method('ui-title', 'ui.setTitle(text)', '设置顶部标题，最多显示 10 个字符。', "ui.setTitle('计数器')"),
    method('ui-topbar', 'ui.setTopBar(visible)', '显示或隐藏 JSLab 顶栏。', 'ui.setTopBar(false)'),
    method('ui-fullscreen', 'ui.fullscreen(enabled)', '全屏快捷接口；true 时释放顶部空间。', 'ui.fullscreen(true)'),
    method('ui-back', 'ui.back()', '返回上一个 JSLab 页面。', 'ui.back()'),
    method('ui-toast', 'ui.toast(message, duration)', '显示 1500 至 10000 ms 的提示。', "ui.toast('保存成功', 1500)")
  ]),
  document('ui-components', 'UI 组件', '文本、按钮、选择与进度组件', '组件函数返回可交给 ui.render 的界面描述。会改变顺序的交互组件应提供稳定且唯一的 id。', [
    method('ui-heading', 'ui.heading(text, options)', '标题；options 可设置 size、color、align。字号范围 16 至 36。', "ui.heading('设置', { size: 30, align: 'left' })"),
    method('ui-text', 'ui.text(text, options)', '普通文本；options 支持 size、color、align。', "ui.text('当前数值：10', { align: 'center' })"),
    method('ui-button', 'ui.button(text, callback, options)', '按钮；tone 支持 primary、neutral、danger。', "ui.button('保存', save, { id: 'save', tone: 'primary' })"),
    method('ui-switch', 'ui.switch(label, value, callback, options)', '开关；options 可设置 id 与 detail。', "ui.switch('蓝牙', enabled.get(), value => enabled.set(value), { id: 'bluetooth' })"),
    method('ui-slider', 'ui.slider(label, value, callback, options)', '滑块；options 支持 id、min、max、step。', "ui.slider('亮度', level.get(), value => level.set(value), { min: 0, max: 100, step: 5 })"),
    method('ui-progress', 'ui.progress(label, value, options)', '进度值会限制在 0 至 100；options 可设置 color。', "ui.progress('下载进度', 68, { color: '#0d6eff' })")
  ]),
  document('ui-layout', 'UI 布局与滚动', '紧凑网格、同行按钮和滚动控制', '这些辅助方法用于手环上的高密度交互。网格需控制行数，避免一次渲染过多内容。', [
    method('ui-grid', 'ui.grid(items, options)', '显示 2 至 4 列网格，最多 9 行；cell 支持 neutral、primary、success、warning、danger 色调。', "ui.grid([{ text: '1', tone: 'primary' }, { text: '2' }], { id: 'keys', columns: 2, cellHeight: 50 })"),
    method('ui-button-row', 'ui.buttonRow(buttons, options)', '同一行显示最多 4 个按钮。', "ui.buttonRow([ui.button('左', left), ui.button('右', right)], { id: 'move' })"),
    method('ui-divider', 'ui.divider()', '插入分隔线。', 'ui.divider()'),
    method('ui-spacer', 'ui.spacer(size)', '插入固定垂直间距。', 'ui.spacer(16)'),
    method('ui-scroll', 'ui.scrollTo(y) / scrollTop() / scrollBottom()', '平滑滚动到指定位置、顶部或底部。', 'ui.scrollBottom()')
  ], '状态重绘会保留当前滚动位置；返回运行页后旧交互回调会失效。')
];

const SYSTEM_API = [
  directory('api-core', '应用与路由', 'app、device、router、configuration', [
    document('api-app', 'app', '应用信息、能力判断与退出', '应用级控制模块。退出应用会立即结束当前 JSLab，会影响正在执行的脚本。', [
      method('app-info', 'app.getInfo()', '获取当前应用名称、版本等信息。', "console.log(app.getInfo().versionName)"),
      method('app-terminate', 'app.terminate()', '终止当前应用。', 'app.terminate()'),
      method('app-library', 'app.loadLibrary(name)', '加载系统库。', "app.loadLibrary('libraryName')"),
      method('app-can', 'app.canIUse()', '检查接口能力，参数为 @system.模块 或 @system.模块.方法。', "if (app.canIUse('@system.sensor.subscribeAccelerometer')) console.log('支持加速度计')")
    ]),
    document('api-device', 'device', '设备信息与存储容量', '读取设备资料；getDeviceId 和 getSerial 需要 DEVICE_INFO 权限。', [
      method('device-info', 'device.getInfo()', '读取屏幕尺寸、设备类型和屏幕形状。', "device.getInfo({ success: data => console.log(data.deviceType) })"),
      method('device-id', 'device.getDeviceId() / getSerial()', '读取设备标识或序列号，需要权限。', "device.getSerial({ success: data => console.log(data.serial) })"),
      method('device-storage', 'device.getTotalStorage() / getAvailableStorage()', '读取总存储空间或可用空间。', "device.getAvailableStorage({ success: data => console.log(data.size) })")
    ]),
    document('api-router', 'router', '应用内跳转与页面栈', 'JSLab 内部页面已注册固定路由。脚本跳转前应确保目标路径存在；不要使用未声明页面。', [
      method('router-push', 'router.push() / replace()', '压入新页面或替换当前页面。', "router.push({ uri: '/settings' })"),
      method('router-back', 'router.back() / clear()', '返回上一页或清空页面栈。', 'router.back()'),
      method('router-state', 'router.getLength() / getState() / getPages()', '读取路由栈长度、状态或页面列表。', "router.getLength({ success: data => console.log(data.length) })")
    ]),
    document('api-configuration', 'configuration', '系统语言设置', '用于读取当前系统区域设置。', [
      method('configuration-locale', 'configuration.getLocale()', '读取当前 locale。', "configuration.getLocale({ success: data => console.log(data) })")
    ])
  ]),
  directory('api-data', '数据与安全', 'storage、file、crypto', [
    document('api-storage', 'storage', '小型键值存储', '适合保存偏好、进度和少量配置。所有操作使用回调。', [
      method('storage-get', 'storage.get()', '读取 key 对应的值。', "storage.get({ key: 'theme', success: data => console.log(data) })"),
      method('storage-set', 'storage.set()', '写入 key 和 value。', "storage.set({ key: 'theme', value: 'dark' })"),
      method('storage-delete', 'storage.delete() / clear()', '删除单个 key 或清空存储。', "storage.delete({ key: 'theme' })")
    ]),
    document('api-file', 'file', '文件与目录操作', 'JSLab 脚本和文本可使用 internal://files/ URI。及时删除无用文件，避免手环存储压力。', [
      method('file-read-write', 'readText() / writeText()', '读写文本。', "file.writeText({ uri: 'internal://files/demo.txt', text: 'hello' })"),
      method('file-buffer', 'readArrayBuffer() / writeArrayBuffer()', '读写二进制数据。', "file.writeArrayBuffer({ uri: 'internal://files/data.bin', buffer: data })"),
      method('file-list', 'list() / get() / access()', '列出目录、读取元信息或检查路径存在。', "file.list({ uri: 'internal://files/', success: data => console.log(data.fileList) })"),
      method('file-mutate', 'mkdir() / rmdir() / move() / copy() / delete()', '创建、删除、移动、复制文件和目录。', "file.delete({ uri: 'internal://files/demo.txt' })")
    ]),
    document('api-crypto', 'crypto', '摘要、签名、加解密与 Base64', '敏感密钥不应直接写入脚本。hashDigest 是同步调用，其余异步方法应处理 fail。', [
      method('crypto-hash', 'hashDigest()', '同步计算 MD5、SHA1、SHA256 或 SHA512 摘要。', "const hash = crypto.hashDigest({ data: 'hello', algo: 'SHA256' })"),
      method('crypto-hmac', 'hmacDigest()', '基于密钥计算 HMAC 摘要。', "crypto.hmacDigest({ data: 'hello', key: 'secret', success: data => console.log(data.data) })"),
      method('crypto-sign', 'sign() / verify()', '生成或验证签名。', "crypto.verify({ data: 'hello', publicKey: key, signature: sign, success: ok => console.log(ok) })"),
      method('crypto-cipher', 'encrypt() / decrypt()', '使用 RSA 或 AES 加密、解密数据。', "crypto.encrypt({ data: 'hello', key: crypto.btoa('KEYKEYKEYKEYKEYK'), algo: 'AES' })"),
      method('crypto-base64', 'btoa() / atob()', 'Base64 编码或解码字符串。', "console.log(crypto.atob(crypto.btoa('hello')))" )
    ])
  ]),
  directory('api-network', '网络与同步', 'fetch、request、uploadtask、interconnect、network', [
    document('api-fetch', 'fetch', 'HTTP 请求', '发起 HTTP 请求。使用 responseType 选择响应格式，并始终处理 fail。', [
      method('fetch-fetch', 'fetch.fetch()', '发送 GET、POST 等请求。', "fetch.fetch({ url: 'https://example.com/api', responseType: 'json', success: res => console.log(res.data), fail: (data, code) => console.log(code) })")
    ]),
    document('api-request', 'request', '下载任务', '用于下载文件并接收下载完成事件。', [
      method('request-download', 'request.download()', '创建下载任务。', "request.download({ url: 'https://example.com/file', success: data => console.log(data) })"),
      method('request-complete', 'request.onDownloadComplete()', '监听下载完成。', "request.onDownloadComplete(data => console.log(data))")
    ]),
    document('api-upload', 'uploadtask', '上传文件与进度', 'uploadFile 返回 UploadTask，可中止并监听进度。', [
      method('upload-file', 'uploadtask.uploadFile()', '上传指定 URI 的文件；filePath 与 name 为必填。', "const task = uploadtask.uploadFile({ url: 'https://example.com/upload', filePath: 'internal://files/demo.txt', name: 'file' })"),
      method('upload-task', 'abort() / onProgressUpdate() / offProgressUpdate()', '中止上传、监听或移除进度监听。', 'task.onProgressUpdate(data => console.log(data.progress))')
    ]),
    document('api-interconnect', 'interconnect', '与配套端通信', 'JSLab 的 AstroBox 同步使用此能力。先从 instance() 获取连接对象，再注册事件或发送对象数据。', [
      method('interconnect-instance', 'interconnect.instance()', '获取单例连接对象。', 'const connect = interconnect.instance()'),
      method('interconnect-state', 'getReadyState() / diagnosis()', '读取连接状态或诊断连接。', "connect.getReadyState({ success: data => console.log(data.status) })"),
      method('interconnect-send', 'connect.send()', '发送对象数据给配套端。', "connect.send({ data: { type: 'hello' }, success: () => console.log('已发送') })"),
      method('interconnect-events', 'onmessage / onopen / onclose / onerror', '设置消息、连接、关闭和错误处理函数。', "connect.onmessage = data => console.log(data.data)")
    ]),
    document('api-network-info', 'network', '网络类型监听', '获取或监听网络类型。官方支持表显示手环 9 Pro 不支持此模块。', [
      method('network-type', 'getType()', '获取当前网络类型。', "network.getType({ success: data => console.log(data.type) })"),
      method('network-subscribe', 'subscribe() / unsubscribe()', '订阅或取消网络变化。', "network.subscribe({ callback: data => console.log(data.type) })")
    ], '手环 9 Pro 不支持；应以请求结果判断服务是否实际可达。')
  ]),
  directory('api-device', '设备、传感器与媒体', 'brightness、battery、geolocation、sensor、record、audio、event、prompt、vibrator', [
    document('api-brightness', 'brightness', '亮度与常亮控制', '亮度范围为 0 至 255。修改系统显示状态前应让用户明确触发。', [
      method('brightness-value', 'getValue() / setValue()', '读取或设置亮度。', "brightness.setValue({ value: 100, success: () => console.log('已设置') })"),
      method('brightness-mode', 'getMode() / setMode()', '读取或设置自动、手动亮度模式。', "brightness.setMode({ mode: 1 })"),
      method('brightness-keep', 'setKeepScreenOn()', '设置是否保持常亮。', "brightness.setKeepScreenOn({ keepScreenOn: true })")
    ]),
    document('api-battery', 'battery', '电量状态', '读取电量和充电状态。官方支持表显示手环 9 Pro 不支持。', [
      method('battery-status', 'getStatus()', '返回 level（0 到 1）与 charging。', "battery.getStatus({ success: data => console.log(data.level) })")
    ], '手环 9 Pro 不支持。'),
    document('api-location', 'geolocation', '单次定位与位置监听', '定位需要 LOCATION 权限。官方支持表显示手环 9 Pro 不支持。', [
      method('location-once', 'getLocation()', '获取一次经纬度、海拔、速度和精度。', "geolocation.getLocation({ success: data => console.log(data.latitude), fail: (data, code) => console.log(code) })"),
      method('location-watch', 'subscribe() / unsubscribe()', '订阅或取消位置变化。', "geolocation.subscribe({ callback: data => console.log(data.longitude) })")
    ], '手环 9 Pro 不支持；权限拒绝与超时都必须有替代交互。'),
    document('api-sensor', 'sensor', '压力、加速度与罗盘', '订阅高频传感器后必须在不使用时取消订阅。小米手环 9 Pro 支持压力和加速度，不支持罗盘。', [
      method('sensor-pressure', 'subscribePressure() / unsubscribePressure()', '订阅或取消压力数据。', "sensor.subscribePressure({ callback: data => console.log(data.pressure) })"),
      method('sensor-accel', 'subscribeAccelerometer() / unsubscribeAccelerometer()', '订阅加速度；interval 可为 game、ui、normal。', "sensor.subscribeAccelerometer({ interval: 'normal', callback: data => console.log(data.x) })"),
      method('sensor-compass', 'subscribeCompass() / unsubscribeCompass()', '订阅罗盘方向与精度。', "sensor.subscribeCompass({ callback: data => console.log(data.direction) })")
    ]),
    document('api-record', 'record', '音频录制', '启动录音后可停止，并通过 onframerecorded 接收音频帧。使用前应说明目的并处理设备不支持情况。', [
      method('record-start', 'record.start()', '开始录音。', "record.start({ success: () => console.log('开始录音') })"),
      method('record-stop', 'record.stop()', '停止录音。', 'record.stop()'),
      method('record-frame', 'record.onframerecorded', '设置音频帧回调。', 'record.onframerecorded = data => console.log(data)')
    ]),
    document('api-audio', 'audio', '音频播放控制', '控制音频播放、暂停、停止和状态读取。', [
      method('audio-control', 'play() / pause() / stop()', '开始、暂停或停止播放。', 'audio.play()'),
      method('audio-state', 'getPlayState()', '读取当前播放状态。', "audio.getPlayState({ success: data => console.log(data) })")
    ]),
    document('api-event', 'event', '应用内事件总线', '使用明确的事件名，并在页面或脚本逻辑结束后取消订阅。', [
      method('event-publish', 'event.publish()', '发布事件和数据。', "event.publish({ type: 'scoreChanged', data: { score: 10 } })"),
      method('event-subscribe', 'event.subscribe() / unsubscribe()', '订阅或取消事件。', "event.subscribe({ type: 'scoreChanged', callback: data => console.log(data) })")
    ]),
    document('api-feedback', 'prompt 与 vibrator', '提示与触觉反馈', '用于轻量操作反馈，避免连续、高频触发震动。', [
      method('prompt-toast', 'prompt.showToast()', '显示短提示。', "prompt.showToast({ message: '保存成功', duration: 1500 })"),
      method('vibrator-basic', 'vibrate() / start() / stop() / getSystemDefaultMode()', '短震动、连续震动、停止及默认模式查询。', "vibrator.vibrate({ mode: 'short' })")
    ])
  ])
];

export const HELP_ROOT = [
  directory('tutorials', '使用教程', '从新建脚本到系统能力', TUTORIALS),
  directory('ui-api', 'UI 模式 API', '完整的 ui.render 交互接口', UI_API),
  directory('system-api', '系统 API 文档', 'JSLab 注入的全部原生模块', SYSTEM_API)
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
