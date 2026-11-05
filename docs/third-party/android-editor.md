# Android 编辑器依赖

本项目使用未经修改的 Sora Editor 0.24.4 和 language-textmate 0.24.4，由 Rosemoe 及项目贡献者开发，依照 LGPL-2.1-or-later 分发。TextMate 语言模块包含 Eclipse TM4E 代码，依照 EPL-2.0 分发。

- Sora 源码与版本：https://github.com/Rosemoe/sora-editor/tree/0.24.4
- Eclipse TM4E：https://github.com/eclipse-tm4e/tm4e
- Sora 对应源码包随本地 Release 产物保存在 `dist/third-party/sora-editor-0.24.4-source.zip`。
- LGPL / EPL 完整文本随 APK 打包于 `assets/licenses/`，可在编辑器菜单的“开源许可”中阅读。
- 应用通过 Gradle 的 `io.github.rosemoe:editor:0.24.4`、`io.github.rosemoe:language-textmate:0.24.4` 依赖接入，可替换依赖并用本项目源代码重新构建；没有修改或内嵌私有版本的编辑器库。

JavaScript TextMate 语法取自 Sora 0.24.4 示例中的 `JavaScript.tmLanguage.json`，其上游是 Microsoft TypeScript-TmLanguage 提交 `4d30ff834ec324f56291addd197aa1e423cedfdd`，依照 MIT 许可分发。JavaScript 语言配置来自同一 Sora 示例。Microsoft 的 MIT 许可和版权声明已保留于 APK 的 `assets/licenses/JavaScript-Grammar-MIT.txt`。

- 语法上游：https://github.com/microsoft/TypeScript-TmLanguage/tree/4d30ff834ec324f56291addd197aa1e423cedfdd
- 语法 SHA-256：`4cfeb9a4067ec7f2b7d827ddf6ebc687980f3a9b557bd74b80edcf250b47feb4`

`jslab-light.json` 和 `jslab-dark.json` 为本项目的编辑器配色。
