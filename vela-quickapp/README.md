# JSLab

JSLab 是一款运行在小米 Vela 手环上的 JavaScript 实验环境。你可以直接在手环上编写、保存和运行脚本，把常用的小工具、数据展示或交互想法做成随手可用的程序。

## 你可以做什么

- 新建、编辑、保存、重命名和删除 `.js` 与 `.ui.js` 脚本；
- 使用 Console 模式运行普通 `.js`，查看脚本输出；
- 使用 UI 模式运行 `.ui.js`，构建按钮、开关、滑块、网格和滚动内容；
- 通过编辑器的语法高亮、字体、字号和光标控制，更舒适地编辑中英文脚本；
- 使用内置的 2048 和大文件示例，快速了解运行效果；
- 从 JS 市场获取脚本，或用 AI 生成功能起草代码；
- 通过云空间在手环和已配对的服务之间主动上传、下载脚本；
- 通过 AstroBox 传输脚本和字体，并检查字体在设备上的可用状态。

## 快速开始

1. 获取与设备兼容的 JSLab `.rpk` 安装包并安装到手环。
2. 打开 JSLab，在工作区中新建脚本。
3. 编写代码后选择运行：普通脚本使用 Console 模式，需要界面的脚本使用 UI 模式。
4. 如需保存或获取脚本，可在云空间完成配对后手动上传、下载；也可前往 JS 市场浏览内容。

脚本和云端内容由你主动操作，JSLab 不会在后台自动同步。

## 脚本模式

普通 `.js` 脚本适合计算、数据处理和输出信息。`.ui.js` 脚本适合需要手环界面的场景，可调用 `ui.render`、`ui.refresh`、`ui.signal`、`script.toast` 和 `script.exit` 等能力。完整的 UI 脚本说明见 [UI 模式 API 文档](docs/UI_API.md)。

## 配套服务

- [AstroBox 同步插件](../astrobox-plugin-sync/README.md)：在 AstroBox 中传输脚本与字体。
- [ccicc.icu 云端插件](../ccicc-plugin-cloud/README.md)：提供云空间、JS 市场和 AI 生成功能。
- [JSLab Helper 表盘](../vela-luawatchface/README.md)：配套的手表端辅助工具。

## 开发者构建

如需自行构建，请安装 Node.js 和 AIoT 快应用工具链，然后在本目录执行：

```powershell
npm install
npm run lint
npm run release
```

发布包会生成在 `dist/` 目录。`npm run release` 默认启用 JSC。
