# JSLab UI API v2

所有 `.js` 脚本都可以通过 `ui.render()` 描述界面；`.ui.js` 没有特殊含义。Pro 布局为 336×480，内容宽 324px；RW 布局为 432×514，内容宽 372px。通过 `ui.getWidth()` 获取当前内容宽度，不必为两种设备分别编写脚本。
新建脚本里的“布局与二维码”模板可以直接运行。[类型声明](../../types/ui-api.d.ts)可用于桌面编辑器补全。

```js
const count = ui.signal(0);
ui.render(() => ui.column([
  ui.row([
    ui.text('计数', { lines: 1 }),
    ui.text(count.get(), { lines: 1, align: 'right' })
  ]),
  ui.button('增加', () => count.update(n => n + 1), {
    id: 'add', background: '#176b45', color: '#fff'
  })
], { padding: 12, gap: 12, background: '#24262a', radius: 24 }));
```

## 布局

| 写法 | 作用 |
| --- | --- |
| `ui.row(children, options)` | 横向排列，未指定宽度的子项按 `flex` 分配剩余宽度，默认等分 |
| `ui.column(children, options)` | 纵向排列，默认子项填满父宽 |
| `ui.stack(children, options)` | 叠放，后项在上；子项可设置 `x/y/width` |
| `ui.render([a, b])` | 根节点纵向排列，间距 10px |

布局可以嵌套；`null`、`undefined`、`false` 不占位置，适合 `condition && ui.text(...)`。
布局描述在 JS 中展开为浅层绘制节点，没有递归原生组件实例。无背景的布局容器不产生原生节点。

| 参数 | 规则 |
| --- | --- |
| `width` | 像素或百分比，例如 `120`、`'50%'`，不超过父内容宽；默认满宽，row 中默认分配剩余空间 |
| `height` | 像素；容器不会压缩子内容，叶子会按高度裁剪；默认按内容计算 |
| `gap` | 容器子项间距，0–48，默认 8；grid/buttonRow 默认 6 |
| `padding` | 容器统一内边距，0–48，自动限制到可用宽度内 |
| `align` | 容器交叉轴对齐：`start/center/end`；row 控制垂直，column 控制水平 |
| `justify` | row/column 主轴剩余空间：`start/center/end/between`；column 需设置更大的 height 才有剩余空间 |
| `flex` | row 子项未指定 width 时的宽度权重，0.1–100，默认 1 |
| `background` / `radius` | 背景色 / 圆角 0–80；容器背景只增加一个绘制节点 |
| `x/y` | 仅 stack 子项，原点为父容器 padding 内侧；x 限制在父宽内，y 为 0–4096 |

row 不自动换行，`width`、`gap` 总和超出父宽会报错。百分比基于父内容宽，**不扣除 gap**；等分优先省略 width。
grid 格子或 row 子项分配宽度不足 1px 时也会报错，请调整间距、列数或 flex 比例。
容器最小高度为内容所需高度；文本、按钮等叶子固定高度不足时会裁剪。
stack 的子项默认满宽，向右移动时同时设置较小的 width。整个 stack 随页面滚动。
按钮同样支持这种坐标布局：把 `ui.button` 直接放入 `ui.stack`，设置 `x/y/width/height` 即可。
`x/y` 相对于 stack 的内容区，按钮最小高度仍为 48px；重叠时后面的节点在上，需自行预留点击区域。

```js
ui.row([
  ui.text('固定宽', { width: 100, lines: 1 }),
  ui.column([
    ui.text('右侧第一行', { lines: 1 }),
    ui.text('右侧第二行', { lines: 1 })
  ])
], { gap: 8, align: 'center' });

ui.stack([
  ui.text('内容', { lines: 1 }),
  ui.text('状态', { width: 64, x: 250, y: 4, lines: 1, color: '#0f0' })
], { height: 80 });

// 自由定位按钮；新建模板“UI 2048 游戏”使用这一方式摆放十字方向键。
ui.stack([
  ui.button('↑', () => move('up'), { id: 'up', x: 122, y: 0, width: 80, height: 50, lines: 1 }),
  ui.button('←', () => move('left'), { id: 'left', x: 36, y: 53, width: 80, height: 50, lines: 1 }),
  ui.button('→', () => move('right'), { id: 'right', x: 208, y: 53, width: 80, height: 50, lines: 1 }),
  ui.button('↓', () => move('down'), { id: 'down', x: 122, y: 106, width: 80, height: 50, lines: 1 })
], { height: 156 });
```

## 组件与配色

UI v2 提供二维码，并兼容扩展图片和内存画布；原有交互仍是按钮点击、switch/slider 值变化。
按钮支持 `disabled`；不提供 busy、手势、运行菜单或生命周期登记 API。

