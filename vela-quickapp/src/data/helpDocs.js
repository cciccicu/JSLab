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
  document('guide-home', '认识首页', '找到脚本、市场、云空间和设置', '首页显示保存在这台设备上的脚本。点一下文件可以选中它，再点同一文件可以取消选择。底部按钮会随选择状态变化。', [
    method('home-browse', '没有选中文件时', '底部从左到右是 JS 市场、云空间和新建脚本。右上角的更多按钮进入设置。'),
    method('home-selected', '选中文件以后', '底部从左到右是运行、上传到云空间、编辑和删除。直接运行会使用已经保存的文件内容。'),
    method('home-offline', '离线也能使用', '新建、编辑和运行本地脚本不需要云账户。脚本自己使用网络或设备功能时，需要满足对应条件。')
  ]),
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
const WATCH_GUIDE = [
  document('guide-files', '管理本地脚本', '选择、另存为、删除和备份', '本地脚本保存在当前设备。云空间文件和市场作品是另外的副本，不会随着本地编辑自动变化。', [
    method('files-copy', '另存为一份副本', '打开脚本编辑器，点右上角菜单，选择“另存为”，输入新的文件名。修改重要脚本前可以先留一份副本。'),
    method('files-backup', '备份与传输', '选中文件后上传到云空间，或使用 AstroBox 插件、Android 同步器下载到手机。同步器还可重命名文件；重命名会迁移该脚本的数据和配置。'),
    method('files-remove', '删除脚本', '首页选中文件，点击删除并确认。删除时会同时清除这个脚本的数据和配置；需要保留时请先备份。'),
    method('files-large', '打开较大的脚本', '超过 48 KiB 时，进入编辑器前会出现提醒，确认后仍可继续。它不是源码长度上限；大文件在小屏设备上可能较慢，可改用手机编辑。')
  ]),
  document('guide-editor', '编辑器与设置', '输入代码、调整显示和清除记录', '点击代码区域打开输入法。返回操作会先收起键盘或光标控制，再处理是否离开编辑器。', [
    method('editor-save', '保存与运行', '收起键盘后使用底部保存、运行按钮。运行不会自动保存；退出时可选择保存、不保存或继续编辑。'),
    method('editor-style', '字号与语法高亮', '在“设置 > 编辑器设置”调整字号。进入“语法高亮”可选择开关、字符阈值、行数阈值和配色。阈值只影响彩色代码显示，不限制脚本长度。'),
    method('editor-font', '字体入口', '当前字体更换尚未开放，入口显示“即将上线”。字号设置可以正常使用。'),
    method('editor-reset', '清除数据或配置', '编辑器右上角菜单可分别清除当前脚本的数据和配置，确认后生效。这个操作不会删除或改写脚本代码。')
  ]),
  document('guide-troubleshooting', '遇到问题时', '先确认保存、连接和设备支持', '先查看页面提示；脚本运行出错时，从界面返回到日志页阅读错误信息。', [
    method('trouble-save', '修改没有保留下来', '运行和保存是两件事。先保存，再离开编辑器；从另一端传来的文件还需要主动上传或下载。'),
    method('trouble-network', '云端或市场无法连接', '到“设置 > 传输方式”检查当前选择。使用网络桥接时，保持配套端打开且设备连接正常。社区版还需检查“云账户”中的服务器。'),
    method('trouble-pair', '配对或授权异常', '配对码过期后重新生成。网页确认后，还要等设备显示配对完成。设备授权被撤销时需要重新配对。'),
    method('trouble-display', '界面卡顿或设备功能不可用', '减少一次显示的内容和刷新频率。不同型号支持的设备功能不同；查看“设备接口参考”的调用说明，处理不支持或调用失败的情况。')
  ])
];
const SCRIPT_API = [
  document('api-script-core', '脚本基础与运行控制', '脚本信息、异步操作与退出', '脚本可直接使用 console、ui、dialog、script 和 system，不需要导入，也不用编写页面模板。脚本中不使用 import 或 require。', [
    method('script-info', 'script.name', '读取当前脚本的文件名。', 'console.log(script.name)'),
    method('script-capability', 'script.canUse(capability)', '检查设备是否支持某项系统功能。', "if (script.canUse('@system.sensor.subscribeAccelerometer')) {\n  console.log('支持加速度计')\n}"),
    method('script-locale', 'script.locale()', '读取设备的语言和地区信息。', 'console.log(script.locale())'),
    method('script-reload', 'script.reload()', '重新运行这次打开时的代码，包括从编辑器运行时尚未保存的修改。', 'script.reload()'),
    method('script-exit', 'script.exit()', '离开运行页。脚本启动的录音、传感器监听等任务，应在不再使用时主动停止。', 'script.exit()'),
    method('script-toast', 'script.toast(message, duration)', '在屏幕上显示短暂提示；可设置 1500 至 10000 毫秒。', "script.toast('已保存')")
  ], '需要等待异步操作时，把代码放进 async 函数，并在脚本末尾写 return main()；不能直接在最外层使用 await。'),
  document('api-console', '输出与查看日志', '使用 console 检查程序', '日志页显示脚本的输出。切换到界面后，日志仍会保留；日志不会自动保存为文件。', [
    method('console-output', 'log / info / warn / error', '可以输出多个值。error 用于标记错误消息，不会让脚本自动退出。', "console.log('结果', 42)"),
    method('console-clear', 'console.clear()', '清空本次运行的日志。', 'console.clear()')
  ], '日志最多保留最近 64 条。记录较多时，最早的内容会被移除。'),
  document('api-script-data', '保存脚本数据', 'script.data 与 script.config', '用 script.data 保存脚本产生的数据，用 script.config 保存设置。两者的用法相同，数据分别保存；不同文件名的脚本也互不共用。', [
    method('script-store-get', 'get(key, fallback)', '读取一个值；没有保存过时返回给定的默认值。', "script.data.get('count', 0).then(value => console.log(value))"),
    method('script-store-set', 'set(key, value)', '保存字符串、数字、布尔值或可序列化的对象。', "script.config.set('unit', 'metric')"),
    method('script-store-manage', 'delete / clear / all', '删除一个键、清空全部数据，或读取全部内容。', "script.data.delete('count')")
  ], '这些方法返回 Promise。单个值和 data/config 存储区不设固定字节上限，实际容量受设备内存和可用存储空间影响。编辑器菜单可以分别清除当前脚本的数据或配置；重命名脚本时两者会迁移，删除脚本时会一并删除。'),
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
    method('ui-width', 'ui.getWidth()', '同步返回根内容区可用宽度：Pro 324px，RW 372px；不含屏幕安全边距，不是嵌套容器宽度。兼容旧客户端时先检查方法是否存在。', "const width = typeof ui.getWidth === 'function' ? ui.getWidth() : 324;"),
    method('ui-text', 'heading / text', '显示标题或正文。可设置 size、color、bold、align、lines 和 lineHeight。', "ui.text('正文', { color: '#ffffff', lines: 2 })"),
    method('ui-action', 'button / buttonRow', '创建单个按钮或一排按钮。background 设置底色，color 设置文字色；disabled: true 可禁用按钮。', "ui.button('保存', () => script.toast('已保存'), {\n  id: 'save', background: '#0d6eff', color: '#fff'\n})"),
    method('ui-input', 'switch / slider', '创建开关或滑块。回调会收到新值；可用 accent、trackColor、thumbColor 调整颜色。', "ui.switch('启用', true, value => {\n  console.log('当前状态', value)\n}, { id: 'enabled' })"),
    method('ui-display', 'progress / grid', 'progress 显示进度；grid 以 2 至 4 列展示信息，格子不能直接点击。', "ui.progress('下载', 68, { accent: '#0d6eff' })\nui.grid([{ text: 'A' }, { text: 'B' }], { columns: 2 })"),
    method('ui-qr', 'ui.qrcode(value, options)', '显示二维码。size 可设为 96 至 288 像素；建议使用短网址并保持黑白对比。', "ui.qrcode('https://ccicc.icu', { size: 180 })"),
    method('ui-layout', 'divider / spacer', '添加分隔线或留出纵向空白。', "ui.divider({ color: '#666666' })\nui.spacer(16)")
  ], '交互组件建议设置唯一且稳定的 id。组件数量、布局层数和二维码数量没有额外上限。手环性能参考值为约 40 个组件、160 个绘制节点、4 层布局、2 个二维码；较大的界面建议分批显示并降低更新频率。'),
  document('api-ui-images', '显示图片', '图片地址与 Base64 小图标', '用 ui.image 显示图片。下面的完整示例会显示一个橙色小方块，可以直接作为脚本运行，无需准备图片文件。', [
    method('ui-image', 'ui.image(source, options)', 'Base64 把图片编码写在脚本里，适合小图标。这里用 format 指定 PNG 格式，用 width 和 height 设置显示尺寸。', "const png =\n  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' +\n  'CAYAAAAfFcSJAAAADUlEQVR4AWP438DwHwAGgAJ/' +\n  '4jyYEwAAAABJRU5ErkJggg=='\nui.render(ui.image(png, {\n  format: 'png', width: 32, height: 32\n}))"),
    method('ui-image-source', '使用自己的图片', '已有图片时，把 source 换成本地文件地址或网络地址。直接传地址不需要 format；本地文件要先准备好。'),
    method('ui-image-base64', 'Base64 与格式', '完整图片数据地址以 data:image/png;base64, 或 data:image/jpeg;base64, 开头，已包含格式。只有编码内容时，设置 format 为 png、jpg 或 jpeg。', '', 'Base64 图片目前支持 PNG/JPG。加载完成后自动更新界面，相同内容会复用缓存。'),
    method('ui-image-size', '设置大小与缩放', 'width 支持像素或百分比，height 使用像素。省略 width 时填满父容器；省略 height 时预留正方形。小图标建议明确设置宽高。', '', 'fit 默认 contain，完整显示；cover 铺满并裁剪；none 不缩放；scale-down 只缩小。')
  ]),
  document('api-ui-canvas', '绘制画布', '创建、绘图、提交与像素操作', '用 ui.canvas 绘制简单图形，再把画布放入界面。下面的代码块都是完整脚本，可以单独运行。', [
    method('ui-canvas', '创建并显示画布', '在渲染函数外创建一次。绘图先保存在内存中；等待 submit 成功，再调用 ui.refresh 显示。', "const canvas = ui.canvas({\n  pixelWidth: 160, pixelHeight: 96,\n  width: '100%'\n})\nui.render(canvas)\ncanvas.clear('#181818')\ncanvas.rect(20, 20, 80, 50, { color: '#ff6600' })\nreturn canvas.submit().then(() => ui.refresh())"),
    method('ui-canvas-shapes', 'clear / rect / circle / line', 'clear 清屏；rect 依次传入 x、y、宽、高；circle 传入圆心 x、y、半径；line 传入两端的 x、y。坐标从左上角开始。', '', '形状最后可传 color、lineWidth；rect/circle 的 fill 默认 true，设为 false 只画边框。'),
    method('ui-canvas-submit', 'canvas.submit()', '绘图后等待提交完成，再刷新界面。未提交的像素不会显示；提交失败时保留上一幅画面。', '', '提交成功表示图片已写入，还需要原生组件加载显示。建议按需绘制，避免频繁提交。'),
    method('ui-canvas-size', '像素尺寸与显示尺寸', 'pixelWidth/pixelHeight 决定绘图分辨率，创建后只读，建议从 160×96 开始。width/height 控制显示大小，省略 height 时等比例缩放。', '', '显示 width 支持百分比。放大显示不会增加像素数量。'),
    method('ui-canvas-layout', '调整布局', '直接修改画布的布局属性，再调用 ui.refresh。可用 id、width、height、background、radius、x/y、flex 和 fit。', '', 'id 必须全页唯一，x/y 只在 stack 中生效。background/radius 只改变外观，fit 用法与图片相同。'),
    method('ui-canvas-reuse', '复用同一画布', '把同一个 canvas 放入渲染函数并反复使用。不要通过展开、Object.assign 或 JSON 复制它；复制品无法作为画布显示。'),
    method('ui-canvas-pixel', 'canvas.setPixel / getPixel', 'setPixel 写入一个像素，可用颜色字符串或 [r,g,b,a] 数组。getPixel 读出的数组可以直接写入另一个位置。', "const canvas = ui.canvas({\n  pixelWidth: 16, pixelHeight: 16, width: 160\n})\ncanvas.setPixel(4, 4, [255, 128, 0, 255])\ncanvas.setPixel(5, 4, canvas.getPixel(4, 4))\nui.render(canvas)\nreturn canvas.submit().then(() => ui.refresh())", '数组恰好四项，均为 0–255 整数；第四项是透明度，255 表示不透明。之后修改数组不会自动改变画布。'),
    method('ui-canvas-colors', '颜色与输入错误', '只有 setPixel 接受数组。其他绘图方法使用 #RGB、#RRGGBB、rgb() 或 rgba() 颜色字符串；rgba() 的透明度仍为 0–1。', '', '绘图颜色或 RGBA 数组无效时抛错并保留原像素；组件外观颜色无效时使用默认值。越界绘图会裁剪，越界读取像素会报错。')
  ], '旧脚本省略两个 pixel 参数时，width/height 仍同时定义像素与显示尺寸，并保持只读；width 默认使用根内容宽。新脚本建议分别设置像素尺寸和显示尺寸。')
];

