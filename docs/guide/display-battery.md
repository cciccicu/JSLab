# 屏幕、电量与振动

> 最低支持版本：JSLab 2.0.0。调用亮度、常亮、电量与振动接口前，使用 `script.canUse()` 查询设备支持。

本页介绍三个常用对象：`system.display` 调整屏幕，`system.battery` 读取电量，`system.vibration` 提供振动反馈。先检查对应能力，再处理调用失败。

## 读取亮度

```js
if (script.canUse('@system.brightness.getValue')) {
  system.display.getValue({
    success: result => console.log('当前亮度', result.value),
    fail: (message, code) => console.error('读取亮度失败', code, message)
  });
}
```

| 方法 | 参数或返回值 |
| --- | --- |
| `getValue` | 成功结果的 `value` 为 0–255 |
| `setValue` | 传入整数 `value`，范围为 0–255 |
| `getMode` | 成功结果的 `mode`：0 为手动，1 为自动 |
| `setMode` | 传入 `mode: 0` 或 `mode: 1` |
| `setKeepScreenOn` | 传入 `keepScreenOn: true` 开启常亮，`false` 解除 |

这些方法使用对象参数，支持成功和失败回调。调整亮度或开启常亮前，应让用户知道将改变什么；用完后恢复之前的亮度设置或解除常亮，避免长期耗电。常亮状态可能也被 JSLab 的其他功能使用，不要在高频刷新中反复设置。

## 读取电量

```js
if (script.canUse('@system.battery.getStatus')) {
  system.battery.getStatus({
    success: result => {
      console.log('电量', Math.round(result.level * 100) + '%');
      console.log(result.charging ? '正在充电' : '未在充电');
    },
    fail: (message, code) => console.error('读取电量失败', code, message)
  });
} else {
  console.log('这台设备暂不支持脚本读取电量。');
}
```

`level` 是 0–1 的比例，乘以 100 即为电量百分比；`charging` 是布尔值。设备未提供此接口时，显示“电量信息不可用”。

## 提供短振动反馈

```js
if (script.canUse('@system.vibrator.vibrate')) {
  system.vibration.vibrate({ mode: 'short' });
}
```

`mode` 可以是 `short` 或 `long`。适合在明确的用户操作后提示，不要放进频繁刷新的界面函数或传感器回调中。

接口与支持明细：[屏幕亮度](https://iot.mi.com/vela/quickapp/zh/features/system/brightness.html)、[电量](https://iot.mi.com/vela/quickapp/zh/features/system/battery.html)、[振动](https://iot.mi.com/vela/quickapp/zh/features/system/vibrator.html)。
