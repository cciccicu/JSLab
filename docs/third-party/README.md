# 第三方组件与工具

项目自身代码采用根目录的 [GPL-3.0](../../LICENSE)。以下内容保留上游许可和署名；依赖锁文件记录各构建依赖的准确版本。

| 内容 | 来源与许可 | 说明 |
| --- | --- | --- |
| Vela 输入法组件 | NEORUAA，MIT | [原始许可](../../vela-quickapp/src/components/InputMethod/LICENSE)随主应用和模板保留 |
| 设备端内置字体 | Sarasa Mono SC + Noto Emoji，OFL-1.1 | [来源、构建与分发许可](editor-font.md)；字体独立按 OFL 分发 |
| RPK 签名适配 | AIoT Toolkit，ISC | [来源记录](rpk-signature.md)与[随代码许可](../../jslab-cloud/lib/rpk-signature/LICENSE) |
| 独立云服务 HTTP 与会话 | [Express](https://github.com/expressjs/express)、[express-session](https://github.com/expressjs/session)，MIT | npm 安装包保留上游许可，版本由云端锁文件固定 |
| 独立云服务 UI | [Bootstrap](https://github.com/twbs/bootstrap)、[Bootstrap Icons](https://github.com/twbs/icons)，MIT | 从本地依赖提供样式、脚本与图标字体，保留原始文件中的版权说明 |
| Android Sora / TextMate | Sora Editor、Eclipse TM4E | [版本、源码提供方式与 LGPL / EPL 说明](android-editor.md) |
| JavaScript TextMate 语法 | Microsoft TypeScript-TmLanguage，MIT | 许可随 APK 位于 assets/licenses，来源见 Android 编辑器说明 |
| 小米穿戴 SDK | 小米官方开发示例 | [来源与 SHA-256](xiaomi-sdk.md)，由准备脚本获取，AAR 不入库 |
| LVGL 图片转换器 | LVGL 项目及本地适配 | [来源与许可](lvgl-tools.md) |
| 表盘编译器 | 开发者自行准备 | Compiler.exe 作为本地工具使用，不随仓库分发 |
| 下载徽标 | AstroBox、BandBBS / WaiJade | [原始资源与使用说明](download-badges.md) |

Android 发布物同时提供编辑器对应源码归档和许可说明。下载依赖、生成安装包或复制同步源码时，应保留其附带的许可文件。项目许可证不重新授权官方 SDK 或专有工具。
