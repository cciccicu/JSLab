# AstroBox 插件开发

`astrobox-plugin-sync/` 编译为 `wasm32-wasip2` WebAssembly Component，通过 AstroBox Host API 完成设备发现、Interconnect 通信、文件对话框和 UI V3 界面。当前 manifest 声明 API Level 3。

## 构建与检查

在本目录执行：

```powershell
rustup target add wasm32-wasip2
cargo test --locked
.\build.ps1
```

首次构建需要下载 Cargo.lock 锁定的依赖。已准备缓存时使用 `cargo test --locked --offline` 和 `build.ps1 -Offline`。插件使用发布的 `astrobox-ng-wit` crate，当前项目无需初始化一个本地 WIT 子模块。

`build.ps1` 生成 `dist/jslab_sync.wasm`、manifest、图标以及带版本的 ABP。脚本会重建 dist，需要保留的历史包应移到忽略的 `release-archive/`。构建和测试不连接设备。

## 协议与兼容性

插件通过请求 ID、逐块确认和超时关联消息，不直接读取快应用私有目录。主协议保持 v2，脚本数据编辑通过可选能力 `scriptStorageProtocol: 1` 协商；旧设备仍可使用原有源码同步。

文件名沿用设备端规则：最多 128 个 UTF-16 单元，不包含路径和 ASCII 控制字符，旧文件名中的连续点号与 `.JS` 后缀保持可读。文件列表仍接受数字字符串大小。兼容夹具位于 `test-data/sync-compatibility.json`，由 Android 与 Rust 两端共同验证。

数据编辑使用固定读取快照和保存前冲突检查。草稿绑定原设备；断线与设备切换不能把修改写到其他设备。字体入口当前未开放，握手不要求字体能力。

协议细节见[脚本数据扩展](../protocols/script-storage.md)和[云代理](../protocols/cloud-proxy.md)。修改 Host API 时分别核对依赖的 WIT 版本、manifest 权限与宿主 API Level。

## 分发

源码仓库保存代码与锁文件，已发布二进制使用独立的分发仓库。构建完成后，按[官方源发布流程](astrobox-release.md)上传产物并更新源索引。
