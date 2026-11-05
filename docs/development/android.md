# Android 同步器开发

`android-sync/` 是 Kotlin / Compose 原生应用，使用 Sora Editor 与 TextMate 提供代码编辑，通过小米官方 XMS Wearable SDK 与小米运动健康中的设备通信。用户操作见[同步指南](../guide/sync-guide.md)。

## 环境与依赖

需要 JDK 17 或 21、Android SDK Platform 36、Node.js 24。Gradle Wrapper 与依赖版本配置随仓库提供；配置 `ANDROID_HOME` 或本地 `local.properties` 后，在 `android-sync/` 执行：

```powershell
.\scripts\prepare-dependencies.ps1
.\scripts\build.ps1
```

准备脚本从官方来源取得 XMS AAR 与 Sora 对应源码包，并检查固定 SHA-256。已有且校验通过的文件直接复用；无法联网时可按[SDK 来源记录](../third-party/xiaomi-sdk.md)手动放置文件。网络需要代理时传入 `-Proxy http://127.0.0.1:10808`。

SDK 二进制、下载归档和对应源码 ZIP 均为本地依赖，不提交。Sora 源码包会随发布产物提供，说明见[编辑器许可](../third-party/android-editor.md)。

## 签名与产物

Android 与 Vela 互联要求应用包名和签名证书一致。调试时为两端配置同一套证书；连接正式 RPK 时，Android 端也使用该 RPK 对应的签名。

已有 Vela 签名可使用 `scripts/import-vela-signing.ps1` 导入。脚本默认只读 `../vela-quickapp/sign/`，将本项目需要的材料写到忽略目录 `.local/`，不会覆盖已有配置。也可以从 `keystore.properties.example` 创建自己的配置。随后运行 `scripts/build.ps1 -Release`。

构建脚本执行单元测试、Lint、APK 构建及协议兼容回放。输出位于 `dist/`，包括 APK、SHA-256 和第三方编辑器源码。没有签名配置时，Release 构建入口会拒绝继续。

## 代码与状态边界

| 位置 | 职责 |
| --- | --- |
| `app/src/main/java/icu/ccicc/jslab/sync/data/` | SDK 适配、设备状态、云转发、偏好与草稿 |
| `protocol/` | v2 RPC、UTF-8 分块和响应校验，不依赖设备 SDK |
| `ui/` 与 `ui/editor/` | Compose 页面、原生 Sora 编辑器桥接、主题与编辑命令 |
| `SyncViewModel.kt` | 用户操作、草稿与系统文件选择器之间的编排 |
| `app/src/main/assets/` | TextMate 语法、编辑主题和随 APK 提供的许可 |

设备连接由小米运动健康管理。脚本保存和传输由用户发起；草稿绑定相应设备，切换设备不能把旧草稿写到新设备。源码与脚本数据使用独立草稿文件。协议兼容基准与 AstroBox 共用 `astrobox-plugin-sync/test-data/sync-compatibility.json`。

## 验证

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
node scripts/verify-vela-compat.mjs
```

协议回放使用 Kotlin 测试实际生成的请求，交给仓库中的 Vela 传输和持久化模块处理，覆盖大文件、UTF-8、分块、冲突与旧接口。可选的 AstroBox 请求向量由其 Rust 测试生成。

截图测试使用 Layoutlib 在主机渲染，不依赖模拟器。`app/src/screenshotTestDebug/reference/` 是需要保留的测试基准，使用 `:app:validateDebugScreenshotTest` 比较；只有界面修改且结果已检查时，才用 `:app:updateDebugScreenshotTest` 更新基准。普通开发截图与测试报告不提交。

设备联调时检查 SDK 授权、两端签名匹配，以及目标固件上的通信流程。
