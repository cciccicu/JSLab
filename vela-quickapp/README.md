<div align="center">
  <img src="https://socialify.git.ci/cciccicu/JSLab/image?custom_description=%E4%B8%80%E4%B8%AA+Vela+%E5%BF%AB%E5%BA%94%E7%94%A8+-+%E9%80%9A%E8%BF%87%E6%AD%A4%E5%BF%AB%E5%BA%94%E7%94%A8%EF%BC%8C%E4%BD%A0%E5%8F%AF%E4%BB%A5%E5%9C%A8%E6%89%8B%E7%8E%AF%E4%B8%8A%E7%BC%96%E5%86%99%E5%92%8C%E8%BF%90%E8%A1%8C+JavaScript&description=1&font=JetBrains+Mono&forks=1&issues=1&language=1&logo=https%3A%2F%2Fraw.githubusercontent.com%2Fcciccicu%2FJSLab%2Fmaster%2Fapps%2Fvela-quickapp%2Fsrc%2Fcommon%2Flogo.png&name=1&owner=1&pattern=Transparent&pulls=1&stargazers=1&theme=Auto" alt="JSLab" width="100%" />
</div>

<br/>

<div align="center">
  <strong>在手腕上运行 JavaScript。随时，随地。</strong>
</div>

<br/>

## ✨ 界面概览

<div align="center">
  <table>
    <tr>
      <td align="center" width="25%">
        <img src="images/mainInterface.png" width="100%" />
        <br/>
        <sub>主页</sub>
      </td>
      <td align="center" width="25%">
        <img src="images/newFile.png" width="100%" />
        <br/>
        <sub>新建文件</sub>
      </td>
      <td align="center" width="25%">
        <img src="images/editorInterface.png" width="100%" />
        <br/>
        <sub>编辑器</sub>
      </td>
      <td align="center" width="25%">
        <img src="images/settingsInterface.png" width="100%" />
        <br/>
        <sub>设置</sub>
      </td>
    </tr>
  </table>
</div>

> **注意**：本应用专为运行 VelaOS 的 **小米手环 9 Pro** 设计。

## 功能特性

**核心运行时**
- 基于 QuickJS 引擎的完整 JavaScript 执行环境。
- 原生系统 API 调用支持 (文件系统、传感器、震动反馈等)。
- 专为vela设备优化的 `console.log` 实现。

**编辑器体验**
- **智能光标**：基于字宽计算的光标定位，指哪打哪。
- **定制输入法**：针对代码符号优化的键盘布局。

**工作流**
- 代码持久化存储。
- 支持 `input()` 函数获取用户交互输入。
- 通过 AstroBox 插件在扩展端浏览、新建、编辑、重命名、删除、上传和下载手环中的 JavaScript 文件。

## AstroBox 双端同步

同步扩展位于 `../astrobox-plugin-sync/`，要求 AstroBox API Level 3。它通过 AstroBox Host API 发现在线设备，并以 `icu.ccicc.jslab` 为精确路由包名建立 Interconnect 通信。

扩展不使用 Vela 官方 Android 同步器的包名复用、签名证书或 Android 配对流程。安装新版 JSLab 手环应用和构建出的 `../astrobox-plugin-sync/JSLab-Sync.abp` 后，在 AstroBox 中授权设备、Interconnect 和接收注册权限即可使用。

```powershell
../astrobox-plugin-sync/build.ps1
```

文件传输采用确认式分块协议，单个脚本上限与手环端一致，为 48 KiB。手环与扩展端共享文件变更通知，任一端完成新建、保存、重命名或删除后都会自动刷新列表；同名上传必须明确确认覆盖，新建和重命名不会覆盖已有文件。

## 手环页面路由

页面 URL 使用规范化的多级 slug，页面组件目录仍由 Vela manifest 映射：

- `/`：首页
- `/workspace/editor`：代码编辑
- `/workspace/run-console`：Console 模式运行
- `/workspace/run-ui`：UI 模式运行
- `/workspace/new`：新建脚本
- `/settings`、`/settings/help`、`/settings/about`：设置及子页面
- `/tools/market`、`/tools/money`：工具页面
- `/overlay/select`、`/overlay/confirm`、`/overlay/number-input`：交互页面

新增页面时，应在 `src/manifest.json` 注册唯一 `path`，并通过 `src/utils/routeManager.js` 使用规范 route key 或多级 slug；不接受旧 `/pages/*` 别名或包含 `..` 的路径。

## 脚本运行模式

脚本默认使用 Console 模式，通过 `run-console.ux` 执行。需要显示交互界面时，将下面的声明放在脚本第一个非空行：

```javascript
// @jslab-mode ui
```

UI 模式通过 `run-ui.ux` 执行，使用声明式 `ui.render()` API：

```javascript
// @jslab-mode ui
const count = ui.signal(0)

ui.setTitle('计数器')
ui.render(() => [
  ui.heading('计数器'),
  ui.text('当前数值：' + count.get()),
  ui.button('增加', () => count.update(value => value + 1)),
  ui.slider('数值', count.get(), value => count.set(value), {
    min: 0,
    max: 100,
    step: 1
  }),
  ui.progress('完成度', count.get())
])
```

UI API 包含：`render`、`refresh`、`setTitle`、`setTopBar`、`fullscreen`、`back`、`heading`、`text`、`button`、`buttonRow`、`grid`、`switch`、`slider`、`progress`、`divider`、`spacer`、`signal`、`toast` 和滚动控制接口。UI 模式不提供停止和重试操作；重新执行脚本需返回编辑器后再次运行。单次渲染最多显示 40 个根组件，以控制手环内存占用。“新建 JS”页面内置无动画 2048 游戏模板。

完整参数和示例见 [JSLab UI 模式 API](docs/UI_API.md)。

## TODO

- [ ] 输入法集成 JS 关键字快捷补全。
- [ ] 脚本分享与在线市场。

## 开发指南

**环境准备**
- Node.js 环境
- 小米快应用开发环境 (AIoT IDE)

**安装依赖**

```bash
npm install
npm run start
```

**构建**

```bash
npm run build
npm run release
```

**调试**

```bash
npm run watch
```

---

## 许可证 (License)

本项目采用 **GPL-3.0 许可证** 开源。

> **声明**：自 1.1.0 版本起，本项目许可证由 MIT（含附加条款）变更为 [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0)。任何针对 1.1.0 及更高版本的使用与修改，均需严格遵守 GPL-3.0 条款（包括开源衍生作品的义务）。

更多详情请访问 [米坛社区](https://www.bandbbs.cn/resources/3440/)。
