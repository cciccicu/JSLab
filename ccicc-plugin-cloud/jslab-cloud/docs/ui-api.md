# 制作交互界面

这篇教程会把一个计数器逐步做成完整的小工具：先显示数字和按钮，再调整布局，最后加上开关和二维码。每段示例都可以单独复制到脚本中运行。

## 让数字随着按钮变化

```js
const count = ui.signal(0);

ui.render(() => [
  ui.heading('计数器'),
  ui.text('当前次数：' + count.get(), { lines: 1 }),
  ui.button('加一', () => count.update(value => value + 1)),
  ui.button('清零', () => count.set(0))
]);
```

运行后会看到标题、次数和两个按钮。`get()` 读取数字，`set(0)` 把数字改回 0，`update()` 根据之前的值算出新的值。

当数字变化时，传给 `ui.render()` 的函数会重新生成显示内容。因此在这个函数里只描述界面；把修改数字、保存文件等操作放在按钮回调中，避免界面更新时反复执行它们。

数组里的组件按顺序向下排列。想让两个按钮并排，可以用 `ui.row()`。

## 把两个按钮排成一行

```js
const count = ui.signal(0);

ui.render(() => ui.column([
  ui.heading('计数器'),
  ui.text('当前次数：' + count.get(), { lines: 1 }),
  ui.row([
    ui.button('加一', () => count.update(value => value + 1)),
    ui.button('清零', () => count.set(0))
  ])
], { padding: 12, gap: 12 }));
```

`ui.column()` 纵向排列，`ui.row()` 横向排列。这里的 `padding: 12` 在四周留出 12 像素，`gap: 12` 在各项之间留出 12 像素。

一行里没有指定宽度的组件会平分剩余空间。想让某一项更宽，可以给它设置 `flex: 2`，另一项保持 `flex: 1`。

不要直接给两项都设置 `width: '50%'` 再添加间距：两个 50% 已经占满整行，加上间距就放不下了。等宽排列时，让 `ui.row()` 自动分配即可。

## 调整文字和颜色

```js
ui.render(ui.column([
  ui.heading('今日目标', { size: 28, color: '#7dd3fc' }),
  ui.text('读书 20 分钟', { size: 22, lines: 1 }),
  ui.text('完成后给自己留一点休息时间。', { size: 18, lines: 2 }),
  ui.button('知道了', () => script.toast('开始吧！'), {
    background: '#176b45',
    color: '#ffffff'
  })
], { padding: 12, gap: 12, background: '#24262a', radius: 16 }));
```

`size` 调整字号，`color` 设置文字颜色，`background` 设置背景，`radius` 设置圆角。`lines` 表示给文字预留几行，内容超出时会省略。短标签用 `lines: 1`；较长说明可以预留两三行。

文字支持 `align: 'left'`、`'center'` 或 `'right'`。正文尽量用清晰的字号和对比度，不要在小屏幕上塞进整段长文。

## 用开关选择一个状态

```js
const reminder = ui.signal(false);

ui.render(() => [
  ui.heading('提醒设置'),
  ui.switch('开启提醒', reminder.get(), value => reminder.set(value)),
  ui.text(reminder.get() ? '提醒已开启' : '提醒已关闭')
]);
```

开关改变时，回调收到的是 `true` 或 `false`。把它保存到 signal，下面的文字就能跟着变化。

滑块回调收到的是数字。下面这个例子用滑块选择目标数量，再用进度条显示已完成 30 次时的进度：

```js
const target = ui.signal(50);

ui.render(() => [
  ui.heading('今日目标'),
  ui.slider('目标次数', target.get(), value => target.set(value), {
    min: 30, max: 100, step: 10
  }),
  ui.progress('已完成 30 次', 30 / target.get() * 100)
]);
```

进度条的第二个参数是百分比，使用 0–100 的数值。开关和滑块适合独占一行，排成很窄的两列时可能放不下。

## 显示一个二维码

```js
ui.render([
  ui.heading('手机打开'),
  ui.text('扫描下面的二维码访问网站。'),
  ui.qrcode('https://ccicc.icu', { size: 180 })
]);
```

二维码适合短链接或短文字，内容最多 256 个字符。尺寸可以设置为 96–288 像素，建议从 160 或 180 开始，保留黑白配色，方便手机识别。

## 自己摆放组件的位置

