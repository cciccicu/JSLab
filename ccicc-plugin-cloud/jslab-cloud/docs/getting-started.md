# 快速开始

JSLab 是小米 Vela 手环上的 JavaScript 实验环境。你可以在手环上编写和运行脚本，也可以通过网页管理云端文件、从 JS 市场获取示例。

## 创建第一个脚本

1. 在手环打开 JSLab，进入工作区并新建 `hello.js`。
2. 输入下面的代码，点击运行。
3. 返回编辑器后点击保存，将代码写入本地文件。

```js
console.log('你好，JSLab！');
console.log('当前脚本：', script.name);
```

运行会使用编辑器当前内容，保存是独立操作。未保存的修改也可以运行。

## 显示交互界面

所有 `.js` 文件都可以使用 `console`、`ui`、`dialog`、`script` 和 `system`。已有 `.ui.js` 文件仍能运行，文件名不决定可用 API。

```js
const count = ui.signal(0);
ui.render(() => ui.column([
  ui.heading('我的计数器'),
  ui.text(String(count.get()), { lines: 1 }),
  ui.button('增加', () => count.update(value => value + 1), { id: 'add' })
], { padding: 12, gap: 12 }));
```

`ui.render()` 成功后显示界面。在 UI 中返回可查看日志，轻点日志可恢复界面，状态保留。右上重载按钮重新执行本次代码，`script.exit()` 退出运行页。

## 使用对话框

对话框返回 Promise；结果通过 `action` 判断，取消也是正常结果。脚本主体不支持裸顶层 `await`，使用异步函数并返回它的 Promise。

```js
async function main() {
  const answer = await dialog.text({ title: '你的名字', required: true });
  if (answer.action === 'confirm') console.log('你好，', answer.value);
}
return main();
```

完整参数见 [统一脚本 API](runtime-api.md)，布局和组件见 [UI API](ui-api.md)。

## 连接云空间

1. 在手环的云设置中发起配对，取得配对码或二维码。
2. 登录 JSLab Cloud 网页，在云空间的“设备管理”中输入配对码，或扫描二维码确认。
3. 返回手环，等待配对完成。
4. 在网页“充值与激活”中兑换有效激活码后，即可使用云空间和 AI。

配对不要求激活。云空间保存当前文件内容，上传、下载由你主动发起，不会自动同步。市场浏览、下载无需登录或激活；网页发布要求登录，手环发布要求设备配对。

## 继续阅读

- [云空间与 JS 市场](cloud-guide.md)：管理文件、发布脚本、使用 AI 与处理常见问题。
- [统一脚本 API](runtime-api.md)：日志、视图切换、对话框、数据存储和系统接口。
- [UI API](ui-api.md)：布局、组件、状态更新与性能建议。
