# 统一运行器实施报告

日期：2026-10-05。依据[已确认方案](unified-runner-plan-2026-10-05.md)实施。源码、当前文档、类型、内置帮助、模板、云插件与两个交付包均已落盘。未连接设备、模拟器或 ADB，未执行线上云服务升级。应用版本仍为 **1.9.3 / 193**，云插件版本仍为 **0.5.1**。

本报告记录首次实现完成时的代码和安装包。后续深度复查已补齐升级初始化、失败提交、导航边界、审核关联及工具残留；最新结果和安装包哈希以[复查报告](unified-runner-review-2026-10-05.md)为准。下方首次产物已另行归档，当前 dist 文件为复查后的同版本重建包。

## 实现与落点

| 范围 | 已完成的行为 | 主要源码 |
| --- | --- | --- |
| 统一执行入口 | 删除双执行器及文件后缀分流；所有 `.js` 使用 `/workspace/run`，一次执行统一注入五个对象 | `src/app.ux`、`src/manifest.json`、`src/utils/core/routeManager.js`、`src/pages/workspace/run/run.ux` |
| 视图切换 | render 成功选择 UI；show/hide 保留运行状态；UI 返回 Console，轻点 Console 内容恢复 UI，全屏偏好保留 | `run.ux`、`src/utils/runtime/uiRuntime.js` |
| 完整重载 | 顶栏按钮与 script.reload 共用 replace，采用本次文件名/源码快照，包含未保存代码；防止重复导航 | `run.ux`、`src/utils/runtime/scriptRuntimeApi.js` |
| 对话框期间导航 | reload/exit 先关闭本页对话框，来源页 onShow 再处理导航；不引入中转页或导航轮询 | `run.ux`、`src/utils/core/dialogState.js` |
| UI 发布 | 保留编译缓存、浅层原生节点、对象样式、稳定 ID 与字段更新；隐藏或被弹窗遮盖时普通刷新只记 dirty，恢复合并最新状态 | `uiRuntime.js`、`uiLayout.js`、`uiPublisher.js` |
| 日志和错误 | 每次运行独立有界缓冲；隐藏 Console 不发布日志 text 或安排 flush；有限对象预览、错误前文及独立错误摘要保留 | `run.ux`、`src/utils/runtime/consoleBuffer.js` |
| 标准对话框 | alert/confirm/text/number/select 共用 action/value Promise 结果；函数和归属不进入响应式数据；结果在来源页恢复后交付 | `dialogState.js`、`scriptDialogApi.js`、`src/pages/overlay/` |
| 对话框能力 | 长文本有限窗口与计数、基本中间编辑；负数小数与输入中间态；单选/多选/禁用/数量约束/原生连续滚动；横排三动作确认 | 四个独立浅层原生对话框页、`src/common/styles/dialog.css` |
| 内部页面迁移 | 首页、主编辑器/v0/v1、编辑器设置/高亮、云账户/云文件、市场与 AI 均使用新结果；设置页弹窗返回避免重新读取旧值覆盖刚确认值 | 对应 `src/pages/` 页面 |
| 新建与示例 | 删除执行类型选择及切换；模板合为一份集合；另存为统一 `.js`；2048 经典配色、十字按钮、适量日志和全屏返回说明 | 新建页、三个编辑器、`src/data/scriptTemplates.js`、`examples/ui2048Example.js` |
| 文档与类型 | 统一运行契约、UI API、类型、帮助与各项目说明更新；历史性能和审查记录保留历史含义 | 本目录当前 API 文件、`src/data/helpDocs.js`、各 README、根 `docs/architecture.md` |
| 云数据与网页 | 移除 type/pending_type/marketType，涵盖 CRUD、发布、待审更新、审核、撤回、列表、详情、作者页和网页表单 | 云插件 `index.js`、`lib/browser-pages.js`、`assets/jslab-cloud.js` |
| 数据迁移 | boot 中事务执行原生 DROP COLUMN，重复启动可安全重入，保留源码、文件名、ID、索引、自增及其他记录 | `lib/unified-migration.js` |
| AI 同步 | 收费请求前设备确认契约；云端预留余额/调用模型前校验；结果再次校验及语法检查后写入编辑器；统一提示词与审核能力说明 | `cloudService.js`、AI 页、云插件 `index.js`、`lib/ai-prompts.js` |
| 网页缓存与导出 | 同版本资源地址加入运行契约；市场标题在明确导出时生成合法 `.js` 文件名，三种导出路径统一，已有市场记录不改写 | `browser-pages.js`、`lib/script-filename.js`、设备云服务 |
| AstroBox | 核对现有 `.js` 校验及 cloudProxy 原样透传，能够承载新契约；更新说明，不修改 WIT/RPC 版本 | `astrobox-plugin-sync/` 现有传输实现及 README |

没有保留旧运行菜单、停止脚本、页面实例内重跑、script.mode、ui.exit、onDispose 或通用清理框架。旧 `.ui.js` 文件不改名，script.data/config 继续按实际文件名隔离。云传输偏好切换不再停止负责 AstroBox 文件同步的应用级桥接。

Console 恢复 UI 直接绑定内容区原生 click。点击/滑动区分、惯性、滚动边界及事件派发由 Vela 处理，没有另写触摸坐标、阈值、点击冷却、防穿透或滚动补偿状态机。

