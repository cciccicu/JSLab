# JSLab 文档

这里是仓库内人工维护文档的统一入口。使用指南面向用户与脚本作者，开发文档面向修改、构建和维护 JSLab 的贡献者。云端网站使用同一份指南源文件，设备内帮助按屏幕特点单独维护。

## 使用指南

| 主题 | 文章 |
| --- | --- |
| 开始使用 | [版本与安装](guide/installation.md) · [第一次运行](guide/getting-started.md) |
| 设备端 | [文件与编辑器](guide/watch-guide.md) · [常见问题](guide/troubleshooting.md) |
| 云端与同步 | [云账户与云空间](guide/cloud-guide.md) · [手机与 AstroBox](guide/sync-guide.md) · [AI 辅助编写](guide/ai-guide.md) |
| 分享与导出 | [JS 市场](guide/market-guide.md) · [独立快应用](guide/rpk-guide.md) |
| 编写脚本 | [脚本基础](guide/script-basics.md) · [数据与设置](guide/script-storage.md) · [运行环境](guide/runtime-api.md) · [交互界面](guide/ui-api.md) · [显示图片](guide/ui-images.md) · [绘制画布](guide/ui-canvas.md) |
| 系统接口 | [接口总览](guide/system-api.md) · [设备信息](guide/device-info.md) · [文件](guide/files.md) · [HTTP](guide/http.md) · [文件传输](guide/file-transfer.md) · [配套端通信](guide/companion.md) · [屏幕与电池](guide/display-battery.md) · [传感器与定位](guide/sensors-location.md) · [媒体](guide/media.md) · [摘要与事件](guide/crypto-events.md) |
| 了解 JSLab | [运行器、编辑器与独立打包原理](guide/how-jslab-works.md) |

## 接口与协议参考

- [完整脚本运行接口](reference/runtime-api.md)与 [UI 接口参考](reference/ui-api.md)：用于查询参数与兼容行为。
- [运行环境声明](../types/runtime-api.d.ts)与 [UI 声明](../types/ui-api.d.ts)：用于编辑器补全。
- [云代理协议](protocols/cloud-proxy.md)与[脚本数据同步扩展](protocols/script-storage.md)：用于维护配套端兼容性。
- [统一运行契约](../runtime-contract.json)：构建时生成各端使用的契约常量。

## 项目开发

先读[项目架构](development/architecture.md)，再按需要进入对应项目：

- [Vela 快应用](development/quickapp.md) · [设备布局](development/device-layouts.md) · [公共模块](development/quickapp-modules.md) · [UI 性能与验证](development/ui-performance.md)
- [Android 同步器](development/android.md)
- [AstroBox 插件](development/astrobox.md) · [官方源发布](development/astrobox-release.md)
- [云端插件](development/cloud.md) · [部署与运营](development/cloud-operations.md)
- [独立 RPK 模板](development/rpk-template.md)
- [Lua 表盘](development/watchface.md)

## 维护与贡献

[贡献指南](../CONTRIBUTING.md)说明如何提交可审查的修改；[仓库与文档维护](development/repository.md)说明目录、生成资源和本地工具边界；[发布流程](development/releasing.md)说明各交付物的检查与分发。

许可入口为[第三方组件说明](../THIRD_PARTY_NOTICES.md)。详细来源记录包括[内置字体与许可待办](third-party/editor-font.md)、[Android 编辑器](third-party/android-editor.md)、[小米 SDK](third-party/xiaomi-sdk.md)、[RPK 签名实现](third-party/rpk-signature.md)、[LVGL 工具](third-party/lvgl-tools.md)和[下载徽标](third-party/download-badges.md)。
