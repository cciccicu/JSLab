# JSLab Sync for AstroBox

AstroBox v2 的 WASI 插件，通过 Host API 与 JSLab 设备端通信，支持脚本管理、编辑、导入导出、脚本数据编辑和云请求转发。当前要求 API Level 3，字体入口尚未开放。

## 构建

准备 Rust 工具链，在本目录执行：

```powershell
rustup target add wasm32-wasip2
cargo test --locked
.\build.ps1
```

依赖已缓存时可使用 `build.ps1 -Offline`。输出为 `dist/JSLab-Sync-<版本>.abp`，同时保留 manifest、图标和 WASM Component，构建不连接设备。

## 文档

- [插件开发与运行边界](../docs/development/astrobox.md)
- [官方源发布流程](../docs/development/astrobox-release.md)
- [云代理协议](../docs/protocols/cloud-proxy.md)
- [脚本数据同步扩展](../docs/protocols/script-storage.md)
- [用户操作指南](../docs/guide/sync-guide.md)