## 开销与固定预算

新增的视图选择、运行归属与对话框结算保存在普通 JS 中。UI 可见时不会为了隐藏日志更新 text，普通刷新不会运行对话框格式化。文本键盘沿用现有输入法，组合上限 5 与字段上限独立；没有按 8000 字符构造候选槽位。选择页只响应式展示当前 20 项，点击改选中字段，不重建全部选项。

根 `runtime-contract.json` 是构建期公开方法与预算来源，同步到设备常量及云插件 JSON；设备不解析 Markdown。契约标识是 `jslab-unified`，不依赖包版本推断能力。

- Console：最多 64 条、总计 6144 字符、单条 1024 字符；最后错误摘要最多 512 字符。
- 对话框：文本默认 64、硬上限 8000；选择总量 100、原生列表连续滚动；数字最多 15 位整数，小数精度 0–10。
- UI：40 个声明节点、160 个展开绘制节点、4 层布局、2 个二维码、单段文本 1024 字符。

这些是代码中的预算与工作量约束，不能据此宣称实机交互耗时或性能完全没有回退。未新增桌面性能数字，也没有把事件循环耗时当作绘制完成时间。

## 实际执行的验证

| 检查 | 结果与边界 |
| --- | --- |
| `npm run check:contract` | 通过：55 份源文件与 11 个内嵌脚本，检查语法、路由、API、预算、对话框归属及原生 click；不运行脚本 |
| `npm run lint` | 通过 |
| 云插件变更文件 `node --check` | 通过，包含入口、网页、提示词、迁移、导出名称工具及网页 JS |
| `node --test tests/unified-migration.test.js`（云项目） | 一项真实内存 SQLite 检查通过：旧记录/待审内容、索引/唯一约束及删除高位 ID 后的自增序号保留，首次与重复迁移均成立 |
| 实机诊断 JS 的 Function 语法检查 | 通过，只编译检查，不在桌面执行 |
| `npm run release` | 最终主包成功，启用 JSC；唯一资源提示为原有 `active.ttf` 超过 1 MiB |
| 云插件 `npm run pack -- .\ .\dist\jslab-cloud-0.5.1.zip` | 成功，ZIP 根为 manifest.json，12 个发布文件 |
| 交付包结构与 SHA-256 | 已核对版本、单一运行器、新契约及迁移文件；云包无 node_modules、密钥或外部路径 |

没有运行完整的桌面 UI/云路由模拟套件，也没有进行大量 mock 验收或桌面 benchmark。相关旧测试入口已按新结构维护，其通过情况不在本次报告中声称。

## 交付文件

| 产物 | 位置 | 大小 | SHA-256 |
| --- | --- | --- | --- |
| Vela 主包 | `vela-quickapp/dist/icu.ccicc.jslab.release.1.9.3.rpk` | 1,742,587 bytes | `bf74ef97d435faa1e14d9909e135441b28a5d6e537996be308ec1c5f9d774ce9` |
| 云插件 | `ccicc-plugin-cloud/jslab-cloud/dist/jslab-cloud-0.5.1.zip` | 40,808 bytes | `46d179b30ca5b939c309eb860118bac88d99e963f683ab367ae391897ca9bb07` |
| 实机集中检查 | `vela-quickapp/diagnostics/unified-runner-check.js` | 普通 `.js` 文件 | 不自动退出或重载；只有点击对应操作后才执行 |

两次构建前均把原 dist 复制并验证到 dist/build 之外，旧产物在 `release-archive/before-unified-2026-10-05/` 与 `first-unified-before-final-2026-10-05/`。最终主包另存于 `release-archive/unified-runner-2026-10-05/`，后续清空 dist 不会删除该副本。

## 待实机及真实云环境确认

无需上传设备 JSON。运行集中检查脚本后，可直接描述现象或提供照片/OCR：

1. 增加计数、隐藏期间更新、返回日志并轻点恢复；实例编号不变，计数和日志保留。滑动阅读由原生 scroll 处理。
2. 全屏后系统返回进入 Console，轻点恢复仍为全屏；右上重载及脚本重载产生新实例，只初始化一次。
3. 连续对话框：初值 -2.5 保留，输入负数/小数和空值；多选、禁用、单选的 0/false 类型正确；4000 字符文本可编辑；三个确认动作分别返回不同 action。
4. 点击“弹窗中重载”或“弹窗中退出”后，保持弹窗打开两秒，检查先关闭弹窗再导航，没有遗留旧运行页。
5. 修改编辑器源码后离开，分别验证“保存 / 不保存 / 继续编辑”；在字号/高亮/云传输对话框确认后检查设置不回退。
6. 运行新建模板 2048，检查经典颜色、十字方向键、响应速度、返回日志及恢复。与已有实机数据比较，出现回退再按额外发布或节点定位。

云服务尚未部署；上线前备份真实数据库，宿主 SQLite 需要至少 3.35。安装云包后确认旧记录、待审更新、市场导出及实际 fetch/cloudProxy 链路；在隔离环境确认契约不匹配请求在模型调用和收费前被拒绝。

页面替换不会重启应用共享 JS context，任意脚本自行创建的原生订阅、音频等仍应由脚本约束寿命。此次按方案没有引入通用清理系统；运行器宿主自身在页面销毁时释放缓冲、引用和自身计时器。
