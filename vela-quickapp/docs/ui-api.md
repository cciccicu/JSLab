# JSLab UI API v2

保存为 `.ui.js`，通过 `ui.render()` 描述界面。设计尺寸为 336×480，内容宽 324px。
新建脚本里的“UI 布局与二维码”模板可以直接运行。[类型声明](./ui-api.d.ts)可用于桌面编辑器补全。

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
容器最小高度为内容所需高度；文本、按钮等叶子固定高度不足时会裁剪。
stack 的子项默认满宽，因此要向右移动应同时设置较小 width。整个 stack 随页面滚动，不是屏幕固定图层。

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
```

## 组件与配色

没有增加图片、列表、图表等组件。v2 只新增二维码；原有交互仍是按钮点击、switch/slider 值变化。
没有新增 disabled、busy、手势或生命周期 API。

| 组件 | 常用参数 |
| --- | --- |
| `heading(text, options)` / `text(text, options)` | `size` 16–36、`color`、`align: left/center/right`、`bold`、`lines` 1–64、`lineHeight`（字号至 64） |
| `button(text, onPress, options)` | `background`、`color`、`tone: primary/neutral/danger`、`id`；最小高度 48 |
| `switch(label, checked, onChange, options)` | `color` 标题、`background`、`accent` 滑轨、`thumbColor`、`detail`、`detailColor`；最小宽 160 |
| `slider(label, value, onChange, options)` | `color/background/accent/trackColor/thumbColor`、`min/max/step`；最小宽 160 |
| `progress(label, percent, options)` | `accent` 进度、`trackColor` 轨道、`color` 标题、`background`；未指定 accent 时，旧 color 仍控制进度色；最小宽 160 |
| `grid(items, options)` | 2–4 列、最多 9 行，`columns/cellHeight/gap`；格子支持 `text/tone/color/background/size`，只展示 |
| `buttonRow(buttons, options)` | 最多 4 个 `ui.button`，按钮文本最多 8 字符；子按钮 id、color、background 有效 |
| `divider(options)` / `spacer(size)` | 分隔线 `color/height`，或 0–480px 间距 |
| `qrcode(value, options)` | 1–256 字符，`size` 96–288 默认 160，含四周 8px 空白；`color/background` 默认黑白 |

除 spacer 外，叶子可设置 `width/height/background/radius`（二维码始终正方形，用 size 控制）。
二维码建议短 URL、黑白对比、160px 以上；同屏最多两个，值不变时不会反复提交更新。
推荐不透明颜色 `#RGB`、`#RRGGBB`、`rgb(r,g,b)`；兼容有效 rgba。无 opacity。
颜色无效时回退默认值。按钮防重复在回调中检查状态，以背景和文字色表示忙碌。

文本的 `lines` 是高度预算与最大行数，过长内容省略。省略 lines 时，按字号、字符数、显式换行保守估算，
ASCII 文本可能多留空白；精确面板推荐 `lines: 1` 或显式多行预算。内部仍由原生 text 负责断行。
未绑定字体测量或每轮原生尺寸查询，以保持低开销。中文长文应分页。

## 状态、事件与更新

- `ui.render(viewOrFactory)` 立即编译并显示。factory 必须是纯函数。
- `signal.set/update` 立即改变值，但将同一同步调用中的更新合并为一次微任务重绘。
- 相同值（包括 NaN）或相同对象引用不刷新。对象使用新引用：`state.update(s => ({ count: s.count + 1 }))`。
- `ui.refresh()` 显式请求下一次重绘。不要在 render factory 内写 signal 或请求重绘，会报错。
- 未变化的节点保持引用；只更新发生变化的节点。视觉相同也会更新回调，避免闭包旧值。
- 按钮回调无参数，switch 收到 boolean，slider 收到 number；返回的 Promise 拒绝会显示运行错误。
- `ui.setTitle()` 最多 10 字符；`ui.showHeader(false)` 将内容起点从 102 改为 12px。
- `ui.scrollTo(y)` / `ui.scrollTop()` / `ui.scrollBottom()` 在布局提交后执行。
- 生命周期不变，脚本自己的系统任务和计时器仍由脚本管理。

## 预算与兼容性

40 个声明节点计入布局和 buttonRow 按钮，不计 grid 格子；最多 4 层布局嵌套；
展开后最多 160 个绘制节点；最多 2 个二维码；每段文本最多 1024 字符。
预算同时约束中间编译过程，超限不会先构造无限树。
这是上限，不是建议的常驻规模；减少组件数量、提前构造静态描述、避免高频更新。

`id` 全页唯一，1–56 字符，不能以 `$` 开头。动态重排必须使用稳定 id。
未给 id 的静态项按布局路径生成内部 id。

相较 v1 的有意变化：

- `ui.version` 为 2；原来的组件构造调用继续可用。
- `refresh` 与 signal 刷新改为合并执行；读取 signal 仍是同步的。
- 重复 id、未知组件、超限或过窄布局报错，保留上一幅有效界面；不静默截断。
- 文本通过行高预算排布，按钮文字过长或指定高度不足时裁剪/省略。
- 原生渲染层变浅；滚动高度由布局结果得出，去掉每轮 `getScrollRect`。
- 新版云端提示词生成 UI v2 代码；部署云插件时同步更新快应用。

## 验证

`npm run test:ui` 检查布局、预算、颜色、身份稳定、批量更新、二维码复用和异步错误。
`npm run bench:ui -- <v1-git-revision>` 对比旧实现与新实现的 JS 耗时、重绘次数和原生测量调用数。
默认基线为当前 HEAD 中的 v1 文件；基线提交后请显式指定旧 revision。
桌面 Node 基准不代表手环帧率、原生堆内存或实际扫码能力，设备表现需另行验证。
