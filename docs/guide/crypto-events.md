# 摘要、编码与公共事件

> 最低支持版本：JSLab 2.0.0。本页的摘要、Base64、密码算法与公共事件接口均适用；仍需通过能力查询确认设备固件支持。

本页收录两个相对独立的能力：`system.crypto` 处理摘要和编码，`system.events` 订阅或发送公共事件。两者都需要设备支持，不是所有手环型号都提供。

## 计算内容摘要

摘要可以用来比较内容是否变化。`hashDigest` 是同步方法，直接返回字符串，不使用成功回调。

```js
if (script.canUse('@system.crypto.hashDigest')) {
  const digest = system.crypto.hashDigest({ data: 'hello', algo: 'SHA256' });
  console.log('摘要', digest);
}
```

输入可使用 `data`（字符串或 `Uint8Array`），或者用 `uri` 指向文件。`algo` 默认 `SHA256`，还支持 `MD5`、`SHA1`、`SHA512`。摘要不等于加密，也不能单凭一个普通摘要证明消息来自可信发送者。

## Base64 编码与解码

```js
if (script.canUse('@system.crypto.btoa') && script.canUse('@system.crypto.atob')) {
  const encoded = system.crypto.btoa('hello');
  console.log(encoded);
  console.log(system.crypto.atob(encoded));
}
```

`btoa` 把二进制字符串编码为 Base64，`atob` 解码。它们同步返回字符串。不要把 Base64 当成加密；含中文的文本还需要明确的字符编码转换，不能把任意 Unicode 字符直接当成单字节数据。

## 其他密码算法接口

| 方法 | 主要输入 | 成功结果 |
| --- | --- | --- |
| `hmacDigest` | `data`、`key`、可选 `algo` | 回调中的 `data` 为摘要 |
| `sign` | `data` 或 `uri`、`privateKey`、可选 `algo` | 回调中的 `data` 为签名 |
| `verify` | `data` 或 `uri`、`publicKey`、`signature`、可选 `algo` | 回调直接收到布尔值 |
| `encrypt`、`decrypt` | `data`、`key`、`algo`、可选 `options` | 回调中的 `data` 为处理结果 |

这些方法与 `hashDigest` 不同，使用 `success`、`fail` 回调。加解密支持 RSA、AES，但参数、密钥编码、模式和初始向量必须与通信对端一致。需要实际接入时，按 [小米密码算法文档](https://iot.mi.com/vela/quickapp/zh/features/security/crypto.html) 核对完整参数，不要把示例密钥作为正式密钥使用。

## 订阅和取消公共事件

`system.events.subscribe()` 返回数字订阅 ID；订阅失败可能返回 `undefined`。保留这个 ID，之后通过 `unsubscribe({ id })` 取消。

```js
if (script.canUse('@system.event.subscribe') && script.canUse('@system.event.unsubscribe')) {
  const subscriptionId = system.events.subscribe({
    eventName: 'usual.event.BATTERY_CHANGED',
    callback: event => console.log('电量事件', event.params)
  });

  if (subscriptionId !== undefined) {
    ui.render([
      ui.text('正在监听电量变化。'),
      ui.button('停止监听', () => {
        system.events.unsubscribe({ id: subscriptionId });
        script.toast('已停止监听');
      }, { id: 'stop-events' })
    ]);
  } else {
    console.error('事件订阅未成功。');
  }
}
```

数字 ID 为 0 时也可能有效，所以不要写 `if (subscriptionId)`。示例中应先点停止监听，再离开脚本。

## 发送自定义事件

`system.events.publish()` 接收 `eventName`，事件内容放入 `options.params`。系统的 `usual.event.*` 名称是保留事件，不用于自定义发布。

接收回调可包含 `params` 和发送者 `package`。公共事件可能来自其他应用，并不是每个脚本私有的消息通道；需要区分来源时检查发送者和数据结构。

接口与支持明细：[密码算法](https://iot.mi.com/vela/quickapp/zh/features/security/crypto.html)、[公共事件](https://iot.mi.com/vela/quickapp/zh/features/system/event.html)。