const SYSTEM_API = [
  document('system-overview', '调用设备接口之前', '能力检查、回调与资源释放', 'JSLab 通过 system 提供设备接口。它们沿用小米接口的参数，但名称可能不同，例如 system.files 对应小米的 file。无需照搬官方文档中的模块导入或工程配置。', [
    method('system-check', '先检查设备是否支持', 'script.canUse 使用小米原始接口名，例如 @system.sensor.subscribeAccelerometer。不同设备和系统版本可能有差异，检查通过后仍应处理调用失败。'),
    method('system-callback', '在回调中取得结果', '一次请求通常使用 success、fail；持续监听通常使用 callback。不要假设每个系统方法都返回 Promise。摘要等同步方法则直接返回结果。'),
    method('system-cleanup', '停止不再需要的任务', '传感器监听、录音、音频等应提供停止操作。切回日志或退出运行页不等于所有原生任务都会停止；不要依赖不存在的 script.onDispose。'),
    method('system-native-network', '脚本网络与云服务的区别', '设置中的网络桥接用于 JSLab 云服务。脚本调用 system.http.request 不会自动通过同步器转发。')
  ]),
  directory('system-device', '设备与文件', '设备信息、文件与屏幕', [
    document('system-device-api', '设备信息与容量', '使用 system.device 查询', '读取设备信息、设备标识和存储容量。可获取的字段因设备和权限而异。', [
      method('system-device-info', 'getInfo', '读取设备类型等信息。', "system.device.getInfo({\n  success: data => console.log(data.deviceType),\n  fail: () => script.toast('无法读取设备信息')\n})"),
      method('system-device-storage', 'getTotalStorage / getAvailableStorage', '读取总容量或剩余容量，单位是字节。结果字段分别为 totalStorage 和 availableStorage。', "system.device.getAvailableStorage({\n  success: data => console.log(data.availableStorage),\n  fail: (data, code) => console.error('读取失败', code)\n})")
    ]),
    document('system-files-api', '读取和管理文件', '使用 system.files 操作文件', '脚本可操作 internal://files/ 中的文件。这是 JSLab 共享的应用目录，请给自己的文件取明确的名字，不要覆盖其他脚本和应用数据。', [
      method('system-files-text', 'readText / writeText', '读取或写入文本文件。', "system.files.writeText({\n  uri: 'internal://files/note.txt', text: 'hello'\n})"),
      method('system-files-manage', 'list / get / access / mkdir / rmdir / move / copy / delete', '查看目录、检查文件，或管理文件与文件夹。', "system.files.list({\n  uri: 'internal://files/',\n  success: data => console.log(data.fileList.length)\n})")
    ]),
    document('system-display-api', '屏幕亮度与常亮', '使用 system.display 控制屏幕', '读取或调整屏幕亮度，也可以让屏幕保持点亮。修改设备设置前，请让用户主动选择；使用结束后恢复设置或解除常亮。', [
      method('system-display-value', 'getValue / setValue', '读取或设置亮度，数值范围为 0 至 255。', 'system.display.setValue({ value: 100 })'),
      method('system-display-keep', 'getMode / setMode / setKeepScreenOn', '读取或设置显示模式及常亮状态。', 'system.display.setKeepScreenOn({ keepScreenOn: true })')
    ]),
    document('system-battery-api', '电量与充电状态', '使用 system.battery 读取', '部分设备不支持电池接口。调用前先检查是否可用，并处理读取失败的情况。', [
      method('system-battery-status', 'getStatus', '读取电量比例和充电状态。电量值为 0 至 1。', "if (script.canUse('@system.battery.getStatus')) {\n  system.battery.getStatus({\n    success: data => console.log(data.level, data.charging),\n    fail: () => script.toast('无法读取电量')\n  })\n}")
    ])
  ]),
  directory('system-network', '网络与配套端', '网络请求、传输与连接', [
    document('system-http-api', '发送网络请求', '使用 system.http 请求数据', '请求完成后分别在 success 或 fail 中处理结果。成功回调中还需检查 res.code，再使用 res.data。示例网址需要换成自己的接口。', [
      method('system-http-request', 'request(options)', '发送 HTTP 请求并处理响应。', "system.http.request({\n  url: 'https://example.com/api',\n  responseType: 'json',\n  success: res => console.log(res.data),\n  fail: (data, code) => console.error('请求失败', code)\n})")
    ]),
    document('system-network-state', '网络连接状态', '读取网络类型或监听变化', 'system.network 提供网络类型。返回 wifi、bluetooth 等类型并不保证目标网站可访问；最终要以请求结果为准。', [
      method('system-network-info', 'getType / subscribe / unsubscribe', 'getType 的 success 和 subscribe 的 callback 都返回含 type 的对象。用完监听后调用 unsubscribe()。', "if (script.canUse('@system.network.getType')) {\n  system.network.getType({\n    success: data => console.log(data.type),\n    fail: (data, code) => console.error('读取失败', code)\n  })\n}")
    ]),
    document('system-transfer-api', '下载和上传文件', '下载任务与上传进度', 'system.download 下载时先取得 token，再等待完成后的文件地址；system.upload 创建上传任务，可取消或监听进度。示例地址需要换成自己的服务器。', [
      method('system-download', 'download.start / download.wait', '下载文件并读取保存位置。', "system.download.start({\n  url: 'https://example.com/file',\n  success: task => system.download.wait({\n    token: task.token,\n    success: data => console.log(data.uri)\n  })\n})"),
      method('system-upload', 'upload.file', '上传本地文件并取得上传任务。', "const task = system.upload.file({\n  url: 'https://example.com/upload',\n  filePath: 'internal://files/note.txt',\n  name: 'file'\n})")
    ]),
    document('system-companion-api', '与配套应用通信', '使用 system.companion 查询连接', '设备支持配套端连接时，可读取连接状态并发送约定的数据。JSLab 正在使用同一个连接处理同步，请不要直接覆盖接收回调。', [
      method('system-companion-instance', 'instance()', '取得配套端连接对象。', 'const connection = system.companion.instance()'),
      method('system-companion-operations', 'getReadyState / diagnosis / send', '检查连接、诊断问题或发送数据。', "const connection = system.companion.instance()\nconnection.send({ data: { type: 'hello' } })")
    ])
  ]),
  directory('system-hardware', '传感器与媒体', '震动、定位与音频', [
    document('system-feedback-api', '振动反馈', '使用 system.vibration 提示', '可以发出短振动或长振动。避免在高频循环中反复振动。', [
      method('system-vibrate', 'vibrate({ mode })', 'mode 可设为 short 或 long。', "system.vibration.vibrate({ mode: 'short' })")
    ]),
    document('system-sensors-api', '传感器与定位', '加速度、气压、方向与位置', '设备提供的能力可能不同。订阅变化后，脚本应在不再需要时取消订阅。', [
      method('system-sensor', '订阅与停止传感器', 'subscribeAccelerometer、subscribePressure 和 subscribeCompass 分别监听加速度、气压和罗盘。停止时调用相应的 unsubscribe 方法。', "if (script.canUse('@system.sensor.subscribeAccelerometer')) {\n  system.sensors.subscribeAccelerometer({\n    interval: 'normal',\n    callback: data => {\n      console.log(data.x, data.y, data.z)\n      system.sensors.unsubscribeAccelerometer()\n    },\n    fail: (data, code) => console.error('订阅失败', code)\n  })\n}"),
      method('system-location', 'location.getLocation / subscribe / unsubscribe', '读取位置或持续监听位置变化；定位需要设备支持和授权。', "if (script.canUse('@system.geolocation.getLocation')) {\n  system.location.getLocation({\n    success: data => console.log(data.latitude),\n    fail: (data, code) => console.error('定位失败', code)\n  })\n}")
    ]),
    document('system-media-api', '音频与录音', '播放音频、录制声音和停止任务', '播放和录音可能在脚本界面切换后继续运行。先检查设备支持，用完后请停止。', [
      method('system-audio', 'audio.play / pause / stop / getPlayState', '播放、暂停、停止音频，或读取播放状态。', 'system.audio.stop()'),
      method('system-recorder', 'recorder.start / stop / onframerecorded', 'start 可设置 duration，单位为毫秒，用来限制录音时长。success 在录音完成时返回；stop 主动结束录音。', 'system.recorder.stop()')
    ])
  ]),
  directory('system-utilities', '事件与编码', '公共事件、摘要和 Base64', [
    document('system-events-api', '公共事件', '订阅、发送与取消事件', 'system.events 对应小米公共事件接口。事件可能来自其他应用，不是脚本之间私有的消息通道。', [
      method('system-events', 'subscribe / unsubscribe', '订阅时保存返回的数字 ID；失败时可能返回 undefined。取消时传入 { id }，不要用真假判断遗漏 ID 为 0 的情况。', "const id = system.events.subscribe({\n  eventName: 'usual.event.BATTERY_CHANGED',\n  callback: event => console.log(event.params)\n})\nif (id !== undefined) system.events.unsubscribe({ id })", '调用前检查 @system.event.subscribe 是否受支持。示例只演示订阅与取消，应把取消操作放在实际结束位置。'),
      method('system-events-publish', 'publish', '自定义事件通过 eventName 命名，数据放在 options.params 中。不要使用 usual.event 等系统保留名称。')
    ]),
    document('system-crypto-api', '摘要与编码', '使用 system.crypto 处理内容', '可计算摘要、加解密或进行 Base64 编码。先检查设备支持；Base64 不是加密，涉及密钥时不要直接把密钥写进公开脚本。', [
      method('system-crypto-hash', 'hashDigest', '计算数据摘要。', "const digest = system.crypto.hashDigest({\n  data: 'hello', algo: 'SHA256'\n})"),
      method('system-crypto-codec', 'btoa / atob', '进行 Base64 编码或解码。', "const encoded = system.crypto.btoa('hello')\nconsole.log(system.crypto.atob(encoded))")
    ])
  ])
];

