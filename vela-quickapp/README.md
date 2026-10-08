# JSLab

JSLab 是一款运行在小米 Vela 手环上的 JavaScript 实验环境。你可以直接在手环上编写、保存和运行脚本，把常用的小工具、数据展示或交互想法做成随手可用的程序。

## 你可以做什么

- 新建、编辑、保存、重命名和删除 `.js` 脚本（保留已有 `.ui.js` 名字）；
- 在一个运行器中查看日志、构建界面、主动切换 Console/UI，状态与日志保留；
- 通过编辑器的语法高亮、字号和光标控制，更舒适地编辑中英文脚本；
- 使用内置的 2048 和大文件示例，快速了解运行效果；
- 从 JS 市场获取脚本，也可选择本地脚本填写资料后提交发布审核；或用 AI 生成功能起草代码；
- 通过云空间在手环和已配对的服务之间主动上传、下载脚本；
- 通过 AstroBox 传输脚本。字体更换入口目前显示“即将上线”。

## 快速开始

1. 获取与设备兼容的 JSLab `.rpk` 安装包并安装到手环。
2. 打开 JSLab，在工作区中新建脚本。
3. 编写代码后运行；运行会执行当前内容，保存请点保存按钮。ui.render 成功显示界面，UI 返回查看日志，轻点日志恢复界面。
4. 云空间文件传输需要配对并激活。JS 市场浏览和下载无需配对或激活；发布只需配对设备，选择本地脚本并填写资料后提交审核。

脚本和云端内容由你主动操作，JSLab 不会在后台自动同步。

## 统一运行器

所有脚本注入 console、ui、dialog、script、system。没有文件名分流、运行菜单或停止按钮。
右上按钮与 script.reload() 完整重建运行页，复用本次源码；script.exit() 直接退出。

新建成功后进入编辑器，关闭编辑器回到首页。顶栏返回与系统返回都会先收起键盘或光标控制，
再处理未保存修改。编辑器右上按钮展开菜单；云页面首次读取后用刷新按钮或状态卡片主动刷新。
标准对话框返回 action/value，支持长文本、负数小数、多选与三动作确认。
查看 [统一脚本 API](docs/runtime-api.md)、[UI API](docs/ui-api.md)和[类型声明](docs/runtime-api.d.ts)。
AI 生成需要设备与云插件共同支持 jslab-unified-open-ui 契约；同版本覆盖安装不改变包版本号。

## 配套服务

- [AstroBox 同步插件](../astrobox-plugin-sync/README.md)：在 AstroBox 中传输脚本。
- [ccicc.icu 云端插件](../ccicc-plugin-cloud/README.md)：提供云空间、JS 市场和 AI 生成功能。

手环云端请求统一使用 `/api/cloud/device/` 路径；网页使用独立的会话接口。
- [JSLab Helper 表盘](../vela-luawatchface/README.md)：配套的手表端辅助工具。

## 开发者构建

如需自行构建，请安装 Node.js 和 AIoT 快应用工具链，然后在本目录执行：

```powershell
npm install
npm run check:contract
npm run lint
npm run release
```

发布包会生成在 `dist/` 目录。`npm run release` 默认启用 JSC。

公共模块职责见 [模块说明](src/utils/README.md)，本轮边界、功能与迁移复查见
[公共模块复查记录](docs/shared-modules-review.md)。
其余小型模块的合并和修复见 [小型公共模块复查](docs/small-shared-modules-review.md)。
