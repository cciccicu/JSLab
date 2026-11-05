# 脚本运行接口参考

本文面向需要查询接口行为和边界的开发者。第一次编写脚本可先读[脚本基础](../guide/script-basics.md)和[运行环境指南](../guide/runtime-api.md)；编辑器补全使用[运行环境类型声明](../../types/runtime-api.d.ts)。

## 执行模型

所有 `.js` 文件使用同一个运行器。脚本名决定文件身份和持久化命名空间，`.ui.js` 后缀不会选择另一种执行模式。每个运行页实例将源码作为 `Function` 的函数体初始化一次；切换 Console 与 UI、页面重新显示都不会重复执行源码。

运行环境提供 `console`、`script`、`dialog`、`ui` 和 `system`，以及设备 JavaScript 引擎支持的内建对象和计时器。不支持 `import`、`require` 或裸顶层 `await`。异步入口可以返回 Promise，让运行器观察其失败：

```js
async function main() {
  const count = await script.data.get('count', 0);
  console.log('已保存的次数', count);
}
return main();
```

同步死循环仍会阻塞 JavaScript 线程。运行页重建不等于重启应用共享的 JavaScript context；系统订阅、音频和脚本创建的长期任务需要由脚本管理，在不再需要时解除订阅或停止。

## 视图与导航

| 接口或操作 | 行为 |
| --- | --- |
| `ui.render(viewOrFactory)` | 立即校验和编译；成功后选择 UI，返回布尔值；空数组也是有效提交 |
| `ui.show()` | 显示已经成功提交的界面；没有有效界面时返回 `false` |
| `ui.hide()` | 显示 Console，保留 UI 定义、signal、日志和全屏偏好 |
| `ui.refresh()`、signal 更新 | 合并刷新，不主动切换视图；UI 隐藏时只记录待更新状态 |
| `ui.showHeader(false)` | 隐藏 UI 顶栏；Console 顶栏仍然显示 |
| `script.reload()`、运行页重载按钮 | 替换运行页，重新执行本次文件名和源码快照，包括尚未保存的代码 |
| `script.exit()` | 离开运行器，返回来源页面 |
| 返回操作 | 依次退出当前对话框、从 UI 返回 Console、从 Console 返回来源页面 |
| 轻点 Console 内容 | 本次运行提交过有效 UI 时，恢复该界面 |

对话框打开时，显式 `render` 只改变对话框关闭后的视图，不会抢占对话框。此时调用重载或退出，会先取消对话框，再在来源运行页恢复后执行导航。

提交成功表示定义已被运行器接受，不保证屏幕已经完成绘制。失败的 `render` 保留上一份有效定义和画面；下一次有效控件操作、显式 `render` 或重载可清除错误提示，已有日志继续保留。布局、控件、signal 和滚动方法详见 [UI 接口参考](ui-api.md)。

## Console

`console.log`、`info`、`warn`、`error` 接受多个参数；`console.clear()` 清空日志。`error` 是日志级别，不会自动切换视图或退出脚本。

| 项目 | 上限或行为 |
| --- | --- |
| 日志条数 | 最近 64 条 |
| 日志总字符数 | 6144 |
| 单条日志 | 1024 个字符 |
| 最后错误摘要 | 单独保留最多 512 个字符 |
| 超限处理 | 淘汰最旧记录，并显示省略数量 |

对象预览限制层级、成员数和字符数，能够处理循环引用。Console 隐藏时不向页面发布日志文本，也不安排日志刷新定时器；显示时合并更新，不强制跟随滚动。

运行器捕获编译错误、同步主体异常、顶层返回的 Promise 或 thenable 拒绝、UI 回调异常及界面编译提交错误。未返回的 Promise 链和任意原生回调不属于全面捕获范围，需要脚本自行处理。

## script 对象

| 成员 | 用途 |
| --- | --- |
| `script.name` | 当前脚本名称 |
| `script.canUse(capability)` | 按原生名称查询设备能力，例如 `@system.device.getInfo` |
| `script.locale()` | 返回 `language` 和 `countryOrRegion` |
| `script.toast(message, duration)` | 显示提示，持续时间范围为 1500–10000 毫秒 |
| `script.reload()`、`script.exit()` | 重载或退出，行为见上表 |
| `script.data`、`script.config` | 分别保存脚本数据和设置 |

