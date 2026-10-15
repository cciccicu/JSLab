# 分设备静态布局

| 构建目标 | 设备 | 页面 / designWidth |
| --- | --- | --- |
| `bandpro`（默认） | 小米手环 Pro | 336×480 / 336 |
| `redmi-watch5` | REDMI Watch 5 | 432×514 / 432 |

业务代码、页面事件和脚本接口共用。默认 CSS 位于 `src/` 各页面或组件旁，
手表对应 CSS 位于 `targets/redmi-watch5/` 的相同路径。手表样式为完整独立样式表，
不依赖媒体查询、CSS 变量或安装后选择设备。字体和图标采用原生尺寸。

`scripts/device-build.cjs` 创建隔离源码副本，覆盖所选设备的样式及
`utils/core/screen.js`，写入对应 `designWidth` 后调用官方编译器。
安装包只包含选中的布局，不修改工作区 manifest。

在本目录执行：

```powershell
npm run check:devices
npm run release:bandpro
npm run release:watch5
npm run release:community
npm run release:community:watch5
```

调试构建使用 `build:bandpro`、`build:watch5`。以上命令不连接模拟器、ADB 或设备。
旧 `build` / `release` 命令仍构建默认手环布局；`release` 前需保留 `dist/` 内旧产物。
新的设备入口在 `release-archive/` 输出安装包，同名旧包先备份；编译结果保留在
其 `device-builds/` 下以便检查样式。

## Watch 5 几何

- 顶栏 112px，顶部按钮 72×72，距相邻屏边 30px。
- 底部工具按钮起点 y=412，最低边 y=484，保留 30px。
- 中部列表左右 18px；无顶栏脚本内容左右 30px，首项 y=30。
- 圆角参考本机官方模拟器 80px，并以保守 90px 设计值核查；触摸仍需真机确认。
- 键盘高 255px，末端保留 30px。横向字母区为三行 50px 按键；数字、符号、
  代码片段、候选栏使用独立尺寸。编辑器光标滚动共享同一组参数。

`check:devices` 检查每份 CSS 的目标覆盖、页面尺寸、常用操作按钮矩形边界，
以及数字键盘/字母区底部范围；不替代 Vela 引擎渲染与真机交互验证。

## 脚本与独立 RPK

保留 `ui` 字号、显式宽高、回调和参数校验语义；只将宿主内容宽度、起点和
最小画布高度接入设备参数。原有 480 等脚本参数上限保留，不能全局替换。
手环输出通过既有 v5 比较、2048 和编辑器回归校验。

在 `vela-rpk-template/` 执行 `npm run build` 同步公共源码并预编译两个模板。
云端表单选择设备，可选字段 `target` 为 `bandpro` 或 `redmi-watch5`。
缺省及显式 `bandpro` 保留旧请求哈希、模板和文件名。
Watch 5 使用专用模板、包含设备的请求哈希和下载文件名。
云端只读取模板并在内存替换资源及签名，不运行工具链或用户脚本。

后续需在两种设备覆盖：首页、编辑器、五种键盘状态、长候选词、数字输入、
选择与确认弹窗、市场与云文件、旧脚本 UI、隐藏顶栏及四角触摸。
设备连接与部署需要用户另行授权。