| 组件 | 常用参数 |
| --- | --- |
| `heading(text, options)` / `text(text, options)` | `size` 16–36、`color`、`align: left/center/right`、`bold`、`lines` 1–64、`lineHeight`（字号至 64） |
| `button(text, onPress, options)` | `background`、`color`、`tone: primary/neutral/danger`、`id`、`disabled`；最小高度 48 |
| `switch(label, checked, onChange, options)` | `color` 标题、`background`、`accent` 滑轨、`thumbColor`、`detail`、`detailColor`；最小宽 160 |
| `slider(label, value, onChange, options)` | `color/background/accent/trackColor/thumbColor`、`min/max/step`；最小宽 160 |
| `progress(label, percent, options)` | `accent` 进度、`trackColor` 轨道、`color` 标题、`background`；未指定 accent 时，旧 color 仍控制进度色；最小宽 160 |
| `grid(items, options)` | 2–4 列、行数不限，`columns/cellHeight/gap`；格子支持 `text/tone/color/background/size`，只展示 |
| `buttonRow(buttons, options)` | 按可用宽度排列按钮，按钮文本不按字符数截断；子按钮 id、color、background 有效 |
| `divider(options)` / `spacer(size)` | 分隔线 `color/height`，或 0–480px 间距 |
| `qrcode(value, options)` | 内容不能为空，无固定字符上限，实际容量取决于原生组件；`size` 96–288 默认 160，含四周 8px 空白；`color/background` 默认黑白 |
| `image(source, options)` | 本地/网络 URI、PNG/JPG Base64 Data URI；裸 Base64 需 `format`；`width/height/fit` 控制显示 |
| `canvas(options)` | 绑定内存画布的组件；`pixelWidth/pixelHeight` 为像素分辨率，`width/height` 为布局尺寸；通过绘图方法修改、`submit()` 提交 |

除 spacer 外，叶子可设置 `width/height/background/radius`（二维码始终正方形，用 size 控制）。
二维码建议短 URL、黑白对比、160px 以上；数量不限，值不变时不会反复提交更新。多个二维码会增加原生绘制开销。
推荐不透明颜色 `#RGB`、`#RRGGBB`、`rgb(r,g,b)`；兼容有效 rgba。无 opacity。
组件外观颜色无效时回退默认值；Canvas 绘图方法的颜色无效时抛错，不使用默认颜色替代。`disabled:true` 显示禁用样式并排除按钮回调。异步任务仍在回调检查业务 busy，防止确认状态发布前重复提交。

文本的 `lines` 是高度预算与最大行数，过长内容省略。省略 lines 时，按字号、字符数、显式换行保守估算，
ASCII 文本可能多留空白；精确面板推荐 `lines: 1` 或显式多行预算。内部仍由原生 text 负责断行。
未绑定字体测量或每轮原生尺寸查询，以保持低开销。中文长文应分页。

## 状态、事件与更新

- `ui.render(viewOrFactory)` 立即编译，成功提交后显示 UI，返回 boolean；factory 必须是纯函数。失败保留先前成功的定义和界面。
- `signal.set/update` 立即改变值，但将同一同步调用中的更新合并为一次微任务重绘。
- 相同值（包括 NaN）或相同对象引用不刷新。对象使用新引用：`state.update(s => ({ count: s.count + 1 }))`。
- `ui.refresh()` 显式请求下一次重绘。不要在 render factory 内写 signal 或请求重绘，会报错。
- 节点顺序、id、类型不变时，保留页面数组和节点对象，只更新变化字段；编译快照独立于页面响应式数据。
  拓扑变化时复用同 id、同类型的节点。视觉相同也会更新回调，避免闭包旧值。
- 按钮回调无参数，switch 收到 boolean，slider 收到 number；返回的 Promise 拒绝会显示运行错误。
- 运行错误保留到下一次有效控件交互、显式 `ui.render()` 或重新运行；signal 和 `ui.refresh()` 不会自动清除错误。
- `ui.setTitle()` 不按字符数截断，长标题使用原生滚动展示；`ui.showHeader(false)` 隐藏 UI 顶栏，并按当前设备的顶部安全边距放置内容。Pro 内容起点从 84px 改为 12px，RW 从 112px 改为 30px。
- `ui.scrollTo(y)` / `ui.scrollTop()` / `ui.scrollBottom()` 在布局提交后执行。
- 隐藏 UI 时 signal/refresh 只标记 dirty，恢复后合并最新状态。显式 render 仍校验，背后对话框不被抢占。
- `ui.show()` 显示已有成功界面，无有效界面返回 false；`ui.hide()` 显示 Console，不丢失状态和日志。
- UI 返回到 Console；轻点日志内容恢复界面；Console 返回离开运行页。全屏仅隐藏 UI 顶栏，系统返回仍进入 Console。
- `script.reload()` 与右上按钮完整替换运行页，重新执行本次源码快照；切换视图和 onShow 不重新运行。
- 点击、滑动、惯性和滚动边界由原生组件处理。节点重新挂载后，可调用 `ui.scrollTo()` 设置位置。
- 页面重建使用应用共享的 JS context；脚本的原生系统任务由脚本管理。

