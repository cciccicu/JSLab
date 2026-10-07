# 工具模块边界

`src/utils` 存放可复用的应用代码，按职责分组，而不是按文件类型分组。

- `core/`：路由、配置、对话框、时间、反馈和 Vela 兼容层等基础设施；
- `cloud/`：JSLab Cloud 传输和 API 编排，可依赖 `core/`、`files/` 和 `editor/`；
- `editor/`：编辑器、语法高亮、字体和编辑器版本选择；
- `files/`：本地脚本文件、排序、元数据和传输完整性；
- `runtime/`：统一执行、日志缓冲、UI 会话及注入用户脚本的 API。

页面应引用实际负责该行为的最小模块。页面专属的原生 `@system.*` 接口可以直接
引用，例如退出应用或读取应用信息。示例和模板放在 `src/data/`，不要放入 `utils/`。

## 公共模块职责

| 模块 | 职责与依赖边界 |
| --- | --- |
| `cloud/cloudTransport.js` | 云源地址、令牌附加、fetch/Interconnect 传输、响应解析及云错误说明；不负责下载落盘、配对令牌保存或 AI 结果校验 |
| `cloud/cloudService.js` | 配对、权益、AI、市场及云脚本操作；下载校验后交给文件模块写入；通用请求由 transport 提供 |
| `cloud/companionBridge.js` | 原生 Interconnect 实例、协议收发、待返回云请求、文件变更通知和字体上传串行交付；脚本 RPC 委托给 scriptTransfer |
| `files/scriptTransfer.js` | 脚本 RPC、UTF-8 分块和有界上传会话；不引用原生连接或字体安装模块 |
| `files/jsManager.js` | 本地脚本 CRUD、编辑锁和变更订阅；新文件名限制与历史文件读写规则集中在此处 |
| `files/fileMetadata.js` | 文件大小/时间展示与排序；不负责编码或传输 |
| `files/textEncoding.js` | UTF-8 字节长度、字符边界分块和严格 Base64 解码；不负责磁盘或消息协议 |
| `files/transferIntegrity.js` | Adler-32 增量与 UTF-8 校验；直接扫描字符串，避免生成完整编码副本 |
| `editor/fontProfile.js` | 字体资料默认值、归一化、校验及当前资料读取；编辑器不引用字体包安装流程 |
| `editor/fontManager.js` | 待安装字体包的续传、完整性与 Helper 安装交付；保留已有磁盘协议 |
| `editor/highlightPalette.js` | 配色定义和预设选择；设置页不引用词法扫描器 |
| `editor/javascriptHighlighter.js` | 有预算的词法着色和行片段生成；不承担完整语法解析 |
| `editor/codeEditor.js` | 字体宽度估算及光标位置换算；不负责文件、原生输入或页面状态 |
| `editor/editorPreferences.js` | 编辑器版本、路由、标签与功能能力的统一资料，以及字号默认值/范围/归一化；沿用已有配置键 |
| `core/configManager.js` | JSON 配置加载、快照和持久化；只缓存写入成功的数据 |
| `core/userError.js` | 原生错误翻译和安全详情；不包含云业务错误表 |
| `core/routeManager.js` | 固定路由名解析和原生 push/replace/back 交付；不维护第二套页面栈 |
| `core/dialogState.js` | 仅由 app.ux 引入，持有唯一的请求、归属和 Promise 结果；页面通过 `$app.$def` 访问，路由只携带 dialogId，不传函数或完整选项 |
| `core/runtimeCompat.js` | 可选系统接口及页面 `$nextTick`/`$element` 的降级；不管理原生绘制、手势或任务取消 |
| `core/uiFeedback.js` | 页面与脚本共同使用的原生振动/Toast；Toast 文本与持续时间规则只有一份 |
| `core/time.js` | 时钟格式化与可见页面的分钟计时；页面在 onShow/start、onHide 和 onDestroy/stop；句柄保存在普通 JS WeakMap 中 |
| `core/deviceInfo.js` | 原生设备信息转为配对名称，缺失时返回稳定默认值；不做额外持久化 |

文件名继续使用现有的 lowerCamelCase；描述性新文件名对应单一职责。不新增总出口或兼容转发文件。
只有有必要共享的模块使用 default 对象；纯函数/小型资料模块采用 named export。
输入法的词典与适配器保留在其组件内部，并保留上游许可证，不挪入全局工具层。

Vela 各页面单独打包，公共模块的局部变量不会因为文件路径相同而跨页面共享。
对话框的应用级请求只能由 app.ux 的实例交付；页内 WeakMap 缓冲和时钟句柄仍属于本页。
对话框公共样式使用 `<style>` 内的 `@import`，当前 toolkit 2.0.5 的 `<style src>` 会得到空样式。

普通云桥接请求等待 20 秒；AI 请求等待 330 秒，覆盖云端最多 300 秒的模型请求及传输余量。
这只是等待返回的期限，不提供取消服务端任务的能力；fetch 使用 Vela 原生超时，不虚构 timeout 参数。
桥接调试日志由源码 `TRACE_BRIDGE` 控制，发布默认关闭，错误日志保留。

`editorVersion.js` 与 `fontSize.js` 已合并为 `editorPreferences.js`；所有调用方直接使用新模块。
`scheduleNextTick` 优先调用原生 `$nextTick`，缺失时仅排到下一轮事件循环，不保证屏幕绘制完成。
小模块的保留/合并依据及功能修复见 [小型公共模块复查](../../docs/small-shared-modules-review.md)。
