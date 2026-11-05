# 云端兼容代理

Vela 客户端可以直接使用 `@system.fetch` 访问云端，也可以经由 Android 同步器或 AstroBox 转发。用户选择保存在设备设置中；能力检测只决定默认值，不覆盖已保存的选择。代理仅负责 HTTP 请求和响应，设备账户、令牌与业务错误仍由 Vela 客户端处理。

## 客户端版本

新版 JSLab 的每次云端请求都在 URL 查询参数中携带 `jslabVersion`（manifest.versionName）与 `jslabVersionCode`（manifest.versionCode），包括配对、市场、文件与 AI 请求。已有查询参数继续保留，例如：

```text
/api/cloud/device/market?mine=1&jslabVersion=2.0.6&jslabVersionCode=2061
```

代理原样转发 URL，沿用现有请求头白名单。云端将缺省版本视为旧客户端，按版本选择兼容能力，并独立校验访问令牌。版本参数只附加到 JSLab 云服务请求。

## 消息与返回值

代理沿用 Interconnect v2 RPC 信封，操作名为 `cloudProxy`。请求 ID 用于匹配并发响应；超时或断线后到达的响应不再交付给原请求。

| 请求 payload 字段 | 含义 |
| --- | --- |
| `url` | 手环已解析好的完整云端 URL，最多 2048 个 UTF-8 字节 |
| `method` | `GET`、`POST`、`PUT` 或 `DELETE`，缺省为 `GET` |
| `headers` | 可选对象，只接受 `Authorization`、`Content-Type`、`Accept`，名称不区分大小写 |
| `body` | UTF-8 文本，缺省为空字符串 |

请求头最多 3 项，每项值最多 1024 个 UTF-8 字节，不允许回车或换行。响应结果包含 HTTP `status`、`headers['content-type']` 和 UTF-8 文本 `body`。非成功 HTTP 状态也会返回给设备，由设备解释云端业务错误；网络失败和无法解码的响应通过 RPC 错误返回。

设备令牌只随当前请求传递。配套端不持久化、显示或记录 `Authorization` 内容；关闭代理不影响本地脚本同步。

## 大小与等待期限

普通接口保留请求体 64 KiB、响应体 128 KiB 的检查。携带脚本源码的接口不设代理层固定正文长度上限，包括云文件、市场提交、市场源码和 AI 生成。识别规则支持 `/api/cloud/` 及其 `device/` 前缀；实际可用大小仍受设备内存、互联传输和服务端配置影响。

Vela RPC 层普通请求等待 20 秒，AI 生成等待 330 秒。超时后云端任务仍可能继续执行，任务状态和计费结果以云端记录为准；客户端根据业务请求标识和云端结果处理重试。

AstroBox 使用 WASI HTTP 客户端 `waki`，连接超时为 10 秒。Android 使用 OkHttp，连接超时为 10 秒，读取及整个调用期限为 330 秒，并关闭自动重定向。两个实现保留各自网络库的行为，共用请求字段、正文大小规则与返回格式。

## 实现位置

- Vela：`vela-quickapp/src/utils/cloud/cloudTransport.js` 选择传输方式，`bridge/companionBridge.js` 管理 RPC 等待和断线清理。
- AstroBox：`astrobox-plugin-sync/src/lib.rs` 中的 `cloud_proxy_request` 和 `forward_cloud_request`。
- Android：`android-sync/app/src/main/java/icu/ccicc/jslab/sync/data/CloudProxy.kt`。

接口升级应保留已有消息字段和语义。修改源码接口识别规则时，同时核对两种配套端的兼容性测试。
