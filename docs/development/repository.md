# 仓库与文档维护

## 目录约定

六个子项目在根目录并列。人工维护的长文档集中在 `docs/`：`guide/` 面向用户，`reference/` 是详细接口，`protocols/` 是跨端协议，`development/` 是开发维护，`third-party/` 记录来源与许可。第三方组件总表位于 [third-party/README.md](../third-party/README.md)，贡献与安全说明位于 `.github/`。

源代码目录放实现和运行资源。接口类型声明与 `runtime-contract.json` 集中在 `types/`，独立示例集中在 `examples/`。根 README、项目 README、AGENTS.md 及随代码分发的许可文件保留在对应位置。VS Code 多项目工作区位于 `.vscode/JSLab.code-workspace`。

## 云端帮助生成

在 `ccicc-plugin-cloud/jslab-cloud/` 运行：

```sh
npm run sync:docs
npm run check:docs
```

正文来源为 `docs/guide/`，类型来源为 `types/`。共享一级目录从 `vela-quickapp/src/data/helpDocs.js` 提取；云端独有章节与文章登记在 `lib/browser-docs-pages.js`。设备内帮助按屏幕和使用场景单独维护，不强制与网页篇目一致。

生成结果位于 `jslab-cloud/generated/docs/`，不提交 Git，但进入插件 ZIP。生成器把仓库中可点击的声明、图片和官方站点链接转换为部署时的本地路由，因此自建部署也能沿用既有页面地址。新增或删除文章后应更新目录登记，并重新生成资源。

内置 AI 提示词由 `lib/ai-prompts.js` 按 JSLab 客户端版本选择，下载文档从同一入口生成。`lib/ai-prompt-v1.json` 是冻结的旧版快照，`lib/ai-prompt-emoji.json` 是新版字体的可用图标清单；旧快照不跟随新能力改写。原生方法覆盖清单位于云端测试 fixtures，保留来源 URL；更新接口时一并核对该清单。

## 本地文件

`.local-tools/` 集中保存个人开发 Kit、宣传工具、字体预览、Vela 文档副本和历史调试材料；根级历史安装包归档位于 `.local-tools/release-archive/`，各子项目继续使用自己的产物目录。`.codex-temp/` 用于临时验证。`.vscode/` 仅提交多项目工作区，MCP 等个人配置按忽略规则保留在本机。公开的 JavaScript / Rust 构建和检查使用仓库内的脚本；表盘编译器通过显式路径或约定的本地目录提供。

签名目录、密钥、`.env`、数据库、Android SDK AAR、表盘 Compiler.exe、依赖缓存和安装包不提交。官方 SDK 与 Sora 源码包由 Android 的准备脚本下载并校验。RPK 的两套固定模板 ZIP 是显式的忽略规则例外。

Android 的截图测试 reference 是可重复验证需要的基准，应保留；普通测试报告、排查截图、过程记录和已失效的诊断工程不进入源码。历史兼容性测试夹具和动画源资源同样保留。

## 检查与清理

根目录执行 `node scripts/check-repository.cjs`，检查文档链接、目录约束和提交边界。持续集成执行这些检查以及既有 JavaScript / Rust 测试；Android 与表盘仍按各自文档验证，CI 不连接设备、不发布软件。

`./scripts/clean-local-artifacts.ps1` 默认预览可重新生成的缓存，传入 `-Apply` 执行清理。脚本检查工作区路径和 Git 忽略规则，跳过跟踪文件与目录链接，保留签名、本地工具和发布归档。
