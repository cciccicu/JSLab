# 设备接口使用说明

> 最低支持版本：本章列出的 `system` 接口和 `script.canUse()` 均由 JSLab 2.0.0 及以上提供。实际可用性仍取决于设备型号、固件和授权，应用版本达标不代表所有接口都可调用。

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

`script.canUse()` 返回布尔值。检查通过后，仍可能因为授权、网络或设备当时的状态而失败，因此不要省略错误处理。较旧系统的能力查询本身也可能不可用，返回 `false` 不应当被解释成所有设备上的永久结论。

## 理解三种返回方式

| 类型 | 在哪里取得结果 | 例子 |
| --- | --- | --- |
| 一次性异步请求 | `success(result)`，失败时 `fail(message, code)` | 设备信息、文件读取、网络请求 |
| 持续监听 | 每次变化时触发 `callback(result)` | 传感器、位置、网络类型 |
| 同步调用 | 方法直接返回结果 | 摘要、Base64、获取通信连接对象 |

不少一次性请求还接受 `complete`，表示成功或失败处理结束。具体字段以各方法说明为准；订阅接口不一定有相同的回调参数。

JSLab 保留原生调用方式，不统一包装成 Promise。对话框和 `script.data` 的 `await` 用法不能直接套到所有系统接口上。如果希望按顺序等待，可以自己包装回调：

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

下表右侧用于阅读官方文档和构造能力查询名称，不是让你在脚本里导入这些模块。

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

设备接口使用 JSLab 应用已经声明的能力。脚本不能通过另写一个 `manifest.json` 给已安装的 JSLab 增加权限，也不能假定官方文档列出的全部模块都已提供。

位置、设备标识等接口还受设备支持和授权影响。脚本处在 JSLab 应用环境内，不是每个脚本一个独立安全沙箱；原生文件、音频和通信对象可能与应用其他功能共享。

## 为持续任务设计结束操作

使用订阅时，同时找到对应的取消方法；使用录音时设置合理时长；使用音频时提供停止操作。切换日志、退出页面和重新运行不应代替原生资源的释放。

本指南只整理脚本可直接使用的接口。需要进一步核对某个设备的支持明细时，可查看各页末尾链接的小米官方文档。
