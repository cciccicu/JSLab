# JSLab

JSLab 是面向小米 Vela 手环的 JavaScript 开发与运行系统，同时提供
AstroBox 配套插件、ccicc.icu 云端插件和 Lua 辅助表盘。

## 项目组成

```text
vela-quickapp/       手环端 Vela 快应用
astrobox-plugin-sync/ AstroBox 同步插件
ccicc-plugin-cloud/  ccicc.icu 云端插件与开发 Kit
vela-luawatchface/   JSLab Helper Lua 表盘
docs/                架构和交付说明
```

## 最新功能

### 手环端

- 在手环上创建、编辑、运行、保存、重命名和删除 JavaScript 文件；
- 普通 `.js` 文件使用 Console 模式，`.ui.js` 文件使用 UI 模式；
- UI 模式提供声明式界面、状态信号、按钮、开关、滑块、网格、滚动和 Toast API，脚本不提供 `console`；
- V2 编辑器支持语法高亮、字体配置、字号配置和高亮阈值；关闭高亮或打开大文件时使用低节点纯文本渲染；
- 内置无动画 UI 2048 示例和大文件示例；
- 通过 AstroBox 手动上传、下载和管理手环脚本，不执行自动同步；
- 支持手动上传字体，使用字体配套数据进行光标定位和文本测量；
- 无网络时显示明确的联网提示；
- 支持设备发起配对，手环显示一次性配对码和二维码；
- 支持手动上传、下载云端文件，以及从市场保存脚本到本地。

### AstroBox 插件

- 发现并连接 JSLab 手环；
- 浏览、新建、编辑、重命名、删除、上传和下载脚本；
- 使用分块传输、请求确认、超时和断线恢复；
- 上传和安装字体，并传输字体测量参数；
- 通过 Interconnect 与手环端通信，不读取快应用私有目录；
- 使用 AstroBox UI V3，不依赖 Android 同步器或证书复用。

### ccicc.icu 云端插件

- 云空间按网盘模型管理当前文件，不保存用户可见版本历史；
- 手环端与云端仅执行用户主动发起的上传、下载；
- 市场浏览、详情查看、源码下载、保存到云空间和作者管理；
- 从云空间发布到市场时只自动填充代码，其他市场信息仍需填写；
- 发布、编辑、人工审核和单模型审核；模型审核不通过时管理员可人工通过；
- 手环发起配对，支持网页输入配对码或扫描手环二维码；
- 账户激活、充值、AI 代码生成和按 Token 计费；
- 生成 API 与审核 API 独立配置，提示词包含完整的 JSLab/Vela API 约束。

### JSLab Helper 表盘

- Lua 表盘首页显示时间和低帧率动画；
- 从手环端发起字体安装和字体存活检测；
- 支持 LVGL v8/v9 资源转换；
- 可选 ADB 热重载，部署不会由构建命令自动触发。

## 构建命令

```powershell
# 手环端
cd vela-quickapp
npm run lint
npm run release

# AstroBox 插件
cd ..\astrobox-plugin-sync
.\build.ps1

# ccicc.icu 云端插件
cd ..\ccicc-plugin-cloud\jslab-cloud
npm test
npm run pack -- .\ .\dist\jslab-cloud-0.5.0.zip

# Lua 表盘
cd ..\..\vela-luawatchface
python -m pip install -r requirements.txt
.\scripts\build_face.ps1
```

构建产物分别为 `.rpk`、`.abp`、云插件 `.zip` 和 `.face`。构建不会连接设备；
ADB 部署和热重载必须由用户单独明确授权。

## 文档

- [项目架构](docs/architecture.md)
- [UI 模式 API](vela-quickapp/docs/UI_API.md)
- [AstroBox 插件说明](astrobox-plugin-sync/README.md)
- [云端插件说明](ccicc-plugin-cloud/README.md)
- [Lua 表盘说明](vela-luawatchface/README.md)

## 许可证

项目采用 GPL-3.0 许可证，详见 [LICENSE](LICENSE)。
