# 音频播放与录音

> 最低支持版本：JSLab 2.0.0。本页的播放、录音及相关回调均适用；扬声器、麦克风和接口支持取决于设备固件。

`system.audio` 控制音频播放，`system.recorder` 负责录音。它们使用设备的原生媒体能力，不同型号差异较大，调用前应检查支持情况。

## 设置来源，再开始播放

音频来源设置在 `system.audio.src` 属性上，之后调用无参数的 `play()`。它不是 `play({ src: ... })` 这样的调用方式。

下面的示例需要先准备可播放的本地音频文件，并将路径替换成真实地址。

```js
if (script.canUse('@system.audio.play') && script.canUse('@system.audio.stop')) {
  system.audio.src = 'internal://files/sample.wav';
  system.audio.loop = false;
  system.audio.onerror = error => console.error('播放失败', error);

  ui.render([
    ui.button('播放', () => system.audio.play(), { id: 'play-audio' }),
    ui.button('停止并释放回调', () => {
      system.audio.stop();
      system.audio.onerror = null;
    }, { id: 'stop-audio' })
  ]);
} else {
  console.log('当前设备未确认支持音频播放。');
}
```

`pause()` 暂停，`stop()` 停止。需要自己控制错误回调时，在结束操作中释放它；媒体对象可能被其他功能共享，不要持续覆盖不属于自己的状态。

## 常用属性和播放状态

| 属性或方法 | 用法 |
| --- | --- |
| `src` | 音频地址 |
| `currentTime` | 当前进度，单位为秒；写入可调整进度 |
| `duration` | 时长，单位为秒；未知时可能是 `NaN` |
| `autoplay`、`loop`、`muted` | 自动播放、循环和静音开关 |
| `volume` | 0–1 的音量比例 |
| `getPlayState({ success, fail })` | 读取状态，结果含 `state`、`src`、`currentTime`、`duration` 等 |

`state` 常见值为 `play`、`pause`、`stop`。事件通过 `onplay`、`onpause`、`onstop`、`onended`、`onerror` 等属性注册，清理时设为 `null`。

## 录制一段有限时长的声音

下面的脚本请求录制 5 秒，并在完成后输出缓存文件地址。请在用户明确开始录音的场景使用。

```js
if (script.canUse('@system.record.start') && script.canUse('@system.record.stop')) {
  system.recorder.start({
    duration: 5000,
    sampleRate: 8000,
    numberOfChannels: 1,
    format: 'wav',
    success: result => console.log('录音文件', result.uri),
    fail: (message, code) => console.error('录音失败', code, message)
  });
  ui.render([
    ui.text('正在录音，最长 5 秒。'),
    ui.button('提前停止', () => system.recorder.stop(), { id: 'stop-recording' })
  ]);
} else {
  console.log('当前设备未确认支持录音。');
}
```

`duration` 使用毫秒；默认值为 0，表示不会按时长自动结束，因此通常应主动填写。`success` 表示录音完成，而不是刚开始录音。声音被其他系统功能打断时，也可能提前结束。

`sampleRate` 是采样率，`numberOfChannels` 是声道数，`format` 可选 `pcm`、`opus`、`wav`。录音结束后如需长期保留文件，按 [文件接口](files.md) 将缓存文件保存到自己的持久位置。

## 处理录音数据帧

需要流式处理时，可以设置 `frameSize` 并使用 `system.recorder.onframerecorded`。回调中的 `frameBuffer` 为 `Uint8Array`，`isLastFrame` 表示是否最后一帧。

有效的帧模式不会在成功结果中返回普通录音文件 `uri`；实际帧大小也可能由设备调整。不要同时假定必然得到完整文件和逐帧数据。结束时停止录音并释放帧回调。

接口与支持明细：[音频](https://iot.mi.com/vela/quickapp/zh/features/other/audio.html)、[录音](https://iot.mi.com/vela/quickapp/zh/features/system/record.html)。