const CLOUD = document('guide-cloud', '连接云账户与云空间', '配对、激活、上传和下载', '云空间用于在网页和设备之间保存、传输脚本。需要先配对设备，再在网页端激活；本地使用 JSLab 不需要激活。', [
  method('cloud-pair', '配对设备', '在手环的云账户页点击“生成配对二维码”，用手机扫描后登录网页并确认。也可以在网页云空间的设备管理中输入配对码。', '设置 > 云账户 > 生成配对二维码'),
  method('cloud-activate', '激活与查看余额', '在网页云空间的“充值与激活”兑换激活码，再回到设备云账户页刷新状态。市场浏览、下载和已配对设备的发布无需激活。'),
  method('cloud-files', '上传与下载', '在首页选中本地脚本后，点击底部上传按钮；点击首页云朵进入云空间，选中文件后可下载到本地。文件不会自动同步；同名覆盖前先确认要保留哪一份。'),
  method('cloud-server', '社区版选择服务器', '首次进入联网页面时选择官方或第三方服务器，也可在“设置 > 云账户”更换。更换后需要在新服务器重新配对，原服务器的文件和额度不会自动迁移。')
]);

const COMPANION_GUIDE = document('guide-sync', '使用手机与配套端同步', '传输源码、编辑数据和网络桥接', 'AstroBox 的 JSLab Sync 插件和 Android 同步器可以管理设备里的脚本。源码传输不需要激活云空间。', [
  method('sync-connect', '保持设备与配套端连接', '在配套端完成设备连接，打开 JSLab，并等待连接成功。Android 同步器依赖小米运动健康的设备连接和授权；AstroBox 插件使用 AstroBox 中的已连接设备。'),
  method('sync-files', '编辑与传输文件', '在配套端读取、新建、编辑或导入脚本，再主动保存到设备。下载或导出可以保存一份备份；同名覆盖前先检查设备上的修改。'),
  method('sync-storage', '编辑脚本数据', '新版同步器可编辑脚本保存的数据和配置，需要设备端也支持。出现数据已变化的提示时，先导出修改，再重新读取，避免覆盖脚本刚保存的记录。'),
  method('sync-network', '选择云服务传输方式', '在“设置 > 传输方式”选择 fetch 直连或 JSLabSync 网络桥接。桥接时需要配套端保持打开并启用云转发；它只处理 JSLab 的云服务请求。')
]);