大多数页面用横排和竖排就够了。想把一个小标签放在另一段内容旁边，可以用 `ui.stack()` 指定位置：

```js
ui.render(ui.stack([
  ui.text('本周进度', { width: 210, lines: 1 }),
  ui.text('3 / 7', { x: 220, y: 0, width: 80, lines: 1 })
], { height: 48 }));
```

`x`、`y` 是相对于这块布局内容区左上角的位置，`width`、`height` 决定组件大小。靠右摆放时也要设置合适的宽度，保证组件能放进屏幕。

后写的组件会盖在先写的组件上面。摆放按钮时，给它留出足够的点击空间，避免重叠。这里的位置会随着页面一起滚动。

## 界面操作速查

| 想做的事 | 写法 |
| --- | --- |
| 显示一组组件或按状态生成界面 | `ui.render(组件数组)` 或 `ui.render(() => 组件数组)` |
| 回到日志页 | `ui.hide()` |
| 恢复之前显示过的界面 | `ui.show()` |
| 修改顶部标题 | `ui.setTitle('标题')` |
| 隐藏界面顶部栏，留出更多空间 | `ui.showHeader(false)` |
| 恢复顶部栏 | `ui.showHeader(true)` |
| 滚动到开头或结尾 | `ui.scrollTop()`、`ui.scrollBottom()` |
| 滚动到指定位置 | `ui.scrollTo(120)` |
| 普通变量变化后，手动更新界面 | `ui.refresh()` |

用了 signal 时通常不需要再调用 `ui.refresh()`。切到日志后，界面里的状态仍然保留；恢复界面会显示最新的值，不会从头运行脚本。隐藏顶部栏后，仍可以通过返回操作查看日志。

## 组件速查

| 组件 | 用途与常用参数 |
| --- | --- |
| `ui.heading(文字, 参数)`、`ui.text(文字, 参数)` | 标题、正文；`size`、`color`、`lines`、`align`、`bold` |
| `ui.button(文字, 点击函数, 参数)` | 操作按钮；`tone: 'primary' / 'neutral' / 'danger'`、`disabled`、`background`、`color` |
| `ui.switch(标题, 是否开启, 改变函数, 参数)` | 开关；`detail`、`accent`、`thumbColor` |
| `ui.slider(标题, 当前值, 改变函数, 参数)` | 滑块；`min`、`max`、`step`、`accent`、`trackColor` |
| `ui.progress(标题, 百分比, 参数)` | 显示进度；`accent`、`trackColor` |
| `ui.grid(内容数组, 参数)` | 展示网格；`columns` 为 2–4，`cellHeight`、`gap`；格子不接收点击 |
| `ui.buttonRow(按钮数组, 参数)` | 排列一组短按钮；按钮文字最多 8 个字符 |
| `ui.divider(参数)` | 分隔线；`color`、`height` |
| `ui.spacer(高度)` | 添加空白间距 |
| `ui.qrcode(内容, 参数)` | 二维码；`size`、`color`、`background` |

布局容器可使用 `padding`、`gap`、`align` 和 `justify` 调整间距和对齐；组件可以使用 `width`、`height` 调整大小。按钮高度至少 48 像素，开关和滑块宽度至少 160 像素。文字的 `size` 支持 16–36，单段文字最多 1024 个字符。

需要根据状态增删或重新排列组件时，给组件设置唯一且稳定的 `id`，例如 `id: 'score'`。同一页不要重复使用一个 id；id 为 1–56 个字符，不能以 `$` 开头。

## 做得更顺手一些

先把常用内容放在第一屏，其余内容让用户滚动查看。不要每隔几毫秒更新整个页面；计数器、开关之类的工具，在用户操作后更新就够了。

如果更新的是对象，要创建一个新对象，例如 `state.update(value => ({ count: value.count + 1 }))`。只修改原对象里的字段，signal 无法判断它已经变化。

按钮需要等待网络请求时，可以先设置一个“正在处理”的状态，再用 `disabled: true` 暂时禁用按钮，并在回调开始时检查状态，避免连续点击发起多次请求。完成或失败后再恢复。

界面显示不出来时，先按返回查看日志，检查是否有重复 id、过窄的组件或放不下的一行。修改后重新运行即可。想在按钮中询问用户或保存结果，继续看 [输入、记录与脚本控制](runtime-api.md)。

在电脑上写代码时，可以下载 [UI 类型声明](ui-api.d.ts) 获得编辑器补全。
