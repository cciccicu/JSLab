# JSLab 工作区说明

本仓库包含多个相互独立的交付项目。请在对应的项目目录中工作，不要混用不同项目的构建产物或运行时协议。

- `vela-quickapp/AGENTS.md` 规定 Vela JS 快应用的开发要求。
- `astrobox-plugin-sync/` 是 AstroBox WASI 插件；请遵循其 WIT 协议和 `manifest.json`。
- `ccicc-plugin-cloud/` 包含 ccicc.icu JSLab Cloud 插件及其开发 Kit。只有创建其他插件时才使用该 Kit。
- `vela-luawatchface/` 是本仓库中的 Lua 表盘项目。其设备部署脚本需要用户明确授权。

请从目标项目目录执行命令。构建、测试和打包命令不得自动连接模拟器或实体设备。任何设备部署、ADB 操作或模拟器连接都需要用户单独明确授权。