两个存储对象都提供 `get(key, fallback)`、`set(key, value)`、`delete(key)`、`clear()`、`all()`，均返回 Promise。单值和每个存储区不设固定字节上限，实际容量取决于可用存储和内存。

存储按实际文件名隔离；重命名脚本时迁移数据与设置，删除脚本时一并清除。已有 `.ui.js` 文件的数据身份保持不变。可保存值、错误处理和示例见[脚本数据与设置](../guide/script-storage.md)；手机端编辑使用独立的[数据同步扩展](../protocols/script-storage.md)。

## 标准对话框

五个方法均返回 `Promise<{action, value}>`。`action` 为 `confirm`、`secondary` 或 `cancel`；正常取消得到 `{action: 'cancel', value: null}`，不是异常。判断用户操作时应检查 `action`，因为空字符串、`0` 和 `false` 都可能是有效结果。

公共参数为 `title`、`message`、`confirmText`、`cancelText`。初值使用 `value`，选项集合使用 `items`。

| 方法 | 专用参数 | 确认后的 value |
| --- | --- | --- |
| `dialog.alert()` | 无 | `null` |
| `dialog.confirm()` | `secondaryText` 可增加第二业务操作 | `null`，根据 `action` 判断选择 |
| `dialog.text()` | `value`、`placeholder`、`required`、`minLength`、`maxLength`、`language: 'en' / 'cn'` | 字符串，不自动去除首尾空白 |
| `dialog.number()` | `value`、`required`、`min`、`max`、`decimals` | 有限数值；允许空值且没有输入时为 `null` |
| `dialog.select()` | `items`、`value`、`multiple`、`minSelected`、`maxSelected` | 单选为原始值，多选为按选项顺序排列的数组 |

文本输入默认 `maxLength` 为 64，最大可设置为 8000。超长初值会报告参数错误。输入法的组合长度和最终字段长度相互独立；长文本采用窗口显示和计数，支持基本的中间编辑。

数字输入默认允许 6 位小数，`decimals` 可设为 0–10；0 表示整数。支持负数和输入过程中的不完整数字，确认时才校验范围与精度。初值绝对值须小于 `1e15`，整数部分最多 15 位；输入值不会被自动取整或夹到边界。

选项最多 100 项，每项格式为 `{label, value, description?, disabled?}`。`value` 只能是字符串、有限数值或布尔值，且必须唯一。初值须匹配可用选项。单选默认要求选择 1 项；多选默认允许 0 项，最多 100 项。禁用项不能被选择。

同一时间只允许一个对话框，不提供嵌套、队列、多字段表单或任意布局。结果在来源页面恢复显示后交付。

| 错误 code | 条件 |
| --- | --- |
| `DIALOG_INVALID` | 参数或初值无效 |
| `DIALOG_BUSY` | 已有对话框 |
| `DIALOG_OPEN_FAILED` | 原生打开操作抛错 |
| `DIALOG_INACTIVE` | 来源运行页已退出，或正在重载、退出 |

```js
async function main() {
  const answer = await dialog.confirm({
    title: '保存修改？',
    confirmText: '保存',
    secondaryText: '不保存',
    cancelText: '继续编辑'
  });
  console.log(answer.action);
}
return main();
```

## 系统接口与运行契约

`system` 提供设备信息、文件、网络、屏幕、电池、传感器、媒体等原生模块，保留对象参数以及 `success`、`fail`、`complete` 等原生调用方式，不统一转换成 Promise。先检查可选能力，并处理实际调用失败；名称映射与方法说明见[系统接口指南](../guide/system-api.md)。

根目录的 [runtime-contract.json](../../runtime-contract.json) 是公开方法、长度限制和 UI 性能建议的构建期来源。构建脚本将其同步到设备常量与云端插件，设备运行时不解析本文。`sourceBytes`、`ui.textCharacters`、`ui.titleCharacters` 为 0 表示不设固定长度上限。超过 48 KiB 的脚本在进入设备编辑器前显示确认提醒，确认后仍可编辑。

AI 生成请求和响应携带 `runtimeContract` 标识，当前为 `jslab-unified-open-ui`。服务端在预留额度和调用模型前检查标识，客户端也校验返回值；不匹配时返回明确错误，不根据安装包版本猜测接口能力。接口扩展与持久化变更应保留旧脚本已有的参数、返回值和数据格式。
