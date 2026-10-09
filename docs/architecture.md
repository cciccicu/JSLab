# JSLab 项目架构

| 项目 | 职责 | 构建产物 | 设备交互 |
| --- | --- | --- | --- |
| `vela-quickapp` | JSLab Vela 手环应用 | `dist/*.rpk` | 通过 AIoT 工具安装与调试 |
| `astrobox-plugin-sync` | AstroBox 文件和字体同步插件 | `dist/JSLab-Sync-<版本>.abp` | 通过 Host API 和 Interconnect 操作 |
| `ccicc-plugin-cloud` | ccicc.icu 云空间、市场、配对和 AI 插件 | `dist/jslab-cloud-<版本>.zip` | 服务端插件，不直接部署到手环 |
| `vela-luawatchface` | JSLab Helper Lua 表盘 | `bin/JSLab Helper.face` | 支持 ADB 部署和热重载 |

## 所有权边界

- `vela-quickapp` 独占 Vela `.ux`、快应用 `manifest.json`、`src/` 和 AIoT 构建配置；
- AstroBox 插件只负责配套端传输和界面，通过 Interconnect 通信，不读取快应用私有目录；
- 云端插件负责云文件、账户、配对、市场、审核、激活和 AI 生成，不复用 AstroBox 宿主代码；
- Lua 表盘拥有独立的运行时资源和构建脚本，不打入 `.rpk` 或 `.abp`；其源码现在与其他项目一起由本根仓库版本控制。

## 云插件开发

从 `ccicc-plugin-cloud/development-kit/example-plugin` 复制示例后，修改目录名、
`manifest.json.id`、路由前缀和数据库表名。插件目录名必须与 manifest ID 一致，
开发 Kit 用于创建其他插件。JSLab Cloud 的源码位于 `ccicc-plugin-cloud/jslab-cloud/`，
从该目录打包时将 ZIP 输出到上一级 `ccicc-plugin-cloud/dist/`。构建产物与本地备份
不纳入 Git，定期清理过时内容；需要保留的快应用安装包须在构建前备份到 `dist/` 外。

## 共享脚本契约

根 runtime-contract.json 描述公开方法、仍存在的长度限制及 UI 性能建议。快应用 scripts/sync-runtime-contract.cjs 在构建期同步设备常量及云插件 JSON，不混用构建产物。
`/workspace/run` 页面拥有源码快照、UI 会话和有界日志；原生页面生命周期交付对话框结果。所有脚本同时获得 console/ui/dialog/script/system。
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

云插件 `index.js` 负责生命周期和模块装配；`browser-api.js` 与 `device-api.js` 分别注册网页和手环接口；
`browser-pages.js` 装配按工作区、市场、设备和文档拆分的 SSR 页面；
审核、计费和文件操作位于各自的业务模块；
`persistent-state.js` 供 install/boot 共用持久化初始化，`unified-migration.js` 事务迁移已有库，
提示词、文件名和静态资源分别由小型专用模块负责。部署覆盖后由 PM2 重启整个进程，
不使用热更新管理器；旧进程中断的预留额度由新进程 boot 恢复。

## 快应用公共模块

页面按职责直接引用最小模块，没有统一的工具总出口。字体设置读取 `fontProfile`，
上传与 Helper 安装由 `fontManager` 交付；配色设置读取 `highlightPalette`，词法着色由
`javascriptHighlighter` 提供。文件展示、编码、校验与磁盘操作分别由 `fileMetadata`、
`textEncoding`、`transferIntegrity`、`jsManager` 负责。

`cloud/deviceAccount.js`、`deviceAi.js`、`marketClient.js` 和 `cloudFilesClient.js` 分别处理
手环账户、AI、市场和云文件；`cloudTransport.js` 处理传输，`cloudError.js` 负责错误提示。
原生 Interconnect 收发由 `bridge/companionBridge.js` 管理，脚本上传会话和文件 RPC
委托给 `bridge/scriptTransfer.js`。
字体上传仍按既有磁盘协议串行交付，不另建连接管理或通用任务框架。
这些模块调整不改变脚本运行契约、配置键、用户文件路径或字体 Helper 协议。
详细职责与限制见 [公共模块说明](../vela-quickapp/src/utils/README.md)。

编辑器字号和高亮阈值由 `editor/editorPreferences.js` 统一归一化；
页面 Toast 与 `script.toast` 共用 `core/uiFeedback.js`。`time`、`deviceInfo`、
路由和兼容辅助按职责保留，不为了减少文件数量合并到含混的总工具文件。
页面调度只交付原生 `$nextTick` 或下一轮事件循环，不宣称已完成屏幕绘制。

页面显示的分钟时钟由 `time.startPageClock/stopPageClock` 共用，在原生 onShow 中启动、
onHide/onDestroy 中停止；句柄不进入响应式数据。当前编辑器直接运行尚未保存的内容，
保存由用户单独执行；新建完成后 replace 到编辑器，返回落到首页。
帮助页切换内容时使用原生 scrollTo 复位，不重建滚动容器。

## 云端使用文档

`/jslab-cloud/docs` 提供公开文档目录、内容搜索、文章目录及类型声明下载，无需登录或激活。
用户教程独立维护在插件 `docs/`，覆盖入门、云端操作、脚本输入与存储、交互界面。
`ccicc-plugin-cloud/scripts/sync-docs.cjs` 仅从快应用同步类型声明，打包时不会覆盖教程正文。
测试检查声明一致性，并验证教程代码的执行和界面布局。
