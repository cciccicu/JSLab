# 云端兼容代理

支持 `system.fetch` 的设备直接访问配置的云端地址。没有 `fetch` 时，Vela
应用通过 Interconnect 发送 `cloudProxy` 请求，AstroBox 使用运行时提供的
WASI HTTP 客户端 `waki` 转发，并返回 HTTP 状态码、内容类型和 UTF-8 响应体。

手环拥有设备 Token。AstroBox 只在当前请求期间读取 `Authorization` 请求头，
不会保存、显示或写入日志。代理转发手环提供的 URL，允许 `GET`、`POST`、`PUT`
和 `DELETE`，只接受 `Authorization`、`Content-Type` 和 `Accept` 请求头，并限制
请求、响应和 URL 大小。

`waki` 提供 10 秒连接超时，Vela RPC 层提供 20 秒用户可见响应超时，并忽略迟到的
响应。请求之间不互相阻塞，某个上游请求延迟不会让后续请求被错误地判定为忙碌。
本地脚本和字体管理与云同步相互独立。
