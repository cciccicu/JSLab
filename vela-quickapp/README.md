# JSLab Vela 快应用

设备端 JavaScript 编辑器、脚本运行器、原生 UI、市场与云空间入口。Pro 与 RW 共用业务逻辑，布局在构建时选择；脚本接口保持向后兼容。

## 构建

使用 Node.js 24，在本目录执行：

```sh
npm ci
npm run check:contract
npm run check:devices
npm run lint
npm run build:bandpro
# RW 调试包：npm run build:watch5
```

隔离构建的安装包位于 `release-archive/`，不改写工作区 manifest，也不连接设备。正式版使用 `release:bandpro` / `release:watch5`，社区版使用 `release:community` / `release:community:watch5`。签名放在已忽略的 `sign/`。

## 文档

- [快应用开发与验证](../docs/development/quickapp.md)
- [设备布局与构建](../docs/development/device-layouts.md)
- [公共模块边界](../docs/development/quickapp-modules.md)
- [运行接口](../docs/reference/runtime-api.md) · [UI 接口](../docs/reference/ui-api.md)
- [使用指南](../docs/guide/watch-guide.md) · [示例脚本](../examples/README.md)

协作约定见 [AGENTS.md](AGENTS.md)。
