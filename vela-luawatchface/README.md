# JSLab Helper Lua 表盘

独立的 Lua 表盘项目，用于时间与动画展示、字体安装交付和存活检测。其资源与 Vela 快应用、AstroBox 插件分别构建。

## 构建

准备 Windows PowerShell、Python 和有权使用的表盘编译器：

```powershell
python -m pip install -r requirements.txt
.\scripts\build_face.ps1 -CompilerPath 'C:\Tools\Watchface\Compiler.exe'
```

也可将编译器放到仓库根目录下已忽略的 `.local-tools/watchface/Compiler.exe`。产物为 `bin/JSLab Helper.face` 和 `watchface/data/resource.bin`；普通构建不连接设备。

## 文档

- [项目配置、工具与构建](../docs/development/watchface.md)
- [架构与职责边界](../docs/development/architecture.md)
- [第三方工具说明](../THIRD_PARTY_NOTICES.md)

设备调试使用 `scripts/pushlua.ps1` 进行 ADB 部署和热重载。
