# 设备信息与存储容量

> 最低支持版本：JSLab 2.0.0。本页所有接口均适用；返回字段和权限要求仍取决于设备固件。

`system.device` 可以读取设备型号、屏幕信息和存储容量。多数方法接收一个包含 `success`、`fail`、`complete` 的对象，结果在回调中取得。

## 读取设备信息

```js
if (script.canUse('@system.device.getInfo')) {
  system.device.getInfo({
    success: info => {
      console.log('型号', info.model);
      console.log('屏幕', info.screenWidth, info.screenHeight);
      console.log('系统', info.osVersionName);
    },
    fail: (message, code) => console.error('读取失败', code, message)
  });
}
```

常用结果如下。部分字段只在较新的系统上提供，读取可选字段时应允许它缺失。

| 字段 | 含义 |
| --- | --- |
| `brand`、`manufacturer`、`model`、`product` | 品牌、厂商、型号和产品代号 |
| `osType`、`osVersionName`、`osVersionCode` | 系统类型和版本 |
| `platformVersionName`、`platformVersionCode`、`APILevel` | 运行平台版本与接口级别 |
| `language`、`region` | 系统语言和地区 |
| `screenWidth`、`screenHeight` | 屏幕宽度和高度 |
| `screenShape`、`deviceType` | 屏幕形状和设备类型 |

为界面组件计算宽度时，使用已扣除屏幕安全边距的 `ui.getWidth()`；嵌套布局还要扣除父容器的内边距和间距。详见 [制作交互界面](ui-api.md)。

## 查看存储空间

```js
if (script.canUse('@system.device.getAvailableStorage')) {
  system.device.getAvailableStorage({
    success: result => {
      const mib = result.availableStorage / 1024 / 1024;
      console.log('可用空间约', mib.toFixed(1), 'MiB');
    },
    fail: (message, code) => console.error('读取容量失败', code, message)
  });
}
```

`getTotalStorage()` 返回 `totalStorage`，`getAvailableStorage()` 返回 `availableStorage`，分别表示设备的总存储空间和可用存储空间，单位为字节。

## 设备标识与语言

`getDeviceId()` 的结果字段为 `deviceId`，`getSerial()` 的结果字段为 `serial`。这些标识受设备支持和授权约束，普通工具通常不需要读取，更不应把它们写入公开日志或市场作品。

只需要语言和地区时，可以同步调用 `script.locale()`，读取 `language`、`countryOrRegion`，无需为了这两个值请求全部设备信息。

接口与支持明细：[小米设备信息文档](https://iot.mi.com/vela/quickapp/zh/features/basic/device.html)。
