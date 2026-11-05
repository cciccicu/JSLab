# 脚本数据同步扩展 v1

AstroBox、Android 同步器与 Vela 端共用此扩展。所有请求和响应继续使用原有 `v: 2` RPC 信封、请求 ID 和错误响应；已有源码操作、字体能力和云代理保持原有语义。`hello` 新增可选字段 `scriptStorageProtocol: 1`，不改变 `protocol: 2`。

| 组合 | 行为 |
| --- | --- |
| 旧同步器 + 新 Vela | 忽略新增字段，原有源码同步照常工作 |
| 新同步器 + 旧 Vela | 原有源码同步照常工作；数据编辑入口禁用并提示更新 |
| 新同步器 + 新 Vela，扩展为数字 1 | 启用数据编辑 |
| 扩展缺失、格式错误或未知版本 | 禁用数据编辑，不阻止 v2 源码同步 |

数据文档是 JSON 文本，根对象必须恰好包含 `data`、`config` 两个对象。其内部键值可为任意现有 JSON 值，保留字符串、数字、布尔、数组、对象和 null；未保存过数据的脚本返回 `{"data":{},"config":{}}`。只允许访问脚本列表中存在的脚本。持久化继续使用既有脚本命名空间和文件格式，旧脚本的 `data` / `config` API 无需修改。

## 读取

首次 `storageRead` 请求为 `{name, offset: 0}`，响应为 `{name, transferId, content, nextOffset, size, done}`。`content` 是 JSON 文本的一部分，其余偏移和大小均按 UTF-8 字节计算。后续读取携带同一 `name`、`transferId` 和上次的 `nextOffset`，每块最多 4096 字节，不切断 Unicode 字符。完整文档来自首次读取时的固定快照，脚本运行期间的更新不会混入后续分块。最后一块后释放会话。

客户端保留完整原始 JSON 文本作为 `base`，用于保存冲突检查；用户编辑的 JSON 文本作为 `content`。仅重新读取会替换这个原始快照。

## 保存

1. 将 `{base, content}` 序列化为 JSON，其中两个字段都是完整文档的**字符串**。原始快照也使用分块传输，避免大数据使开始请求超长。
2. `storageWriteStart` 请求 `{name, size}`，`size` 是以上完整传输文本的 UTF-8 字节数；响应 `{transferId}`。
3. 按顺序发送 `storageWriteChunk`：`{transferId, index, content}`，`index` 从 0 开始，每块最多 4096 UTF-8 字节。响应 `{bytes, nextIndex}` 确认累计字节数和下一分块编号。
4. `storageWriteFinish` 请求 `{transferId}`。Vela 校验完整性、JSON 结构、脚本仍存在、未被手环编辑器锁定，并在原有持久化写入队列内比较 `base` 与当前数据。成功后响应 `{name, size}`，这里的 `size` 仍为完整传输文本字节数。

比较会消除 JSON 文档的空白和根级字段排列差异。冲突、分块不完整、存储失败或非法 JSON 均返回原有 RPC 错误响应，不覆盖已提交数据。客户端保留草稿，允许导出 JSON；用户重新读取最新数据后再修改并保存，不自动强行覆盖。一次提交只替换目标脚本的 `data` / `config`，保留其他脚本及命名空间其他字段。

读写会话各最多两个，闲置两分钟过期，断线时清理。编辑器不依赖传输会话存活，用户编辑时间不受两分钟限制。保存前两个同步器均检查草稿所属设备；Android 数据草稿使用独立文件，避免降级旧版 Android 客户端后被当作 JS 源码上传。

## 本地验证

在 `astrobox-plugin-sync/` 执行 `cargo test --locked --lib`，验证能力协商和 JSON 分块，并生成 Rust 传输向量。在 `android-sync/` 执行 `./gradlew.bat :app:testDebugUnitTest`，由 `ScriptStorageClientTest` 生成 Android 实际请求向量，再执行 `node scripts/verify-vela-compat.mjs` 回放请求。

回放器使用 Vela 实际存储模块及桥接入口验证持久化、并发冲突、断线和旧协议；Rust 向量存在时一并验证 AstroBox 分块。所有检查均不连接设备。
