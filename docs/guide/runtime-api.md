# 对话框与用户输入

> 最低支持版本：JSLab 2.0.0。本页的 `alert`、`confirm`、`text`、`number`、`select` 及所列参数均适用。

对话框适合让用户完成一次明确的操作：输入名字、填写数字、选择选项，或确认是否继续。JSLab 的 `dialog` 对象已经可用，不需要导入模块。

下面的完整示例可以分别复制到 `.js` 文件中运行。还不熟悉异步函数时，可先看 [脚本基础与运行控制](script-basics.md)。

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

## 参数速查

所有对话框都可以设置 `title`、`message`、`confirmText` 和 `cancelText`。确认返回 `action: 'confirm'`，取消返回 `action: 'cancel'`；文本、数字和选择框的结果放在 `value` 中。

| 对话框 | 常用的专用参数 | 最低支持版本 |
| --- | --- | --- |
| `dialog.alert()` | 显示提示，不需要输入值 | 2.0.0 |
| `dialog.confirm()` | `secondaryText` 增加第三种选择 | 2.0.0 |
| `dialog.text()` | `value`、`placeholder`、`required`、`minLength`、`maxLength`、`language: 'cn'` 或 `'en'` | 2.0.0 |
| `dialog.number()` | `value`、`required`、`min`、`max`、`decimals` | 2.0.0 |
| `dialog.select()` | `items`、`value`、`multiple`、`minSelected`、`maxSelected` | 2.0.0 |

文字输入默认最多 64 个字符，可以用 `maxLength` 调整到最多 8000；小数位数 `decimals` 可以设置为 0–10。把初始值设置在允许范围内，避免窗口打开时就报参数错误。

## 参数错误与取消操作

取消时 Promise 成功返回 `{ action: 'cancel', value: null }`；无效参数、重复打开对话框等错误由 Promise 拒绝返回。

| 错误代码 | 说明与处理 |
| --- | --- |
| `DIALOG_INVALID` | 检查初始值、范围、选项和长度设置 |
| `DIALOG_BUSY` | 已有对话框，先等待它结束 |
| `DIALOG_OPEN_FAILED` | 未能打开对话框，保留输入并提示重试 |
| `DIALOG_INACTIVE` | 当前运行已退出或正在重载，不再继续打开 |

文本结果保留首尾空白，需要时在确认后调用 `trim()`。数字框允许留空时，确认结果可以是 `null`；选择列表使用唯一值，预选项应处于启用状态。

想把结果留到下次运行，阅读 [保存数据与设置](script-storage.md)；想显示交互页面，阅读 [制作交互界面](ui-api.md)。
