# 传感器与定位

> 最低支持版本：JSLab 2.0.0。本页的传感器与定位接口均适用；可用传感器、定位和授权由设备固件决定。

`system.sensors` 读取设备传感器，`system.location` 读取位置。型号、系统版本和授权会影响可用性；即使设备有相关硬件，也要检查接口支持。

## 读取一次加速度

加速度接口使用订阅回调。下面的例子在收到第一份数据后取消订阅，适合先确认接口是否工作。

```js
if (script.canUse('@system.sensor.subscribeAccelerometer') &&
    script.canUse('@system.sensor.unsubscribeAccelerometer')) {
  system.sensors.subscribeAccelerometer({
    interval: 'normal',
    callback: value => {
      system.sensors.unsubscribeAccelerometer();
      console.log('加速度', value.x, value.y, value.z);
    },
    fail: (message, code) => console.error('订阅失败', code, message)
  });
}
```

`interval` 可设为 `normal`、`ui`、`game`。它们代表不同的回调频率，普通信息展示优先从 `normal` 开始；不要为了让界面更流畅而无条件选择最高频率。

## 其他传感器及停止方法

| 开始监听 | 回调中的常用字段 | 停止监听 |
| --- | --- | --- |
| `subscribeAccelerometer` | `x`、`y`、`z` | `unsubscribeAccelerometer()` |
| `subscribePressure` | `pressure`，单位为百帕（hPa） | `unsubscribePressure()` |
| `subscribeCompass` | `direction`、`accuracy` | `unsubscribeCompass()` |

订阅参数使用 `callback`，加速度和罗盘接口还提供 `fail`。罗盘方向以弧度表示，不是角度：朝北约为 0，朝南约为 π。`accuracy` 表示可信度，不能把低可信度的读数当成精确方向。

## 读取当前位置

```js
if (script.canUse('@system.geolocation.getLocation')) {
  system.location.getLocation({
    timeout: 15000,
    success: position => console.log('位置', position.latitude, position.longitude),
    fail: (message, code) => console.error('定位失败', code, message)
  });
} else {
  console.log('当前设备未确认支持定位接口。');
}
```

`timeout` 的单位是毫秒，未填写时默认 30000。成功结果可包含经纬度、`altitude`（米）、`speed`（米/秒）、`accuracy`，以及较详细的 `accuracyInfo`。使用某个字段前考虑设备是否提供。

接口不支持和定位超时是不同情况。超时后不要用零坐标代替真实位置，也不要假定用户仍处在上次位置。

## 持续监听位置

`system.location.subscribe({ callback, fail })` 监听位置变化，结束时调用 `system.location.unsubscribe()`。重复订阅可能替换已有回调。

持续采集时提供明确的开始、停止操作，并限制持续时间。在停止操作中取消订阅后，再退出脚本；不能依赖切换到日志就自动停止。

## 把读数显示得更清楚

高频回调可以先更新普通变量，再按较低频率刷新界面。避免在每次传感器变化时输出长日志、写文件或重新建立订阅。需要长期保存时，先整理成较小的记录，再使用 [脚本数据存储](script-storage.md)。

接口与支持明细：[传感器](https://iot.mi.com/vela/quickapp/zh/features/system/sensor.html)、[地理位置](https://iot.mi.com/vela/quickapp/zh/features/system/geolocation.html)。
