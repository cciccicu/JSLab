# 输入、记录与脚本控制

一个小工具通常要做三件事：向用户询问信息，处理输入，再显示或保存结果。这篇教程从一个问候程序开始，带你认识这些常用操作。

下面的代码都可以单独复制到一个 `.js` 文件中运行。

## 询问用户的名字

```js
async function main() {
  const answer = await dialog.text({
    title: '怎么称呼你？',
    placeholder: '输入名字',
    required: true
  });

  if (answer.action === 'confirm') {
    console.log('你好，' + answer.value + '！');
  } else {
    console.log('这次没有输入名字。');
  }
}

return main();
```

运行后会弹出输入窗口。填好名字并确认，日志中就会显示问候；按取消或返回，则显示“这次没有输入名字”。

`await` 表示先等用户完成输入，再执行后面的代码。它需要放在 `async` 函数里。最后的 `return main()` 启动这个函数，也让 JSLab 能显示函数执行期间发生的错误。

对话框的结果有两个常用字段：`action` 表示用户做了什么，`value` 是输入内容。判断是否确认时，使用 `answer.action === 'confirm'`，这样输入的数字 0 或空字符串也不会被误当作取消。

## 输入数字并计算

用 `dialog.number()` 接收金额、次数、温度等数字。下面这个程序会计算一笔账单平分给 3 个人后的金额：

```js
async function main() {
  const answer = await dialog.number({
    title: '账单金额',
    value: 0,
    required: true,
    min: 0,
    max: 10000,
    decimals: 2
  });

  if (answer.action !== 'confirm') return;
  console.log('每人应付：¥' + (answer.value / 3).toFixed(2));
}

return main();
```

`value` 是打开窗口时的初始值，`min`、`max` 限制输入范围，`decimals` 限制小数位数。只允许整数时写 `decimals: 0`。支持负数；输入温度时，可以把 `min` 设成负数。

## 让用户选择一项

```js
async function main() {
  const answer = await dialog.select({
    title: '休息多久？',
    items: [
      { label: '5 分钟', value: 5 },
      { label: '10 分钟', value: 10 },
      { label: '15 分钟', value: 15 }
    ],
    value: 10
  });

  if (answer.action === 'confirm') {
    console.log('你选择了 ' + answer.value + ' 分钟。');
  }
}

return main();
```

`label` 是屏幕上显示的文字，`value` 是确认后交给程序的值。上面的 `value: 10` 表示默认选中“10 分钟”。每项的值要不同，最多可以提供 100 项。

需要多选时，添加 `multiple: true`；初始值也改成数组，例如 `value: [5, 10]`。确认后会得到所选值的数组。可以用 `minSelected`、`maxSelected` 限制选择数量，用 `disabled: true` 暂时禁用某项。

## 确认后再继续

需要用户决定是否继续时，用 `dialog.confirm()`：

```js
async function main() {
  const answer = await dialog.confirm({
    title: '开始新的一局？',
    message: '本局分数会清零。',
    confirmText: '开始',
    cancelText: '继续本局'
  });

  if (answer.action === 'confirm') {
    console.log('新的一局开始了。');
  }
}

return main();
```

如果还有第三种选择，添加 `secondaryText`，用户点击它时会返回 `action: 'secondary'`。只想显示一段提示，让用户读完后关闭，可以用 `dialog.alert()`。

每次只打开一个对话框。连续询问多个问题时，像上面的例子一样先 `await` 等待前一个结束，再打开下一个。

## 记住上次运行的结果

普通变量在程序重新运行时会重新创建。希望下次还能读到的内容，可以放进 `script.data`：

```js
async function main() {
  const previous = await script.data.get('opens', 0);
  const current = previous + 1;
  await script.data.set('opens', current);
  console.log('这是你第 ' + current + ' 次打开这个脚本。');
}

return main();
```

第一次运行时还没有 `opens`，所以 `get('opens', 0)` 返回默认值 0。之后每次运行，都会读出上次保存的数字，再加一保存。

`script.config` 的用法相同，适合保存字号、默认数量等设置。你可以把程序产生的记录放进 `data`，把用户选择的偏好放进 `config`。

