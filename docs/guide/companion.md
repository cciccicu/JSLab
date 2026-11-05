# 与配套应用通信

> 最低支持版本：JSLab 2.0.0。本页的连接查询、诊断、消息和连接回调均适用；还需设备固件与配套应用支持互联。

`system.companion` 对应小米的 Interconnect 通信接口。它用于设备应用与匹配的配套应用交换消息。普通脚本同步和云服务桥接已经由 JSLab 处理；只需要这些功能时，按照 [同步使用指南](sync-guide.md) 操作即可。

## 取得连接并查询状态

```js
if (script.canUse('@system.interconnect.instance')) {
  const connection = system.companion.instance();
  connection.getReadyState({
    success: result => {
      console.log(result.status === 1 ? '配套端已连接' : '配套端未连接');
    },
    fail: (message, code) => console.error('查询连接失败', code, message)
  });
}
```

`instance()` 同步返回连接对象。`getReadyState()` 在成功回调中返回 `status`：1 表示已连接，2 表示断开。

## 诊断与发送消息

| 方法 | 主要参数 | 结果 |
| --- | --- | --- |
| `connection.diagnosis` | 可选 `timeout`，单位为毫秒；成功和失败回调 | `status: 0` 表示诊断成功；其他状态需按结果处理 |
| `connection.send` | `data` 为消息对象；成功和失败回调 | 发送结果，不等于对端业务已经完成 |

诊断默认最多等待 10000 毫秒。常见诊断状态还包括超时、对端未安装和其他连接错误。发送消息前，需要先与配套应用约定数据格式和应答方式；任意发送一个对象不会自动变成同步器的新功能。

## 共享连接需要注意什么

连接对象提供 `onmessage`、`onopen`、`onclose`、`onerror` 等回调属性，它们不是每个脚本独立的一组监听。

JSLab 本身正在使用这个连接处理文件同步和云服务桥接。直接覆盖接收回调可能让这些功能停止工作，因此普通脚本不要自行接管连接。需要完整自定义通信时，应把它作为配套应用开发的一部分设计，并验证与宿主功能的关系。

## 独立应用的配套要求

将脚本 [打包为独立应用](rpk-guide.md) 后，应用身份也发生变化。若使用小米配套应用通信，需要设备应用与手机应用满足相同包名和签名等匹配要求，不能假定它会继续连接原来的 JSLab 同步器。

接口与匹配条件：[小米设备通信文档](https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html)。