const AI_GUIDE = document('guide-ai', '使用 AI 编写和改写', '描述需求、生成、检查和保存', '先配对设备，在网页端激活 AI，并确认 JSLab 额度充足。然后打开一个脚本，在编辑器右上角菜单选择 AI 生成。', [
  method('ai-mode', '选择生成方式', '新建方式根据需求生成代码；改写方式还会使用当前编辑器内容。生成结果会放入当前编辑器，建议先保存或另存为需要保留的原代码。'),
  method('ai-prompt', '写清楚需求', '说明用途、按钮怎样操作、是否联网、是否保存记录。例如：做一个离线计数器，有加一和清零按钮，关闭后保留计数。'),
  method('ai-review', '检查并保存结果', '生成后先阅读、运行并查看日志，确认符合预期再保存。AI 生成不会替你完成设备上的效果验证；费用从 JSLab 额度扣除。')
]);

const MARKET_GUIDE = document('guide-market', '浏览与发布市场作品', '下载、点赞、提交和更新', '市场浏览和下载无需配对或激活。点赞和发布需要设备配对，但不要求激活云空间。', [
  method('cloud-market', '发布到 JS 市场', '先在“设置 > 云账户”完成设备配对，无需激活云空间。打开 JS 市场，点击右上角上传按钮，选择本地脚本，填写名称和用途说明，并选择已验证适配的设备。选脚本和填写资料不需要联网，确认提交后才上传审核；审核通过才会公开。'),
  method('cloud-download', '下载市场脚本', '在市场中点击脚本，输入本地文件名并确认后才会下载；默认文件名可修改。若本地已有同名文件，会先询问是否覆盖。'),
  method('market-like', '点赞与取消点赞', '完成设备配对后，在作品详情页右上角可以点赞，再次点击取消。网页和已配对设备使用同一账户的点赞状态。'),
  method('market-update', '更新已发布作品', '在网页的“我的发布”中修改并重新提交审核。修改本地或云空间文件不会自动更新市场作品；删除云文件也不会撤下作品。')
]);

