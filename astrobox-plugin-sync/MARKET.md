# AstroBox 官方源分发

源码和构建缓存仍保留在 JSLab 仓库，本目录的 `dist/`、`target/` 和 ABP 不提交到源码仓库。
官方源按分发仓库的原始 URL 读取文件，因此使用独立公开仓库保存已发布二进制：

- 分发仓库：<https://github.com/cciccicu/JSLab-AstroBox-Plugin-Release>
- 分发索引：<https://raw.githubusercontent.com/cciccicu/JSLab-AstroBox-Plugin-Release/refs/heads/main/index.txt>
- 官方源：<https://github.com/AstralSightStudios/AstroBox-NG-Plugin-Repo>

## 发布格式

分发仓库根目录的 `index.txt` 包含一行 `jslab-sync`；该目录下维护
`manifest.json`、`icon.png` 和 manifest.entry 指定的 `jslab_sync.wasm`。
本插件无额外运行资源，不需要配置 `additional_files`。
根目录保留 README、GPL 许可证、版本安装包和文件校验值。

官方源根目录 `index.txt` 添加一行：

```text
https://raw.githubusercontent.com/cciccicu/JSLab-AstroBox-Plugin-Release/refs/heads/main/
```

只提交该索引变更。官方 `.github/workflows/main.yml` 自动聚合生成 `index.json`，无需手工修改。

## 后续更新

1. 在源码仓库更新插件 manifest 和 Cargo 版本，运行 `cargo test --offline --locked` 与 `./build.ps1`。
2. 将 `dist/manifest.json`、`dist/icon.png`、`dist/jslab_sync.wasm` 同步到分发仓库的 `jslab-sync/`。
3. 更新根目录的版本 ABP、README、源码提交链接与 SHA256SUMS。
4. 核对 WASM Component 文件头、包内容、manifest 的 API Level、权限及所有公开下载地址，再提交推送分发仓库。

已有官方索引地址无需随每次版本更新重新提交 PR。构建和本地校验不连接设备或模拟器；
设备连接与部署需要另行明确授权。
