# 仓库与文档维护

## 目录约定

人工维护的长文档集中在根目录 `docs/`：`guide/` 面向用户，`reference/` 是详细接口，`protocols/` 是跨端协议，`development/` 是开发维护，`third-party/` 记录来源与许可。根 README、各项目 README、贡献与安全入口以及 `AGENTS.md` 保留在惯例位置。

源代码目录只放实现和运行资源。接口类型声明集中在 `types/`，独立示例集中在 `examples/`。必须随代码或应用分发的 LICENSE、版权声明和应用内帮助属于必要资源，不能当作过程文档删除。

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

`.local-tools/` 可保存个人开发 Kit、宣传工具、Vela 文档副本和历史调试材料；`.codex-temp/` 用于临时验证；IDE 配置也被忽略。公开的 JavaScript / Rust 构建和检查不依赖这些材料，表盘编译器可通过显式路径或约定的本地目录提供。

签名目录、密钥、`.env`、数据库、Android SDK AAR、表盘 Compiler.exe、依赖缓存和安装包不提交。官方 SDK 与 Sora 源码包由 Android 的准备脚本下载并校验。RPK 的两套固定模板 ZIP 是显式的忽略规则例外。

Android 的截图测试 reference 是可重复验证需要的基准，应保留；普通测试报告、排查截图、过程记录和已失效的诊断工程不进入源码。历史兼容性测试夹具和动画源资源同样保留。

## 检查与清理

根目录执行 `node scripts/check-repository.cjs`，检查文档链接、目录约束和提交边界。持续集成执行这些检查以及既有 JavaScript / Rust 测试；Android 与表盘仍按各自文档验证，CI 不连接设备、不发布软件。

`./scripts/clean-local-artifacts.ps1` 默认只预览可重新生成的缓存，`-Apply` 才执行。脚本验证路径在工作区内、已被 Git 忽略且没有跟踪文件或目录链接；保留签名、本地工具和发布归档。清理不是修复构建失败的默认步骤。
