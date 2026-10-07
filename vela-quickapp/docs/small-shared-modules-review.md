# 小型公共模块复查

本轮继续核查快应用页面及其依赖引用的非大型公共模块，重点检查职责、命名、
归一化规则、原生接口降级、异步回调与模块之间的重复实现。
对上一轮已读的小型支持模块也核对了调用关系；没有重新扩展大型 UI 编译器或云服务端范围。

## 逐模块结论

| 模块 | 结论与处理 |
| --- | --- |
| `core/routeManager` | 保留。固定名称与原生页面导航具有清晰职责；修复重复/末尾分隔符在归一化之前被错误拒绝的问题 |
| `core/runtimeCompat` | 保留。将能力查询也纳入降级范围；补齐错误码和 complete；调度名称改为准确的 scheduleNextTick |
| `core/uiFeedback` | 保留。页面与脚本共用振动/Toast 交付；移除无调用方的旧 getErrorMessage 和冗余 default 出口 |
| `core/time` | 保留。只有时钟格式化，不承担计时器生命周期；合并到反馈模块会让纯函数附带不必要的原生服务依赖 |
| `core/deviceInfo` | 保留。负责设备命名及稳定降级，没有缓存、持久化或公共页面状态；不并入只需格式化时间的模块 |
| 原 `editor/editorVersion`、`editor/fontSize` | 合并为 editorPreferences，同时收回设置页中的版本标签、路由与能力规则 |
| `editor/fontProfile` | 保留。字体资料与字号/编辑器选择的来源、验证和文件协议不同，不因文件小而合并 |
| `editor/highlightPalette` | 保留。配色与词法扫描分离具有明确收益，不重新捆回高亮器或偏好模块 |
| `editor/codeEditor` | 保留。几何换算与页面输入、磁盘操作分离；沿用已说明的字体/UTF-16 估算限制 |
| `files/fileMetadata` | 保留。文件展示和排序使用轻量纯函数；无需与目录 CRUD 或编码混在一起 |
| `files/textEncoding` | 保留。UTF-8 与 Base64 归属编码层；移除 Base64 错误中残留的字体业务措辞 |
| `files/transferIntegrity` | 保留。校验直接扫描字符串；不为共享少量 UTF-8 分支而引入编码副本或每字节额外调用 |
| `core/userError` | 保留。面向用户的操作/原生错误说明；不与 Console 中保留异常名称的调试格式合并 |
| `runtime/consoleBuffer` | 保留。修复继承属性占用日志预览名额，以及 dispose 后残留省略计数 |
| `runtime/scriptDialogApi` | 保留。小型脚本入口负责运行页有效性和 owner 绑定；不把脚本政策挤入原生对话框状态模块 |
| `runtime/scriptRuntimeApi` | 保留 API 聚合职责；删除独立 Toast 参数处理，复用 uiFeedback |
| `runtime/uiPublisher` | 保留。响应式发布与普通 JS 编译快照的隔离有性能意义，不因代码短而混入布局编译或页面 |
| `runtime/runtimeContract` | 保留生成文件与统一来源；合并到带原生依赖的运行 API 会使对话框预算引用不必要地变重 |
| 输入法适配器、帮助/模板的查询入口 | 保留在所属组件/资料中；资料索引和调用关系无须另造全局管理器或缓存 |

`configManager`、`dialogState`、`scriptData` 已在前轮覆盖，本轮保留其协议和生命周期边界，
核对调用衔接，不重复加入持久化迁移、清理或并发管理框架。

## 有实际收益的合并

`editorPreferences.js` 成为编辑器偏好与版本资料的共同来源。`EDITOR_VERSIONS` 每项包含
id、标签、路由、supportsFontSize、supportsHighlight、supportsCustomFont。
首页/新建页选择编辑器，设置页展示版本和可用功能，主编辑器/v1 读取字号，均使用同一模块。

原设置页中的版本列表、重复查找、独立版本能力判断已删除；原 `editorVersion.js`、
`fontSize.js` 已删除，没有兼容转发文件。公开的辅助函数保留明确含义：
getEditorVersionInfo、getEditorRoute、getConfiguredEditorRoute、normalizeFontSize。
旧的版本归一化薄包装没有继续保留。

字号仍为默认 16、范围 8–48、按整数归一化。正常数值和数字字符串保持原行为；
null、空文本、布尔/对象与非有限数现在使用有效 fallback，fallback 也异常时使用默认值。
避免异常配置被 Number 转成 0 后误选 8px，或把异常 fallback 送入光标/布局计算。