const EXPORT_GUIDE = document('guide-rpk', '把脚本做成独立应用', '在网页云空间导出安装包', '独立应用可以直接从设备的应用列表启动，不需要先打开 JSLab。打包操作在网页云空间完成。', [
  method('rpk-prepare', '先保存到云空间', '将要打包的脚本上传到云空间，并确认云端代码是需要的版本。'),
  method('rpk-export', '在网页填写应用信息', '点击文件旁的“打包为 RPK”，选择目标设备，填写名称和版本等信息，再打包并下载安装包。此功能需要激活云空间并有足够额度。'),
  method('rpk-data', '保留签名和数据备份', '下载并妥善保存生成的签名，以便以后更新同一应用。独立应用使用自己的存储，不会自动带走 JSLab 中已有的脚本数据。')
]);

export const HELP_ROOT = [
  directory('getting-started', '开始使用', '新建脚本、运行并查看结果', START),
  directory('watch-guide', '手环使用指南', '管理文件、调整编辑器和处理问题', WATCH_GUIDE),
  directory('tools-support', '云端与同步', '连接账户、传输脚本和使用 AI', [CLOUD, COMPANION_GUIDE, AI_GUIDE]),
  directory('sharing', '分享与导出', '发布市场作品和制作独立应用', [MARKET_GUIDE, EXPORT_GUIDE]),
  directory('script-api', '编写脚本', '脚本基础、保存数据、对话框和界面', SCRIPT_API.concat([directory('ui-api', '制作界面', '布局、组件和状态更新', UI_API)])),
  directory('system-api', '设备接口参考', '查询文件、网络、传感器等接口', SYSTEM_API)
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
