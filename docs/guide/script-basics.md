# 脚本基础与运行控制

> 最低支持版本：JSLab 2.0.0。本页的日志、运行控制、语言查询、能力检查和计时器均适用。

JSLab 脚本是一个 `.js` 文件。你只需要编写执行逻辑，不需要创建应用工程、声明页面或导入系统模块。先用 [入门教程](getting-started.md) 跑通一个例子，再按本页了解执行方式。

## 可以直接使用的对象

| 对象 | 作用 | 继续阅读 |
| --- | --- | --- |
| `console` | 在日志页输出结果和错误 | 本页的日志说明 |
| `script` | 当前文件名、运行控制、数据与配置 | 本页和 [保存数据](script-storage.md) |
| `dialog` | 提示、确认、文字输入、数字输入和选择 | [对话框](runtime-api.md) |
| `ui` | 创建界面和更新状态 | [交互界面](ui-api.md) |
| `system` | 访问设备提供的系统功能 | [设备接口说明](system-api.md) |

JavaScript 的 `Math`、`Date`、`JSON`、数组和字符串等内建能力可以使用。JSLab 不是浏览器或 Node.js，不能假设存在网页 DOM、`window`、`document` 或 Node.js 模块；脚本里不使用 `import` 和 `require`。

## 顺序执行与异步操作

普通语句从上到下执行。等待存储、对话框等 Promise 操作时，把步骤写进 `async` 函数，并在脚本末尾返回这个函数的结果：

```js
async function main() {
  const step = await script.config.get('step', 1);
  console.log('每次增加', step);
}

return main();
```

`await` 等待前一步完成，之后才能使用结果。它不能直接放在脚本最外层。末尾的 `return main()` 也让运行器能够观察这段异步过程的错误。

原生系统接口通常使用回调，写法与 `script.data` 不同。不要仅仅在系统方法前添加 `await` 就认为已经等到了结果；用法见 [设备接口说明](system-api.md)。

## 输出和阅读日志

```js
const total = 12 * 3;
console.log('计算结果', total);
console.warn('这是一条提醒');
```

`console.log()` 和 `console.info()` 输出普通信息，`console.warn()` 标记提醒，`console.error()` 标记错误。它们可同时接收多个值。`console.error()` 不会自动结束程序，`console.clear()` 可清空本次日志。

日志最多保留最近 64 条、合计 6144 个字符，单条最多显示 1024 个字符。检查大数组时只打印关键字段；高频回调中避免持续输出，否则有用信息会很快被挤掉。

日志不自动保存为文件。运行中的状态、日志和已保存数据也不是同一回事。

## 切换界面、重新运行与退出

| 想做的事 | 方法或操作 | 状态会怎样 |
| --- | --- | --- |
| 从界面查看日志 | `ui.hide()`，或按返回 | 界面状态保留 |
| 从日志回到界面 | `ui.show()`，或轻点日志内容 | 恢复已创建的界面，不从头运行 |
| 从头运行本次代码 | `script.reload()`，或右上角重载按钮 | 普通变量重新初始化 |
| 离开本次运行 | `script.exit()`，或在日志页返回 | 返回打开脚本的页面 |

重新运行使用本次打开的代码，包含从编辑器运行时尚未保存的内容，不会顺便保存文件。通过 `script.data` 或 `script.config` 保存的数据则会保留。

## 文件名、提示和设备语言

| 方法或属性 | 用法 |
| --- | --- |
| `script.name` | 当前脚本文件名 |
| `script.toast(message, duration)` | 短暂提示，时长单位为毫秒，可设为 1500–10000 |
| `script.locale()` | 返回包含 `language`、`countryOrRegion` 的对象 |
| `script.canUse(capability)` | 查询系统能力，参数使用小米原始接口名称 |

```js
console.log('正在运行', script.name);
const locale = script.locale();
console.log('语言', locale.language, '地区', locale.countryOrRegion);
script.toast('脚本已启动');
```

## 计时器和长期运行的任务

可以使用 `setTimeout`、`setInterval`，并用对应的 `clearTimeout`、`clearInterval` 取消。让循环和任务有明确的结束条件，避免同步死循环阻塞设备。

原生传感器订阅、音频、录音等需要按各自接口停止。切换到日志或退出运行页，不代表所有原生任务都会被自动释放。脚本环境没有通用的 `script.onDispose` 回调，不要照搬其他框架的生命周期写法。

## 在电脑编辑器中获得补全

下载 [脚本类型声明](../../types/runtime-api.d.ts) 和 [界面类型声明](../../types/ui-api.d.ts)，放在代码旁边，供支持 TypeScript 声明的编辑器读取。系统接口的详细参数以本指南各接口页和对应的小米文档为准。

下一步可以学习 [保存数据](script-storage.md)、[处理用户输入](runtime-api.md) 或 [制作界面](ui-api.md)。
