# JSLab Helper Lua 表盘

本目录是 JSLab 使用的 Lua 表盘项目，不是 Vela 快应用，也不包含 AIoT/快应用
模拟器脚手架。

## 目录结构

- `watchface.config.json`：项目名称、表盘 ID 和 LVGL 资源配置；
- `watchface/fprj/`：可编辑的表盘工程；
- `watchface/fprj/app/`：发布到手环的 Lua 代码和资源；
- `watchface/tools/`：表盘编译器和 LVGL v8/v9 图片转换器；
- `scripts/build_face.ps1`：编译 `.face` 并生成资源二进制；
- `scripts/gen_watchface_id.ps1`：生成合法的随机表盘 ID；
- `scripts/pushlua.ps1`：可选的 ADB 部署和热重载，需要明确授权；
- `scripts/reloader.lua`：开发热重载时注入的辅助加载器。

`bin/`、`build/`、`dist/`、`watchface/data/` 和 `watchface/fprj/output/` 都是
被忽略的生成目录，不属于源代码。

## 功能

- 表盘名称为 `JSLab Helper`；
- 首页显示时间和低帧率动画；
- 从快应用端发起字体安装和表盘存活检测；
- 支持 LVGL v8 和 v9 资源转换；
- 支持可选的 Lua 热重载；
- 构建过程不会自动连接设备或启动模拟器。

## 构建

```powershell
python -m pip install -r requirements.txt
.\scripts\build_face.ps1
```

输出为 `bin\JSLab Helper.face`，资源文件为 `watchface\data\resource.bin`。
LVGL v8 设备应使用 `lvglVersion: 8`、`compress: NONE` 和 `align: 1`。

## 可选设备操作

```powershell
.\scripts\pushlua.ps1
.\scripts\pushlua.ps1 -Hot
```

这些命令使用 ADB，必须在用户明确授权连接设备后执行。普通表盘包不依赖热重载器。
