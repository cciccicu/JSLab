# JSLab AstroBox 同步插件

这是 AstroBox v2 第三方插件，用于管理包名为 `icu.ccicc.jslab` 的 JSLab 手环应用。

## 功能

- 发现已连接设备并显示连接状态；
- 刷新、新建、编辑、重命名、删除、上传和下载手环脚本；
- 使用 UI V3 `TEXTAREA` 编辑多行文本；
- 使用请求 ID、分块确认和 15 秒超时处理大文件与断线；
- 接收手环端文件变化事件并合并刷新请求；
- 同名上传前要求确认覆盖，新建和重命名默认不覆盖；
- 字体更换入口当前显示“即将上线”。

## 运行边界

插件是 `wasm32-wasip2` WebAssembly Component，只通过 AstroBox Host API 工作：

- `device`：发现当前设备；
- `thirdpartyapp`：启动 `icu.ccicc.jslab`；
- `register`：注册 Interconnect 接收；
- `interconnect`：发送 JSLab RPC；
- `dialog`：选择文件和保存下载内容；
- `timer`：处理超时；
- `ui-v3`：渲染 AstroBox 界面。

插件不包含 Android 应用、证书、签名或官方 Android 同步器配对逻辑。

## 构建

需要 Rust 和 `wasm32-wasip2`：

```powershell
rustup target add wasm32-wasip2
.\build.ps1
```

脚本生成 `JSLab-Sync.abp`，其中包含 manifest、图标和 WASM Component。

## JSLab 统一运行器

全部 `.js` 共用同一运行契约，`.ui.js` 保留为普通文件名。此插件原本按 `.js` 校验/传输，不需要更改 WIT 或 RPC 协议版本。
cloudProxy 原样转发请求 body 与服务器 JSON，包含 runtimeContract；AI 契约验证由快应用与云插件负责，文件同步不受影响。
