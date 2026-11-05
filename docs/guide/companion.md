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
| `connection.send` | `data` 为消息对象；成功和失败回调 | 返回消息发送结果；业务结果由对端应答 |

诊断默认最多等待 10000 毫秒，可返回超时、对端未安装和连接错误等状态。双方通过约定的消息格式和应答方式实现业务通信。

## 共享连接需要注意什么

连接对象提供 `onmessage`、`onopen`、`onclose`、`onerror` 等回调属性，同一个连接共用这些回调。

JSLab 使用这个连接处理文件同步和云服务桥接。覆盖接收回调会替换现有的消息处理函数，影响这些功能。开发自定义通信时，应在配套应用中统一设计消息分发，并验证它与 JSLab 同步功能的协作。

## 独立应用的配套要求

将脚本 [打包为独立应用](rpk-guide.md) 后，使用新应用的身份通信。与小米配套应用连接时，设备端与手机端需使用匹配的包名和签名。

接口与匹配条件：[小米设备通信文档](https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html)。
