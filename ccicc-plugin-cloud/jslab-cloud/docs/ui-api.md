# JSLab UI API v2

所有 `.js` 脚本都可以通过 `ui.render()` 描述界面；`.ui.js` 没有特殊含义。设计尺寸为 336×480，内容宽 324px。
新建脚本里的“布局与二维码”模板可以直接运行。[类型声明](./ui-api.d.ts)可用于桌面编辑器补全。

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
stack 的子项默认满宽，因此要向右移动应同时设置较小 width。整个 stack 随页面滚动，不是屏幕固定图层。
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

没有增加图片、列表、图表等组件。v2 只新增二维码；原有交互仍是按钮点击、switch/slider 值变化。
按钮支持 `disabled`；不提供 busy、手势、运行菜单或生命周期登记 API。

| 组件 | 常用参数 |
| --- | --- |
| `heading(text, options)` / `text(text, options)` | `size` 16–36、`color`、`align: left/center/right`、`bold`、`lines` 1–64、`lineHeight`（字号至 64） |
| `button(text, onPress, options)` | `background`、`color`、`tone: primary/neutral/danger`、`id`、`disabled`；最小高度 48 |
| `switch(label, checked, onChange, options)` | `color` 标题、`background`、`accent` 滑轨、`thumbColor`、`detail`、`detailColor`；最小宽 160 |
| `slider(label, value, onChange, options)` | `color/background/accent/trackColor/thumbColor`、`min/max/step`；最小宽 160 |
| `progress(label, percent, options)` | `accent` 进度、`trackColor` 轨道、`color` 标题、`background`；未指定 accent 时，旧 color 仍控制进度色；最小宽 160 |
| `grid(items, options)` | 2–4 列、行数不限，`columns/cellHeight/gap`；格子支持 `text/tone/color/background/size`，只展示 |
| `buttonRow(buttons, options)` | 按可用宽度排列按钮，按钮文本最多 8 字符；子按钮 id、color、background 有效 |
| `divider(options)` / `spacer(size)` | 分隔线 `color/height`，或 0–480px 间距 |
| `qrcode(value, options)` | 1–256 字符，`size` 96–288 默认 160，含四周 8px 空白；`color/background` 默认黑白 |

除 spacer 外，叶子可设置 `width/height/background/radius`（二维码始终正方形，用 size 控制）。
二维码建议短 URL、黑白对比、160px 以上；数量不限，值不变时不会反复提交更新。多个二维码会增加原生绘制开销。
推荐不透明颜色 `#RGB`、`#RRGGBB`、`rgb(r,g,b)`；兼容有效 rgba。无 opacity。
颜色无效时回退默认值。`disabled:true` 显示禁用样式并排除按钮回调。异步任务仍在回调检查业务 busy，防止确认状态发布前重复提交。

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
- `ui.setTitle()` 最多 80 字符，长标题使用原生滚动展示；`ui.showHeader(false)` 将内容起点从 84px 改为 12px。
- `ui.scrollTo(y)` / `ui.scrollTop()` / `ui.scrollBottom()` 在布局提交后执行。
- 隐藏 UI 时 signal/refresh 只标记 dirty，恢复后合并最新状态。显式 render 仍校验，背后对话框不被抢占。
- `ui.show()` 显示已有成功界面，无有效界面返回 false；`ui.hide()` 显示 Console，不丢失状态和日志。
- UI 返回到 Console；轻点日志内容恢复界面；Console 返回离开运行页。全屏仅隐藏 UI 顶栏，系统返回仍进入 Console。
- `script.reload()` 与右上按钮完整替换运行页，重新执行本次源码快照；切换视图和 onShow 不重新运行。
- 原生滚动处理点击/滑动、惯性、边界；运行器不另写触摸识别或滚动补偿。原生节点卸载后不承诺保留其滚动位置。
- 页重建不是重启共享 JS context，脚本自己的原生系统任务仍由脚本管理。

## 性能建议与兼容性

组件数量、布局层数和二维码数量没有额外硬上限，布局编译使用显式栈处理深层嵌套，并拒绝循环引用。
对 336×480 手环，40 个声明节点、160 个绘制节点、4 层布局、2 个二维码可作为首屏性能参考值，并非超出后报错的限制。
实际可用规模受设备内存、原生组件和刷新频率影响；大量组件建议分批显示、提前构造静态描述，并避免高频更新。每段文本仍最多 1024 字符。

`id` 全页唯一，1–56 字符，不能以 `$` 开头。动态重排必须使用稳定 id。
未给 id 的静态项按布局路径生成内部 id。

相较 v1 的有意变化：

- `ui.version` 为 2；原来的组件构造调用继续可用。
- `refresh` 与 signal 刷新改为合并执行；读取 signal 仍是同步的。
- 重复 id、未知组件、超限或过窄布局报错，保留上一幅有效界面；不静默截断。
- 文本通过行高预算排布，按钮文字过长或指定高度不足时裁剪/省略。
- 原生渲染层变浅；滚动高度由布局结果得出，去掉每轮 `getScrollRect`。
- 新版云端提示词生成 UI v2 代码；部署云插件时同步更新快应用。

## 开发与实机验证

运行契约见 [统一脚本 API](runtime-api.md)，[类型声明](runtime-api.d.ts)与 `ui-api.d.ts` 均无设备运行开销。
`npm run check:contract` 校验源码、路由、公开方法和性能建议契约；`npm run lint` 与 `npm run release` 验证构建。
历史性能测试保留在 tests/diagnostics，不能代表手环绘制完成、交互延迟或原生内存。
设备验收脚本位于仓库 vela-quickapp/diagnostics/unified-runner-check.js。
