# 工具模块边界

`src/utils` 存放可复用的应用代码，按职责分组，而不是按文件类型分组。

- `core/`：路由、配置、对话框、时间、反馈和 Vela 兼容层等基础设施；
- `bridge/`：AstroBox 原生互联协议、脚本 RPC 和跨领域消息交付；
- `cloud/`：JSLab Cloud 传输和 API 编排，可依赖 `core/`、`files/` 和运行契约常量；
- `editor/`：编辑器文档、语法高亮、字体和偏好设置；
- `files/`：本地脚本文件、脚本数据与配置、排序、元数据和传输完整性；
- `runtime/`：统一执行、日志缓冲、UI 会话及注入用户脚本的 API。

页面应引用实际负责该行为的最小模块。页面专属的原生 `@system.*` 接口可以直接
引用，例如退出应用或读取应用信息。示例和模板放在 `src/data/`，不要放入 `utils/`。

## 公共模块职责

| 模块 | 职责与依赖边界 |
| --- | --- |
| `cloud/cloudTransport.js` | 云源地址、令牌附加、fetch/Interconnect 传输和响应解析；app.ux 注册唯一桥接发送方法，页面不引用连接实例 |
| `cloud/cloudError.js` | 云服务错误分类与用户提示；页面只需错误文案时不载入传输、配置和文件模块 |
| `cloud/deviceAccount.js` | 手环设备配对、令牌、账户状态和权益；只调用设备账户接口 |
| `cloud/deviceAi.js` | 手环 AI 生成请求与运行契约、返回代码校验 |
| `cloud/marketClient.js` | 市场浏览、下载和发布；本地脚本由文件模块读写，公开读取使用设备市场接口 |
| `cloud/marketFilename.js` | 市场脚本另存为的默认文件名生成与本地文件名校验 |
| `cloud/cloudFilesClient.js` | 手环云空间文件列表、上传、下载和删除；只调用设备文件接口 |
| `cloud/cloudResponse.js` | 市场与云文件共用的列表格式和源码校验 |
| `bridge/companionBridge.js` | 原生 Interconnect 实例、协议收发、待返回云请求、文件变更通知和字体上传串行交付；脚本 RPC 委托给 scriptTransfer |
| `bridge/scriptTransfer.js` | 脚本 RPC、UTF-8 分块和有界上传会话；不引用原生连接或字体安装模块 |
| `files/jsManager.js` | 本地脚本 CRUD、编辑锁和变更订阅；由 app.ux 持有唯一实例，新文件名限制与历史文件读写规则集中在此处 |
| `files/scriptData.js` | 每个脚本的数据与配置持久化，以及脚本改名、删除时的命名空间迁移和清理；由 app.ux 持有缓存，保留原有文件 URI 与格式 |
| `files/fileMetadata.js` | 文件大小/时间展示与排序；不负责编码或传输 |
| `files/textEncoding.js` | UTF-8 字节长度、字符边界分块和严格 Base64 解码；不负责磁盘或消息协议 |
| `files/transferIntegrity.js` | Adler-32 增量与 UTF-8 校验；直接扫描字符串，避免生成完整编码副本 |
| `editor/fontProfile.js` | 字体资料默认值、归一化、校验及当前资料读取；编辑器不引用字体包安装流程 |
| `editor/fontManager.js` | 待安装字体包的续传、完整性与 Helper 安装交付；保留已有磁盘协议 |
| `editor/highlightPalette.js` | 配色定义和预设选择；设置页不引用词法扫描器 |
| `editor/javascriptLexer.js` | 单行词法扫描及跨行注释、字符串、正则上下文；不承担完整语法解析 |
| `editor/javascriptHighlighter.js` | 配色、行级高亮缓存、变化传播和最小字段提交；保留全量着色入口与片段预算 |
| `editor/codeEditor.js` | 字体度量和显示宽度计算；不负责文件、原生输入或页面状态 |
| `editor/codeDocument.js` | 行文本、宽度计数、最长行及光标增量维护；不依赖原生 API 或响应式数据 |
| `editor/editorPreferences.js` | 字号及高亮阈值的默认值与归一化 |
| `core/configManager.js` | JSON 配置加载、快照和持久化；由 app.ux 持有唯一缓存，只缓存写入成功的数据 |
| `core/userError.js` | 原生错误翻译和安全详情；不包含云业务错误表 |
| `core/routeManager.js` | 固定路由名解析和原生 push/replace/back 交付；不维护第二套页面栈 |
| `core/dialogState.js` | 仅由 app.ux 引入，持有唯一的请求、归属和 Promise 结果；页面通过 `$app.$def` 访问，路由只携带 dialogId，不传函数或完整选项 |
| `core/runtimeCompat.js` | 可选系统接口及页面 `$nextTick`/`$element` 的降级；不管理原生绘制、手势或任务取消 |
| `core/uiFeedback.js` | 页面与脚本共同使用的原生振动/Toast；Toast 文本与持续时间规则只有一份 |
| `core/networkFeedback.js` | 页面网络操作的自定义加载提示、可见性与动画定时器；不依赖云业务 |
| `core/time.js` | 时钟格式化与可见页面的分钟计时；页面在 onShow/start、onHide 和 onDestroy/stop；句柄保存在普通 JS WeakMap 中 |
| `core/deviceInfo.js` | 原生设备信息转为配对名称，缺失时返回稳定默认值；不做额外持久化 |

文件名继续使用现有的 lowerCamelCase；描述性新文件名对应单一职责。不新增总出口或兼容转发文件。
只有有必要共享的模块使用 default 对象；纯函数/小型资料模块采用 named export。
输入法的词典与适配器保留在其组件内部，并保留上游许可证，不挪入全局工具层。

编辑器的文档与高亮缓存放在页面模块的普通 JS 状态中。插入、退格和光标移动直接更新相关行；
换行时调整行数组，最长行缩短时只比较行宽数字，并复用同一行连续编辑时的其他行最大宽度。
字体或整份源码变化时重新建档，切换会话和销毁页面时释放缓存。高亮沿跨行词法状态传播，
状态一致后停止；普通行内输入通常只重算当前行。纯文本显示仍由原生 text 组件处理完整源码，
因此增量计算的复杂度不代表整次输入或设备绘制耗时。

Vela 各页面单独打包，公共模块的局部变量不会因为文件路径相同而跨页面共享。
对话框的应用级请求只能由 app.ux 的实例交付；页内 WeakMap 缓冲和时钟句柄仍属于本页。
Interconnect、脚本文件锁与变更订阅、脚本数据、配置缓存和云客户端只由 app.ux 持有。
页面通过 `$app.$def.getScriptManager()`、`getScriptStorage(name)`、`getConfigManager()`、
`getCloudClients()` 访问同一实例；云传输在 app.ux 启动时绑定该连接。
对话框公共样式使用 `<style>` 内的 `@import`，当前 toolkit 2.0.5 的 `<style src>` 会得到空样式。

普通云桥接请求等待 20 秒；AI 请求等待 330 秒，覆盖云端最多 300 秒的模型请求及传输余量。
这只是等待返回的期限，不提供取消服务端任务的能力；fetch 使用 Vela 原生超时，不虚构 timeout 参数。
桥接调试日志由源码 `TRACE_BRIDGE` 控制，发布默认关闭，错误日志保留。

`editorPreferences.js` 只维护仍在使用的字号与高亮设置。
`scheduleNextTick` 优先调用原生 `$nextTick`，缺失时仅排到下一轮事件循环，不保证屏幕绘制完成。
小模块的保留/合并依据及功能修复见 [小型公共模块复查](../../docs/small-shared-modules-review.md)。