## 图片与内存画布

两个组件是 UI v2 的兼容扩展。图片、画布都支持现有的 `id/background/radius/x/y/flex`，可以放入 row、column、stack；`x/y` 仍只在 stack 内定位。它们不新增触摸或点击接口。

### 图片

`ui.image(source, options?)` 返回普通 UI 描述。source 可以是本地/网络图片 URI，或完整的 `data:image/png;base64,...`、`data:image/jpeg;base64,...`。传裸 Base64 时在 options 中指定 `format: 'png' | 'jpg' | 'jpeg'`。

```js
ui.render(ui.image('internal://files/my-icon.png', {
  id: 'icon', width: 32, height: 32, fit: 'contain'
}));
```

宽度默认父容器可用宽度，未指定高度时按显示宽度预留正方形。请为图标显式设置尺寸。`fit` 支持 `contain`（默认）、`cover`、`none`、`scale-down`，含义与原生 image 相同。

Base64 由运行器解码为字节并写入会话缓存；相同内容复用同一文件。首次加载异步完成后自动请求 UI 刷新，`ui.render()` 仍立即返回 boolean。URI 交给原生组件加载；失败显示运行错误。Base64 目前只接收 PNG/JPG，不接受 SVG 或任意 HTML。

### 内存画布

`ui.canvas({ pixelWidth, pixelHeight, width?, height?, ...布局参数 })` 返回可直接参与布局的 Canvas 实例。必须在渲染函数外创建一次，并在事件处理或初始化逻辑中绘图。

- `pixelWidth/pixelHeight` 是内存分辨率，均为必填正整数，创建后只读。绘图坐标、线宽、`getPixel()` 和 PNG 尺寸均以它们为准。
- `width/height` 是布局尺寸，遵循普通组件规则：width 支持数值、百分比，省略时使用父容器可用宽度；省略 height 时按像素宽高比计算显示高度。可以修改这两个布局属性后调用 `ui.refresh()`，不必重新提交图片。
- `fit` 控制像素图在显示区域内的缩放，默认 `contain`。调整布局尺寸不会重新分配像素或增加编码数据量。

实例也公开可修改的 `id/background/radius/x/y/flex/fit`，与创建时的 options 含义一致。直接修改原实例属性后调用 `ui.refresh()`；`id` 仍需全页唯一，`x/y` 仍只作用于 stack。Canvas 通过实例身份关联像素缓冲，不能用 `{ ...canvas }`、`Object.assign({}, canvas)` 或 JSON 复制来创建新的显示节点，否则会报“Canvas 实例无效”。

旧脚本的 `ui.canvas({ width?, height })` 仍有效：同时省略两个 pixel 参数时，width、height 仍表示原来的像素及显示尺寸，width 默认 `ui.getWidth()`，两者保持只读。实例同样提供 `pixelWidth/pixelHeight`。不要只传一个 pixel 参数。

| 方法 | 行为 |
| --- | --- |
| `clear(color?)` | 省略颜色时全部清为透明；指定颜色则替换所有像素 |
| `setPixel(x, y, color)` | 替换一个像素，包括 alpha；color 接受原有颜色字符串或 `[r,g,b,a]` 数组 |
| `getPixel(x, y)` | 返回独立的 `[r,g,b,a]` 数组，每个通道为 0–255 的整数，可直接传给 setPixel |
| `line(x1, y1, x2, y2, options?)` | 线段，options 支持 `color/lineWidth` |
| `rect(x, y, width, height, options?)` | 矩形，options 支持 `color/fill/lineWidth` |
| `circle(x, y, radius, options?)` | 圆形，x/y 为圆心，options 与 rect 相同 |
| `submit()` | 将调用时的像素编码为 PNG 并写入缓存，返回 `Promise<void>`；不主动刷新 UI |

绘图原点为内存画布左上角，坐标按最近整数像素取整，越界绘制自动裁剪，越界读取报错。矩形尺寸和圆半径不能为负。颜色接受 `#RGB/#RRGGBB/rgb/rgba`；形状默认白色、`fill:true`、`lineWidth:1`。矩形、圆的空心描边向边界内侧延伸。线段和形状使用 source-over 透明混合，像素操作与 clear 直接替换颜色；首版按整像素绘制，不做抗锯齿。

