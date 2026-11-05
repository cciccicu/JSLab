# Lua 表盘开发

JSLab Helper 是独立的 Lua / LVGL 表盘，负责时间、动画、字体安装交付和存活检测。它不打入快应用 RPK，也不随 AstroBox 插件 ABP 分发。

## 环境与构建

需要 Windows PowerShell、Python 及表盘编译器。编译器为开发者自行准备的本地工具，不在仓库中分发。在 `vela-luawatchface/` 执行：

```powershell
python -m pip install -r requirements.txt
.\scripts\build_face.ps1 -CompilerPath 'C:\Tools\Watchface\Compiler.exe'
```

省略 `-CompilerPath` 时使用仓库根目录下已忽略的 `.local-tools/watchface/Compiler.exe`。构建生成 `bin/JSLab Helper.face`，并复制为 `watchface/data/resource.bin`；两个位置都是产物目录。

当前编译器会在同目录存在 `adb.exe` 时自动上传。构建入口会拒绝这种工具目录；请使用不带 ADB 的编译器目录，设备部署另用下文的调试入口执行。

## 工程结构

`watchface.config.json` 保存名称、表盘 ID 和资源配置。`watchface/fprj/` 保存可编辑工程，`app/` 是设备 Lua 代码与资源；动画源帧是重建资源需要的素材，应随源码保留。

`scripts/internal/` 提供配置同步、表盘 ID 和资源处理，供外层命令调用。`gen_watchface_id.ps1` 可生成新的表盘 ID。LVGL v8 配置使用 `lvglVersion: 8`、`compress: NONE` 和 `align: 1`；修改资源配置时同时核对目标设备格式。

## 设备调试

`scripts/pushlua.ps1` 通过 ADB 部署工程，`-Hot` 启用 `reloader.lua` 热重载，适合开发调试。正式分发使用编译生成的 `.face`。

`build/`、`dist/`、`bin/`、资源输出与 Python 缓存不提交。第三方工具和来源见[许可说明](../../THIRD_PARTY_NOTICES.md)。
