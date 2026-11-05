# JSLab Sync for Android

原生 Android 配套端，通过小米运动健康与 XMS Wearable SDK 连接设备，提供脚本编辑、文件同步、脚本数据编辑和云请求转发。包名为 `icu.ccicc.jslab`，设备互联要求 Android 与 Vela 应用使用相同包名和签名证书。

## 构建

准备 JDK 17 或 21、Android SDK Platform 36、Node.js 24，在本目录执行：

```powershell
.\scripts\prepare-dependencies.ps1
.\scripts\build.ps1
```

Gradle Wrapper 随源码提供。SDK 路径通过 `ANDROID_HOME` 或本地 `local.properties` 配置。Release 签名可由 `scripts/import-vela-signing.ps1` 导入，再运行 `scripts/build.ps1 -Release`；签名材料与配置不提交。

产物位于 `dist/`，包含 APK、校验值及编辑器依赖的对应源码包。构建和测试不调用 ADB，不启动模拟器。

## 文档

- [Android 开发、依赖与验证](../docs/development/android.md)
- [配套端使用指南](../docs/guide/sync-guide.md)
- [脚本数据同步协议](../docs/protocols/script-storage.md)
- [官方 SDK 来源](../docs/third-party/xiaomi-sdk.md) · [编辑器许可](../docs/third-party/android-editor.md)
