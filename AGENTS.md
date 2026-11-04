# JSLab 工作区说明

本仓库包含多个相互独立的交付项目。请在对应的项目目录中工作，不要混用不同项目的构建产物或运行时协议。

- `vela-quickapp/AGENTS.md` 规定 Vela JS 快应用的开发要求。
- `vela-rpk-template/AGENTS.md` 规定独立脚本 RPK 引擎模板的同步、构建和导出要求；云端每次打包不得运行完整工具链或创建用户脚本临时文件。
- `astrobox-plugin-sync/` 是 AstroBox WASI 插件；请遵循其 WIT 协议和 `manifest.json`。
- `ccicc-plugin-cloud/` 包含 ccicc.icu JSLab Cloud 插件及其开发 Kit。只有创建其他插件时才使用该 Kit。
- `vela-luawatchface/` 是本仓库中的 Lua 表盘项目。其设备部署脚本需要用户明确授权。

请从目标项目目录执行命令。构建、测试和打包命令不得自动连接模拟器或实体设备。任何设备部署、ADB 操作或模拟器连接都需要用户单独明确授权。

## Cloud Agent 环境

环境 install 会准备下列依赖。代理启动后可以直接在对应目录验证，不必再安装 Node、Rust 或 Python 包。

- `vela-quickapp`、`vela-rpk-template` 和 `ccicc-plugin-cloud/jslab-cloud` 各自执行 `npm ci`。
- AstroBox 插件使用 Rust stable（crate edition 2024）和 `wasm32-wasip2`。在 `astrobox-plugin-sync` 执行 `cargo test`，发布构建使用 `cargo build --release --target wasm32-wasip2`。
- 表盘图片工具来自 `vela-luawatchface/requirements.txt`。Linux 上可以用 `watchface/tools/LVGLImage_v8.py` 从 `watchface/fprj/images/preview.png` 生成预览资源。`Compiler.exe` 是 Windows .NET 程序，由 `scripts/build_face.ps1` 调用。`pushlua.ps1` 需要单独的设备授权。
- `vela-quickapp/VelaDocs` 被 Git 忽略。它是 Xiaomi Vela JS 的 Markdown 文档，固定为 `https://github.com/CheongSzesuen/VelaDocs` 的提交 `120befc86362149fba590c3ec1c46d3d46b9c871`。云插件提示词测试读取其中的 `docs/zh` 与 `docs/en`。

`npm start`、`aiot server` 和 `aiot watch` 会打开设备或模拟器工具，环境验证不要运行它们。

常用检查：

- `vela-quickapp`：`npm test`，然后 `npm run build`。构建生成 `dist/*.rpk`。
- `vela-rpk-template`：`npm test`。
- `ccicc-plugin-cloud/jslab-cloud`：`node --test ../tests/*.test.js`。`npm test` 会先运行 `check:rpk-template`。当前已提交的模板元数据与 `vela-rpk-template/src/components/InputMethod/LICENSE` 不一致，检查会在这里停止。
- `astrobox-plugin-sync`：`cargo test`。

## 长期兼容性要求（2026-10-12 起）

- 旧脚本代码必须能在新版手环客户端上运行。修改脚本运行时、注入 API 或数据格式时，保留已有接口、参数、返回值和行为；需要变更时通过兼容适配或新增接口实现，不要求用户改写旧脚本。
- 云端接口必须兼容旧版手环客户端。保留旧客户端使用的路径、请求方式、参数、响应字段、鉴权方式及其语义；新增能力采用可选字段、独立接口或版本化接口，不强制旧客户端升级。
- 快应用使用的 API 与云端 Web 页面使用的 API 必须分离，分别维护各自的路由入口和鉴权方式；内部业务逻辑可以复用。调整 Web API 时，不得破坏旧版快应用所使用的 API。
- 涉及上述接口或行为的改动，必须验证旧脚本或旧客户端请求仍然有效，不能仅以新版本功能测试通过作为兼容性依据。