`setPixel` 的 RGBA 数组必须恰好包含四个 0–255 的整数，包括 alpha；这与颜色字符串 `rgba(r,g,b,a)` 中 alpha 为 0–1 的规则不同。无效颜色、数组长度或通道值都会抛错，保留原像素。写入时立即读取数组，之后修改输入数组不会改变画布；`getPixel()` 返回的数组也不引用内部缓冲。可以直接写 `canvas.setPixel(1, 0, canvas.getPixel(0, 0))`。数组输入仅适用于 `setPixel`，`clear/line/rect/circle` 继续接收颜色字符串。

绘图只改变内存，必须等待 `submit()` 成功再调用 `ui.refresh()`。signal 更新或显式 render 也会读取最近成功提交的画面。提交时固定本次像素，后续绘制属于下一次提交；重复提交未改变的画面复用结果；后完成的旧提交保留较新的成功结果。提交失败保留上一幅已提交画面。Promise 在图片文件写入完成后返回，界面刷新时由原生组件加载和绘制。

```js
const canvas = ui.canvas({ id: 'drawing', pixelWidth: 160, pixelHeight: 96, width: '100%', radius: 12 });
async function draw() {
  canvas.clear('#181818');
  canvas.rect(8, 8, 52, 32, { color: '#ff6600' });
  canvas.circle(130, 28, 16, { color: '#00aaff', fill: false, lineWidth: 3 });
  await canvas.submit();
  ui.refresh();
}
ui.render(ui.column([canvas, ui.button('重新绘制', draw)]));
return draw();
```

`background/radius` 只改变组件外观，不改动像素。缓冲、方法和编码过程不进入响应式页面数据；缓存文件由本次运行管理，旧画面切换完成后回收，退出或重载时释放。没有 `createCanvas/getContext/flush` 或画布自身的 `refresh` 方法。独立可运行示例见[图片与画布](../../examples/scripts/image-canvas.js)。

图片切换等待原生加载时，每个显示节点最多额外保留一张旧图片，中间帧及时回收；Canvas 最近一次成功提交的图片保留到下一次提交或会话结束。删除失败的文件在后续回收时重试。若进程被终止而未能执行退出清理，下次启动应用时会先清扫遗留的生成图片，再允许新的图片写入；这不会删除脚本提供的本地图片或其他缓存文件。

## 性能建议与兼容性

组件数量、布局层数和二维码数量没有额外硬上限，布局编译使用显式栈处理深层嵌套，并拒绝循环引用。
对 336×480 手环，首屏可从 40 个声明节点、160 个绘制节点、4 层布局、2 个二维码起步，再根据设备上的交互表现调整。
Canvas 可从 `pixelWidth:160, pixelHeight:96` 起步，再按画面细节和设备资源调整分辨率。这个尺寸约有 324×160 画布的 30% 像素，未压缩 PNG 约 60 KiB；显示时可用 `width:'100%'` 铺满区域。`submit()` 同步编码、异步写入文件，Promise 在写入完成后结束，随后由原生组件加载和显示图片。
实际可用规模受设备内存、原生组件和刷新频率影响；大量组件建议分批显示、提前构造静态描述，并避免高频更新。UI 文本、网格文字和按钮行文字不按字符数截断，但显示仍受控件尺寸和行数影响，长文建议拆段。

`id` 全页唯一，1–56 字符，不能以 `$` 开头。动态重排必须使用稳定 id。
未给 id 的静态项按布局路径生成内部 id。

当前版本的兼容行为：

- `ui.version` 为 2；原来的组件构造调用继续可用。
- `refresh` 与 signal 刷新改为合并执行；读取 signal 仍是同步的。
- 重复 id、未知组件、参数超出允许范围或布局过窄时报告错误，并保留上一幅有效界面。
- 未知组件和可识别的缺失 `ui.*` 调用优先提示客户端版本可能过老；更新客户端或重新导出独立应用后，再检查组件名称。缺失方法仍可用 `typeof ui.image === 'function'` 等方式查询。
- 文本通过行高预算排布，按钮文字过长或指定高度不足时裁剪/省略。
- 原生渲染使用浅层节点；滚动高度由布局结果得出，无需每轮读取 `getScrollRect`。
- 云端 AI 按统一运行契约生成 UI v2 代码；请求契约不匹配时返回明确错误，避免生成客户端无法运行的接口调用。

## 开发与实机验证

运行契约见 [统一脚本 API](runtime-api.md)，[类型声明](../../types/runtime-api.d.ts)与 `ui-api.d.ts` 均无设备运行开销。
在 `vela-quickapp/` 执行 `npm run check:contract` 校验源码、路由、公开方法和性能建议契约；`npm run lint` 检查代码，`npm run build:bandpro` / `npm run build:watch5` 验证对应设备构建。
回归测试使用 `npm run test:runtime` 检查运行器逻辑；在设备上测量绘制耗时、交互延迟和原生内存。
[人工运行器验收脚本](../../examples/diagnostics/unified-runner-check.js)用于检查设备上的切换、重载与对话框。
