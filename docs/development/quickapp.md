# Vela 快应用开发

`vela-quickapp/` 包含设备端编辑器、脚本管理、运行器、市场与云服务入口。阅读源码前可先看[三项核心功能的实现原理](../guide/how-jslab-works.md)。使用操作见[设备端指南](../guide/watch-guide.md)。

## 环境与构建

JavaScript 工具和主机测试使用 Node.js 24。`package-lock.json` 固定 AIoT 工具链及检查依赖；在 `vela-quickapp/` 执行 `npm ci`，无需全局安装另一套 AIoT 版本。

| 命令 | 用途 |
| --- | --- |
| `npm run build:bandpro` / `build:watch5` | 在隔离副本中生成对应设备的调试包 |
| `npm run release:bandpro` / `release:watch5` | 构建完整发布包 |
| `npm run release:community` / `release:community:watch5` | 构建对应设备的社区版 |
| `npm run check:contract` | 检查运行契约、源码语法和页面入口 |
| `npm run check:devices` | 检查两种设备的布局覆盖及安全边距 |
| `npm run lint` | 检查应用源码规范 |
| `npm test` | 运行当前主机回归测试 |

分设备构建将安装包保存在 `release-archive/`，同名旧产物先备份。传统的 `build`、`release` 处理默认布局，其中 AIoT release 会清空 `dist/`；需要保留的旧包放在该目录之外。模拟器调试使用 `start` 或 `watch`。

社区版在临时源码中设置构建标记，保留包名 `icu.ccicc.jslab`，允许用户选择服务器；完整源码不会被改写。签名文件位于本地 `sign/`，不纳入 Git。Android 互联需要两端包名和签名一致。

## 代码组织

页面放在 `src/pages/`，输入法等共享组件放在 `src/components/`，图标与样式资源放在 `src/common/`。路由以 `src/manifest.json` 为准，命名路由由 `src/utils/core/routeManager.js` 管理。设备内帮助和内置脚本是运行资源，位于 `src/data/`。

公共逻辑按 `core`、`bridge`、`cloud`、`editor`、`files`、`runtime` 分组，具体职责见[公共模块说明](quickapp-modules.md)。页面只持有本页显示与交互状态；跨页面服务由 `src/app.ux` 持有，通过 `$app.$def` 访问。各页面独立打包，不能依赖分别导入同一模块来共享有状态实例。

## 页面与设备布局

Vela `.ux` 使用原生组件与其 CSS 子集。普通页面只有一个模板根节点，文字放入 `text` / `span`，列表采用稳定的 `tid`。样式沿用项目的 `@import` 方式；不要把浏览器 DOM、HTML 或 CSS Grid 引入设备页面。

Pro 和 RW 共用模板、事件与业务逻辑，差异集中在尺寸参数和静态样式。布局维护、键盘与圆角检查见[设备布局说明](device-layouts.md)。隐藏页面时保留恢复所需状态，销毁页面时释放资源、定时器和订阅。

## 运行契约与兼容性

根目录 `runtime-contract.json` 是公开运行契约的来源。`npm run sync:contract` 同步设备常量与云端 JSON，构建前自动执行。修改运行器还需重建[独立 RPK 模板](rpk-template.md)，保证云端打包使用相同的引擎。

旧脚本保留原有接口、文件名和数据格式；新增能力采用兼容扩展。设备云 API 与 Web API 分别鉴权、分别维护入口，不能以网页调整为由破坏旧设备请求。

## 验证

按改动选择现有测试入口：`test:core`、`test:files`、`test:editor`、`test:cloud`、`test:runtime`。涉及设备样式时检查两个构建目标；涉及共享运行器时检查模板同步。测试使用的历史兼容夹具保留在 `tests/fixtures/`，它们是有效的回归依据。

人工交互脚本集中在 [examples/diagnostics](../../examples/diagnostics/unified-runner-check.js)，安装到目标设备后检查视图切换、重载与对话框操作。
