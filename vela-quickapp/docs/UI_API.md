# JSLab UI 模式 API

## 启用 UI 模式

将模式声明放在脚本第一个非空行：

```javascript
// @jslab-mode ui
```

未声明时使用 Console 模式。UI 模式运行于 `/workspace/run-ui`，通过 `ui.render()` 提交声明式组件树。

## 基本结构

```javascript
// @jslab-mode ui
const count = ui.signal(0)

ui.setTitle('计数器')
ui.render(() => [
  ui.heading('计数器'),
  ui.text('当前数值：' + count.get()),
  ui.button('增加', () => count.update(value => value + 1))
])
```

`render` 可以接收组件或组件数组。传入函数时，`ui.refresh()` 和 `ui.signal()` 会重新调用该函数并更新页面。

## 页面与状态

- `ui.render(view | factory)`：显示组件树。
- `ui.refresh()`：重新执行当前渲染函数。
- `ui.setTitle(text)`：设置顶部标题，最多显示 10 个字符。
- `ui.setTopBar(visible)`：显示或隐藏 JSLab 顶栏。
- `ui.fullscreen(enabled)`：全屏模式快捷接口；`true` 时隐藏顶栏并释放顶部空间。
- `ui.back()`：返回上一页，全屏页面应提供可见的返回入口。
- `ui.signal(initialValue)`：创建状态对象，提供 `get()`、`set(value)` 和 `update(fn)`；写入后自动刷新。
- `ui.toast(message, duration)`：显示 1500–10000ms Toast。
- `ui.grid(items, options)`：显示 2–4 列紧凑网格，适用于仪表盘、棋盘和快捷入口。
- `ui.buttonRow(buttons, options)`：在同一行显示最多 4 个按钮。
- `ui.scrollTo(y)`：平滑滚动到指定纵向位置。
- `ui.scrollTop()`：平滑返回页面顶部。
- `ui.scrollBottom()`：平滑滚动到页面底部。

## 组件

### 标题与文本

```javascript
ui.heading('标题', { size: 30, color: '#ffffff', align: 'left' })
ui.text('正文', { size: 24, color: '#dce2ea', align: 'center' })
```

`size` 范围为 16–36，`align` 支持 `left`、`center`、`right`。

### 按钮

```javascript
ui.button('保存', () => save(), { id: 'save', tone: 'primary' })
ui.button('删除', () => remove(), { tone: 'danger' })
```

`tone` 支持 `primary`、`neutral` 和 `danger`。

### 开关

```javascript
ui.switch('蓝牙', enabled.get(), value => enabled.set(value), {
  id: 'bluetooth',
  detail: enabled.get() ? '已启用' : '已关闭'
})
```

### 滑块

```javascript
ui.slider('亮度', brightness.get(), value => brightness.set(value), {
  id: 'brightness',
  min: 0,
  max: 100,
  step: 5
})
```

### 进度

```javascript
ui.progress('下载进度', 68, { color: '#0d6eff' })
```

进度值会限制在 0–100。

### 布局辅助

```javascript
ui.divider()
ui.spacer(16)
```

### 网格与同行按钮

```javascript
ui.grid([
  { text: '2', tone: 'primary' },
  { text: '4', tone: 'success' },
  { text: '8', tone: 'warning' },
  { text: '16', tone: 'danger' }
], {
  id: 'tiles',
  columns: 4,
  cellHeight: 50
})

ui.buttonRow([
  ui.button('←', moveLeft),
  ui.button('↓', moveDown),
  ui.button('→', moveRight)
], { id: 'directions' })
```

`grid` 的 `columns` 范围为 2–4，最多显示 9 行；单元格支持 `neutral`、`primary`、`success`、`warning`、`danger` 色调。`buttonRow` 最多容纳 4 个按钮。

完整的无动画 2048 示例可在手环“新建 JS”页面选择“UI 2048游戏”模板创建。

## 生命周期和限制

- 单次渲染最多保留 40 个根组件。
- 文本最长保留 1024 个字符。
- 内容超过屏幕高度时自动形成不可压缩的纵向滚动区域并显示右侧位置指示条；状态重绘会保留当前滚动位置。
- 建议为会改变顺序的交互组件提供稳定且唯一的 `id`。
- 返回页面或重新进入运行页后，旧页面的按钮、开关和滑块回调将失效。
- UI 模式仍可使用 JSLab 已注入的 Vela 系统 API，例如 `storage`、`fetch`、`device` 和 `vibrator`。
- QuickJS 同步死循环会阻塞 UI 线程，UI 模式无法在页面内抢占正在执行的同步代码。

## 全屏界面

```javascript
// @jslab-mode ui
ui.fullscreen(true)

ui.render(() => [
  ui.heading('全屏界面'),
  ui.text('顶部 102px 已释放给用户内容'),
  ui.button('返回 JSLab', () => ui.back(), { tone: 'neutral' })
])
```

UI 模式不提供停止和重试按钮。隐藏顶栏后，脚本应使用 `ui.back()` 提供自己的返回入口。