| 操作 | 用法 |
| --- | --- |
| 读取内容，没有时使用默认值 | `await script.data.get('key', 默认值)` |
| 保存文字、数字、数组或普通对象 | `await script.data.set('key', 内容)` |
| 删除一项 | `await script.data.delete('key')` |
| 删除本脚本保存的全部数据 | `await script.data.clear()` |
| 读取本脚本保存的全部数据 | `await script.data.all()` |

每个脚本有自己的数据，互不混用。通过 JSLab 重命名文件时，数据会一起迁移；删除脚本时，对应的数据和设置也会删除。单项内容最多 16 KiB，`data` 和 `config` 各最多 64 KiB，适合小型记录和设置。

## 用日志检查程序

`console.log()` 可以一次显示多个内容，例如 `console.log('次数：', 3)`。`console.info()`、`console.warn()`、`console.error()` 分别用于普通信息、提醒和错误，`console.clear()` 清空日志。

`console.error()` 只是打印错误信息，不会自动结束程序。想停止当前函数，可以写 `return`。

日志只保留最近的内容，最多 64 条、合计 6144 个字符。检查长数组或连续循环时，优先打印需要的几项，避免重要信息很快被新日志覆盖。

## 返回日志、重新开始和退出

| 想做的事 | 写法或操作 |
| --- | --- |
| 从界面切到日志，稍后继续 | `ui.hide()`，或在界面中按返回 |
| 恢复之前的界面 | `ui.show()`，或轻点日志内容 |
| 从头执行本次代码 | `script.reload()`，或点击右上角的重载按钮 |
| 结束这次运行，回到打开脚本的页面 | `script.exit()` |
| 显示一条短提示 | `script.toast('已完成')` |
| 查看当前文件名 | `script.name` |

切到日志再恢复界面，计数器之类的状态仍会保留。重载会重新执行代码，普通变量重新初始化，之前用 `script.data` 保存的内容仍在。重载本身不会保存编辑器里的代码。

## 使用手环的系统功能

除了界面和对话框，还可以通过 `system` 使用设备信息、文件、网络和振动等功能。例如短振动：

```js
if (script.canUse('@system.vibrator.vibrate')) {
  system.vibration.vibrate({ mode: 'short' });
  console.log('已请求短振动。');
} else {
  console.log('这台设备不支持脚本振动。');
}
```

`script.canUse()` 用来检查设备是否支持某个功能。具体接口及参数可以在手环的“系统 API”帮助中查找；不同设备和系统版本的支持情况可能不同。

系统接口通常通过 `success`、`fail` 回调返回结果，不能直接在调用前加 `await`。使用录音、音频或持续订阅等功能时，也要在自己的结束操作中停止它们。

## 参数速查

所有对话框都可以设置 `title`、`message`、`confirmText` 和 `cancelText`。确认返回 `action: 'confirm'`，取消返回 `action: 'cancel'`；文本、数字和选择框的结果放在 `value` 中。

| 对话框 | 常用的专用参数 |
| --- | --- |
| `dialog.alert()` | 显示提示，不需要输入值 |
| `dialog.confirm()` | `secondaryText` 增加第三种选择 |
| `dialog.text()` | `value`、`placeholder`、`required`、`minLength`、`maxLength`、`language: 'cn'` 或 `'en'` |
| `dialog.number()` | `value`、`required`、`min`、`max`、`decimals` |
| `dialog.select()` | `items`、`value`、`multiple`、`minSelected`、`maxSelected` |

文字输入默认最多 64 个字符，可以用 `maxLength` 调整到最多 8000；小数位数 `decimals` 可以设置为 0–10。把初始值设置在允许范围内，避免窗口打开时就报参数错误。

JSLab 提供了 `console`、`ui`、`dialog`、`script` 和 `system`，不需要导入它们。脚本中不能使用 `import` 或 `require`；异步步骤请放进 `async` 函数，并像教程那样用 `return main()` 启动。

想把输入结果显示成按钮和卡片，继续看 [制作交互界面](ui-api.md)。在电脑上写代码时，也可以下载 [脚本类型声明](runtime-api.d.ts) 和 [UI 类型声明](ui-api.d.ts)，放在代码旁边，方便支持 TypeScript 声明的编辑器提供补全。
