# 设备接口使用说明

> 最低支持版本：JSLab 2.0.0。调用前通过 `script.canUse()` 查询当前设备支持的接口，涉及权限的功能按设备提示授权。

需要读取设备信息、保存文件、联网或使用传感器时，可以通过 `system` 调用设备接口。本章按照编写 JSLab 脚本的方式重新整理了小米文档：直接使用已经提供的对象，不需要写模块导入、应用清单或页面生命周期。

## 先检查设备能力

同一个接口在不同型号或系统版本上可能不可用。能力查询使用**小米原始接口名称**，实际调用则使用 JSLab 中的对象名称。

```js
if (script.canUse('@system.device.getInfo')) {
  system.device.getInfo({
    success: info => console.log('设备型号', info.model),
    fail: (message, code) => console.error('读取设备信息失败', code, message)
  });
} else {
  console.log('当前环境未确认支持设备信息查询。');
}
```

`script.canUse()` 返回布尔值，用于选择当前设备支持的功能。调用结果由成功或失败回调返回，授权不足、网络错误等问题在失败回调中处理。

## 理解三种返回方式

| 类型 | 在哪里取得结果 | 例子 |
| --- | --- | --- |
| 一次性异步请求 | `success(result)`，失败时 `fail(message, code)` | 设备信息、文件读取、网络请求 |
| 持续监听 | 每次变化时触发 `callback(result)` | 传感器、位置、网络类型 |
| 同步调用 | 方法直接返回结果 | 摘要、Base64、获取通信连接对象 |

部分一次性请求还接受 `complete`，在成功或失败处理结束后调用。订阅接口使用各自文档列出的回调参数。

JSLab 保留原生接口的回调方式。需要用 `await` 顺序等待时，可以将回调包装为 Promise：

```js
async function main() {
  if (!script.canUse('@system.device.getInfo')) return;
  const info = await new Promise((resolve, reject) => {
    system.device.getInfo({
      success: resolve,
      fail: (message, code) => reject(new Error('读取失败：' + code + ' ' + message))
    });
  });
  console.log(info.model);
}

return main().catch(error => console.error(error.message));
```

## JSLab 名称与小米接口的对应关系

脚本中使用左侧的 `system` 对象调用接口；右侧名称用于能力查询和查阅官方文档。

| JSLab 写法 | 小米原始接口 | 本指南 |
| --- | --- | --- |
| `system.device` | `@system.device` | [设备信息](device-info.md) |
| `system.files` | `@system.file` | [文件读写](files.md) |
| `system.display` | `@system.brightness` | [屏幕、电量与振动](display-battery.md) |
| `system.battery` | `@system.battery` | [屏幕、电量与振动](display-battery.md) |
| `system.vibration` | `@system.vibrator` | [屏幕、电量与振动](display-battery.md) |
| `system.http.request` | `@system.fetch.fetch` | [网络请求](http.md) |
| `system.network` | `@system.network` | [网络状态](http.md) |
| `system.download.start` | `@system.request.download` | [文件传输](file-transfer.md) |
| `system.download.wait` | `@system.request.onDownloadComplete` | [文件传输](file-transfer.md) |
| `system.upload.file` | `@system.uploadtask.uploadFile` | [文件传输](file-transfer.md) |
| `system.companion` | `@system.interconnect` | [配套应用通信](companion.md) |
| `system.sensors` | `@system.sensor` | [传感器与定位](sensors-location.md) |
| `system.location` | `@system.geolocation` | [传感器与定位](sensors-location.md) |
| `system.audio` | `@system.audio` | [音频与录音](media.md) |
| `system.recorder` | `@system.record` | [音频与录音](media.md) |
| `system.crypto` | `@system.crypto` | [摘要、编码与事件](crypto-events.md) |
| `system.events` | `@system.event` | [摘要、编码与事件](crypto-events.md) |

例如检查文件读取时写 `script.canUse('@system.file.readText')`，调用时写 `system.files.readText(...)`。提示消息优先使用 `script.toast()`，按键存储使用 `script.data` 和 `script.config`。

## 权限与应用范围

脚本使用 JSLab 应用在 manifest 中声明的能力，本章列出可以直接调用的接口。扩展系统模块时，需要修改并重新构建设备端应用。

位置、设备标识等功能需要对应的设备能力和授权。脚本运行在 JSLab 应用环境内，共享应用权限以及原生文件、音频和通信资源。

## 为持续任务设计结束操作

为订阅提供取消操作，为录音设置时长，为音频提供停止操作。将这些清理步骤放进脚本的结束流程。

本指南只整理脚本可直接使用的接口。需要进一步核对某个设备的支持明细时，可查看各页末尾链接的小米官方文档。