Toast 的合并使用既有 `uiFeedback.showToast`，没有新增中间层：页面与 script.toast 都调用
同一实现，将 message 转成文本，持续时间采用 1500–10000ms，非有限值采用默认 1500ms。
脚本入口仍保留运行页有效性检查，system 接口仍直接暴露其原生能力。

## 其他修复

- **可选能力查询抛错中断运行器初始化。** 原查询发生在 try 外，四个可选模块的初始化
  因而无法降级。现在查询与加载共享原来的 try/catch，只在模块初始化阶段执行。
- **缺失接口没有 complete，直接抛出的异常也没有代码。** 降级方法仍以异步 fail 报告 203，
  然后调用 complete；无回调的同步失败也携带 code=203。fail 抛错时仍执行 complete。
  这只补齐既有失败代理，不模拟原生订阅、重连或任务取消。
- **scheduleAfterRender 语义过强。** 改为 scheduleNextTick；优先原生 `$nextTick`，缺失时
  setTimeout(0)。原生文档描述的是数据/DOM 更新，回退仅是下一轮事件循环，均不宣称屏幕已显示完成。
  两个页面和当前测试加载器已更新；历史基准读取旧页面时使用的旧名称按历史源码保留。
- **路径归一化顺序错误。** 重复/末尾斜杠先归一化再检查；根路径、固定别名与完整 schema URI
  保持支持，`.`/`..` 路径段仍拒绝。不增加自己的路由栈或返回状态机。
- **日志预览中的继承字段占用自身字段预算。** own-property 判断先于计数，已有判断只是换了顺序，
  不增加逐属性校验；销毁时同时清空字符数和省略数，read 不再留下旧省略提示。
- **通用 Base64 错误带字体业务名称。** 编码层说明 Base64 无效；字体包管理层提供原有字体错误，
  保持用户端提示且明确模块所有权。
- **设置页异步返回更新已销毁页面。** 读取/保存编辑器版本的回调使用已有 pageActive 守卫，
  不增加请求序号、全局任务代理或取消机制。
- **v1 返回设置页后字号不更新。** 字号读取移到原生 onShow，使用已有配置缓存；
  字号不变时不重复发布源码/光标数据，销毁后忽略回调。设置页字号操作名统一为 setFontSize。

## 性能、命名与数据

没有合并互不相关的时间、设备、反馈、错误或路由模块，也没有建立总出口。
没有增加 UI 刷新逐节点校验、原生测量、通用生命周期清理或手动手势逻辑。
编辑器资料只查三个版本项，字号在读偏好/保存时归一化，能力查询只在可选模块加载时运行；
日志修复移动原判断位置。未以桌面耗时或模块数量声称实机性能变化。

新资料字段用 supports… 明确布尔含义；scheduleNextTick 与实际交付行为一致；
文件与函数沿用 lowerCamelCase，组件供应方命名及历史诊断源码不批量重命名。
新入口采用 named export，旧模块和未使用的错误格式入口均无生产代码残留。

持久化配置仍使用 editor.version、editor.font.size，合法 v0/v1/v2 与字号值不变。
用户脚本路径、字体包、Interconnect、云契约均不变，不需要迁移数据或重新执行云插件 install。
云插件、AstroBox 与 Lua 不需要为本轮生成新包。
应用保持 `1.9.3 / 193`，package 与 lockfile 版本不变。

## 检查与产物

- lint、相对导入/页面结构检查通过；契约静态检查覆盖 59 个源模块、11 段内嵌脚本。
- 只运行本轮小模块逻辑检查和受影响的编码检查；前者覆盖偏好/路由/Toast/能力降级/日志状态，
  使用极少的接口桩验证参数与分支，不验证原生渲染或设备服务。
- `npm run test:small` 提供本轮逻辑检查入口；没有运行 UI 基准、模拟验收或全量测试。
- JSC release 构建通过；原 `active.ttf` 超过 1 MiB 的提示保留，字体未改。
- 安装包：`dist/icu.ccicc.jslab.release.1.9.3.rpk`，1,742,489 字节。
- SHA-256：`c3370a25ef0072c94121ff17f633bc4563b8a033abbaca956628da69bbc53110`。
- 构建前全部 dist 文件已备份到 `release-archive/before-small-module-review/dist/` 并核对哈希。
  本轮包快照在 `release-archive/small-module-review/`，哈希与 dist 相同。

本轮不需要新的实机测试应用。安装同版本覆盖包后可顺手确认编辑器版本/字号设置、
页面与 script.toast，以及设备不支持 battery 等能力时的 fail/complete；本地检查没有宣称完成这些实机验收。
