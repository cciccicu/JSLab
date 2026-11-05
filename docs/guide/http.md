# 网络请求与连接状态

> 最低支持版本：JSLab 2.0.0。本页的请求参数、网络查询和网络订阅均适用；实际连接能力取决于设备固件与网络。

`system.http.request()` 通过设备原生网络能力向服务器请求数据，对应小米的 `fetch.fetch()`。

## 发送一次请求

下面的 `example.com` 地址仅用于说明写法，请替换为你准备使用的接口。只有服务器实际提供相应数据时，脚本才能得到预期结果。

```js
if (script.canUse('@system.fetch.fetch')) {
  system.http.request({
    url: 'https://example.com/api/status',
    method: 'GET',
    responseType: 'json',
    success: response => {
      if (response.code < 200 || response.code >= 300) {
        console.error('服务器返回状态', response.code);
        return;
      }
      console.log('结果', response.data);
    },
    fail: (message, code) => console.error('请求失败', code, message)
  });
}
```

`success` 返回 HTTP 响应。先检查 `response.code`，再按目标服务的格式读取 `response.data`；连接失败等传输错误由 `fail` 处理。

## 请求参数与响应字段

| 请求参数 | 用途 |
| --- | --- |
| `url` | 完整的请求地址，必填 |
| `method` | 请求方法，默认 `GET`，也可使用 `POST`、`PUT`、`DELETE` 等 |
| `header` | 请求头对象，字段名是单数 `header` |
| `data` | 请求数据，可以是字符串、对象或 ArrayBuffer |
| `responseType` | 指定 `text`、`json`、`file` 或 `arraybuffer` |
| `success`、`fail`、`complete` | 处理完成结果、失败和结束 |

成功结果包含 `code`、`data`、`headers`，响应头字段是复数 `headers`。指定 `responseType: 'json'` 后按对象读取；指定 `text` 时读取字符串；指定 `file` 时，`data` 是临时文件地址。

## 发送 JSON 数据

发送 JSON 时，明确设置请求头，并把对象序列化成字符串：

```js
if (script.canUse('@system.fetch.fetch')) {
  system.http.request({
    url: 'https://example.com/api/counter',
    method: 'POST',
    header: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ count: 3 }),
    responseType: 'json',
    success: response => console.log('HTTP 状态', response.code, response.data),
    fail: (message, code) => console.error('提交失败', code, message)
  });
}
```

普通对象通常按表单方式编码。发送 JSON 时，先用 `JSON.stringify()` 序列化，再设置对应的 `Content-Type`。请求地址、字段和鉴权方式以目标接口为准。

## 查询网络类型

`system.network.getType({ success, fail })` 的结果字段为 `type`，可能是 `wifi`、`bluetooth`、`none`、移动网络类型或其他值。

监听变化使用 `system.network.subscribe({ callback, fail })`，`callback` 同样收到含 `type` 的对象。用完后调用 `system.network.unsubscribe()`；重复订阅可能替换之前的监听。

网络类型用于显示当前连接方式；请求是否成功通过 `success` 和 `fail` 判断。

## 将结果显示在界面中

把请求放在按钮回调或初始化步骤中，收到结果后修改 `ui.signal`。`ui.render` 的界面生成函数会随刷新重复执行，适合读取状态并生成界面描述。

等待期间设置忙碌状态，防止连续点击重复提交。较大的结果只保留和显示需要的字段，长列表分批展示。

接口与支持明细：[数据请求](https://iot.mi.com/vela/quickapp/zh/features/network/fetch.html)、[网络信息](https://iot.mi.com/vela/quickapp/zh/features/system/network.html)。
