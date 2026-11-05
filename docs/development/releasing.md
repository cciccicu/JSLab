# 发布流程

各项目独立发布，不自动联动版本号。只有准备发布对应组件时才调整其版本配置，保持锁文件、manifest 和实际产物一致。源码整理、文档更新与本地验证不会自动推送或部署。

## 发布前检查

先执行根目录 `node scripts/check-repository.cjs`，再按影响范围运行各项目现有检查。检查 Git 变更，确认没有凭据、机器路径、测试数据库或本地工具。不要用 `git add -f` 绕过忽略规则收集安装包。

设备端目前还需解决[内置合并字体的分发许可](../third-party/editor-font.md)。结构检查和编译通过不代表此项已经获得授权。

## 各交付物

| 项目 | 构建与产物 | 发布关注点 |
| --- | --- | --- |
| Vela | 两种设备的完整 / 社区版本，位于 `release-archive/` | 目标布局、签名、包名与版本；正式设备验证 |
| Android | `scripts/build.ps1 -Release`，产物在 `dist/` | 与 Vela 相同的互联签名、APK 校验值、第三方源码与许可 |
| AstroBox | `build.ps1`，ABP 和独立资源在 `dist/` | API Level、权限、WASM Component 与[官方源索引](astrobox-release.md) |
| 云插件 | `npm run pack`，ZIP 在项目 `dist/` | 依赖、生成文档、模板摘要、数据库备份与[部署检查](cloud-operations.md) |
| RPK 模板 | `npm run build` 导出两种设备的 ZIP 与元数据 | 作为云插件源码资产一并提交，无需单独推送运行包 |
| Lua 表盘 | `scripts/build_face.ps1`，`.face` 在 `bin/` | 表盘 ID、资源格式与工具来源 |

对外发布说明应说明实际变化、支持设备、安装或更新方式及验证范围。发布二进制使用相应分发渠道或 GitHub Releases，避免把历史安装包加入源码目录。

## 更新的兼容性

运行器和注入 API 需验证旧脚本；云端 API 需验证旧设备请求；同步器需验证旧握手与可选能力缺失。修改共享引擎后同时更新独立 RPK 模板。设备验证与服务器部署是独立步骤，不能用主机测试通过来替代。
