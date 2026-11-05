# 下载与上传文件

> 最低支持版本：JSLab 2.0.0。本页的下载、上传、进度监听和取消接口均适用；仍需设备固件支持。

`system.download` 和 `system.upload` 用于脚本自己与服务器传输文件。它们不等同于首页的云空间上传、下载按钮，也不会自动使用 JSLab 的云服务网络桥接。

## 下载分为开始和完成两步

`download.start()` 成功时得到的是任务 `token`。再把这个 token 传给 `download.wait()`，等待实际下载完成，才能取得文件 `uri`。

```js
const supported = script.canUse('@system.request.download') &&
  script.canUse('@system.request.onDownloadComplete');

if (supported) {
  const failed = (message, code) => console.error('下载失败', code, message);
  system.download.start({
    url: 'https://example.com/note.txt',
    filename: 'note.txt',
    success: task => system.download.wait({
      token: task.token,
      success: result => console.log('下载完成，文件地址', result.uri),
      fail: failed
    }),
    fail: failed
  });
} else {
  console.log('当前设备未确认支持下载任务。');
}
```

示例地址需要替换成真实文件地址。`start` 的必需参数是 `url`，可选 `filename` 和请求头 `header`。开始任务的失败和等待完成的失败都要处理。

下载结果通常位于缓存目录。需要长期保留时，在成功后通过 [文件接口](files.md) 复制或移动到自己的持久文件位置。不要在收到 token 时就认为文件已经可用。

## 上传本地文件

先准备可读取的本地文件和接收上传的服务器。下面的地址和文件路径都是示例，需要按自己的环境替换。

```js
if (script.canUse('@system.uploadtask.uploadFile')) {
  const task = system.upload.file({
    url: 'https://example.com/upload',
    filePath: 'internal://files/my-jslab-note.txt',
    name: 'file',
    timeout: 15000,
    success: response => console.log('上传响应', response.statusCode, response.data),
    fail: (message, code) => console.error('上传失败', code, message)
  });

  ui.render([
    ui.text('上传请求已发起，请查看日志中的结果。'),
    ui.button('取消上传', () => task.abort(), { id: 'cancel-upload' })
  ]);
}
```

| 参数 | 含义 |
| --- | --- |
| `url` | 接收文件的服务器地址 |
| `filePath` | 本地文件地址 |
| `name` | 服务端接收文件时使用的表单字段名 |
| `header`、`formData` | 可选请求头和附加表单数据 |
| `timeout` | 可选超时时间，单位为毫秒 |

成功结果包含 `statusCode`、`data`、`headers`。注意这里的状态字段是 `statusCode`，与 `system.http.request` 的 `code` 不同；还需按服务器约定判断文件是否被接受。

## 进度和取消

`upload.file()` 返回上传任务对象。用 `task.onProgressUpdate(callback)` 监听，回调包含 `progress`、`totalBytesSent`、`totalBytesExpectedToSend`。

取消监听使用 `task.offProgressUpdate(callback)`；不传 callback 时移除该任务的全部进度监听。`task.abort()` 中断上传。结束操作时清理监听，不要在每次进度变化时重新建立上传任务。

## 失败后怎样继续

保留本地原文件，检查网络、文件地址和服务器要求，再让用户决定是否重试。上传或下载成功前，不要删除唯一的源文件。设备不支持任务接口时，应明确提示，不能把请求失败当作空文件。

接口与支持明细：[下载任务](https://iot.mi.com/vela/quickapp/zh/features/network/request.html)、[上传任务](https://iot.mi.com/vela/quickapp/zh/features/network/uploadtask.html)。
