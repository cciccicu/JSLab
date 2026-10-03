# JSLab Vela 快应用

JSLab 是运行在小米 Vela 手环上的 JavaScript 开发环境，面向 336×480 的手环屏幕。

## 最新功能

- 创建、编辑、运行、保存、重命名和删除 `.js` / `.ui.js` 文件；
- 普通 `.js` 使用 Console 模式，`.ui.js` 使用 UI 模式；
- UI 模式提供 `ui.render`、`ui.refresh`、`ui.signal`、按钮、开关、滑块、网格、
  滚动和 `script.toast` / `script.exit`；UI 脚本不提供 `console`；
- V2 编辑器支持语法高亮、字体、字号和高亮阈值设置；关闭高亮或处理大文件时
  使用低节点纯文本渲染；
- 支持输入法、智能光标、光标方向控制和未保存修改确认；
- 内置无动画 UI 2048 游戏和大文件示例；
- 手环端云空间只支持用户主动上传和下载，不执行自动同步；
- 支持手环发起配对，显示一次性配对码和二维码；
- 支持手动上传字体、字体存活检测、离线提示和设备状态刷新；
- 通过 AstroBox 插件传输脚本和字体；
- 云空间、市场和 AI 生成功能由 ccicc.icu 云端插件提供。

## 页面路由

- `/`：主页；
- `/workspace/editor`：V2 编辑器；
- `/workspace/editor/v0`、`/workspace/editor/v1`：兼容编辑器；
- `/workspace/ai-generate`：AI 代码生成；
- `/workspace/run-console`、`/workspace/run-ui`：两种运行器；
- `/workspace/new`：新建脚本；
- `/settings`：设置、字体、高亮和帮助；
- `/settings/cloud`、`/settings/cloud/files`：设备配对与云端文件；
- `/tools/market`、`/tools/money`：市场和账户工具；
- `/overlay/*`：选择、确认和文本输入模态页面。

## 构建

```powershell
npm install
npm run lint
npm run build
npm run release
npm run release:all
```

构建需要 Node.js 和 AIoT 快应用工具链，输出为 `dist/*.rpk`。设备部署不属于构建
命令，必须由用户单独授权。

`npm run release:all` 会生成两份发布包：默认设备使用 `.jsc.rpk` 字节码包，小米手环
10 Pro 使用 `.band10-pro.rpk` JavaScript 包（不启用 JSC）。

## API 文档

完整 UI 模式 API 见 [docs/UI_API.md](docs/UI_API.md)。脚本运行时 API 按 Console 和
UI 模式分别注入，详情可在手环帮助页和运行时源码中查看。

## 相关项目

- [AstroBox 同步插件](../astrobox-plugin-sync/README.md)
- [ccicc.icu 云端插件](../ccicc-plugin-cloud/README.md)
- [JSLab Helper 表盘](../vela-luawatchface/README.md)
