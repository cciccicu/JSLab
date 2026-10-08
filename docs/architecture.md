# JSLab 项目架构

| 项目 | 职责 | 构建产物 | 设备交互 |
| --- | --- | --- | --- |
| `vela-quickapp` | JSLab Vela 手环应用 | `.rpk` | 通过 AIoT 工具安装与调试 |
| `astrobox-plugin-sync` | AstroBox 文件和字体同步插件 | `.abp` | 通过 Host API 和 Interconnect 操作 |
| `ccicc-plugin-cloud` | ccicc.icu 云空间、市场、配对和 AI 插件 | `jslab-cloud/dist/*.zip` | 服务端插件，不直接部署到手环 |
| `vela-luawatchface` | JSLab Helper Lua 表盘 | `.face` | 支持 ADB 部署和热重载 |

## 所有权边界

- `vela-quickapp` 独占 Vela `.ux`、快应用 `manifest.json`、`src/` 和 AIoT 构建配置；
- AstroBox 插件只负责配套端传输和界面，通过 Interconnect 通信，不读取快应用私有目录；
- 云端插件负责云文件、账户、配对、市场、审核、激活和 AI 生成，不复用 AstroBox 宿主代码；
- Lua 表盘拥有独立的运行时资源和构建脚本，不打入 `.rpk` 或 `.abp`；其源码现在与其他项目一起由本根仓库版本控制。

## 云插件开发

从 `ccicc-plugin-cloud/development-kit/example-plugin` 复制示例后，修改目录名、
`manifest.json.id`、路由前缀和数据库表名。插件目录名必须与 manifest ID 一致，
生成的 ZIP 放在插件自己的 `dist/` 目录中。

## 共享脚本契约

根 runtime-contract.json 描述公开方法、仍存在的长度限制及 UI 性能建议。快应用 scripts/sync-runtime-contract.cjs 在构建期同步设备常量及云插件 JSON，不混用构建产物。
一个 /workspace/run 页面拥有源码快照、UI 会话和有界日志；原生页面生命周期交付对话框结果。所有脚本同时获得 console/ui/dialog/script/system。
AI 用 jslab-unified-open-ui 协议身份协调同版本覆盖更新；AstroBox cloudProxy 透传，不另建执行分类。

## 运行器模块边界

`run.ux` 只拥有本次运行与原生视图：消费一次源码快照，初始化脚本环境，处理视图、日志发布和页面导航。
`uiRuntime.js` 管理 UI 定义、signal、可见性、刷新合并和回调；`uiLayout.js` 编译布局与复用节点；
`uiPublisher.js` 将编译快照按字段发布到响应式页面。编译缓存、函数和大文本缓冲保存在普通 JS 中。
`consoleBuffer.js` 负责有界日志与格式化，普通 UI 更新不处理隐藏日志。
`scriptRuntimeApi.js` 汇总 system/script 能力，持久化由 `scriptData.js` 负责；
`scriptDialogApi.js` 是脚本入口，`dialogState.js` 仅由 app.ux 引入，负责唯一的请求归属与结果；
来源页和四个原生 overlay 页都通过 `$app.$def` 访问该状态。各页面独立打包，不能用各自导入的
模块局部变量共享请求。路由只交付 dialogId，overlay 页负责显示和输入。

云插件 `index.js` 管理生命周期、API、审核和计费；`browser-pages.js` 提供 SSR 页面；
`persistent-state.js` 供 install/boot 共用持久化初始化，`unified-migration.js` 事务迁移已有库，
提示词、文件名和静态资源分别由小型专用模块负责。部署覆盖后由 PM2 重启整个进程，
不使用热更新管理器；旧进程中断的预留额度由新进程 boot 恢复。

## 快应用公共模块

页面按职责直接引用最小模块，没有统一的工具总出口。字体设置读取 `fontProfile`，
上传与 Helper 安装由 `fontManager` 交付；配色设置读取 `highlightPalette`，词法着色由
`javascriptHighlighter` 提供。文件展示、编码、校验与磁盘操作分别由 `fileMetadata`、
`textEncoding`、`transferIntegrity`、`jsManager` 负责。

`cloudService` 编排业务 API，`cloudTransport` 处理请求和错误；原生 Interconnect
收发由 `companionBridge` 管理，脚本上传会话和文件 RPC 委托给 `scriptTransfer`。
字体上传仍按既有磁盘协议串行交付，不另建连接管理或通用任务框架。
这些模块调整不改变脚本运行契约、配置键、用户文件路径或字体 Helper 协议。
详细职责与限制见 [公共模块说明](../vela-quickapp/src/utils/README.md)及
[复查记录](../vela-quickapp/docs/shared-modules-review.md)。

小型模块的编辑器版本/字号偏好合并到 `editorPreferences`，设置页从同一资料读取版本标签、
路由和能力；页面 Toast 与 `script.toast` 共用 `uiFeedback`。`time`、`deviceInfo`、
路由和兼容辅助按职责保留，不为了减少文件数量合并到含混的总工具文件。
页面调度只交付原生 `$nextTick` 或下一轮事件循环，不宣称已完成屏幕绘制。
详见 [小型模块复查](../vela-quickapp/docs/small-shared-modules-review.md)。

页面显示的分钟时钟由 `time.startPageClock/stopPageClock` 共用，在原生 onShow 中启动、
onHide/onDestroy 中停止；句柄不进入响应式数据。v0/v1/v2 都直接运行当前编辑内容，
保存独立；v2 操作使用现有选择对话框。新建完成后 replace 到编辑器，返回落到首页。
帮助和选项翻页使用原生 scrollTo 复位，不重建滚动容器。
逐页检查见 [页面一致性复查](../vela-quickapp/docs/pages-consistency-review.md)。
