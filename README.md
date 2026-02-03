<div align="center">
  <img src="https://socialify.git.ci/cciccicu/JSLab/image?custom_description=%E4%B8%80%E4%B8%AA+Vela+%E5%BF%AB%E5%BA%94%E7%94%A8+-+%E9%80%9A%E8%BF%87%E6%AD%A4%E5%BF%AB%E5%BA%94%E7%94%A8%EF%BC%8C%E4%BD%A0%E5%8F%AF%E4%BB%A5%E5%9C%A8%E6%89%8B%E7%8E%AF%E4%B8%8A%E7%BC%96%E5%86%99%E5%92%8C%E8%BF%90%E8%A1%8C+JavaScript&description=1&font=JetBrains+Mono&forks=1&issues=1&language=1&logo=https%3A%2F%2Fraw.githubusercontent.com%2Fcciccicu%2FJSLab%2Fmaster%2Fsrc%2Fcommon%2Flogo.png&name=1&owner=1&pattern=Transparent&pulls=1&stargazers=1&theme=Auto" alt="JSLab" width="100%" />
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
        <img src="/images/mainInterface.png" width="100%" />
        <br/>
        <sub>主页</sub>
      </td>
      <td align="center" width="25%">
        <img src="/images/newFile.png" width="100%" />
        <br/>
        <sub>新建文件</sub>
      </td>
      <td align="center" width="25%">
        <img src="/images/editorInterface.png" width="100%" />
        <br/>
        <sub>编辑器</sub>
      </td>
      <td align="center" width="25%">
        <img src="/images/settingsInterface.png" width="100%" />
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
- 专为穿戴设备优化的 `console.log` 实现。

**编辑器体验**
- **字体矩阵**：内置 **FiraCode**、**JetBrains Mono**、**Hack** 三大程序员御用字体，像素级渲染优化。
- **智能光标**：基于动态字宽计算的光标定位，指哪打哪。
- **定制输入法**：针对代码符号优化的键盘布局。
- ~~**连字支持**：在手环上享受 `=>` 和 `===` 的优雅连字效果。~~  *← 小米手环带的 LVGL 不支持连字特性。*

**工作流**
- 代码持久化存储。
- 支持 `input()` 函数获取用户交互输入。

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