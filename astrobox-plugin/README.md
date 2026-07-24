# JSLab Sync for AstroBox

AstroBox v2 第三方插件，用于管理包名 `icu.ccicc.jslab` 的 JSLab 手环应用中的 JavaScript 文件。

## 能力

- 发现 AstroBox 当前已连接设备并显示连接状态
- 刷新、选择、新建、编辑、重命名和删除手环文件
- 从本机上传 UTF-8 `.js` 文件，或将手环脚本下载到本机
- 使用 UI V3 `TEXTAREA` 提供普通多行文本编辑
- 通过请求 ID、逐块确认和 15 秒超时处理大文件与断连错误
- 接收手环端文件变更事件并自动刷新列表，合并并发刷新请求
- 上传同名文件前确认覆盖，新建和重命名默认禁止覆盖
- 文件列表与编辑器采用互斥全宽视图，点击文件直接进入编辑
- 跟踪未保存状态，返回列表前确认放弃更改，并可下载当前编辑内容
- 同步编辑器的 Ubuntu Mono 度量参数：行高倍率/偏移、ASCII 字宽和宽字符字宽

## 字体说明

JSLab 只在安装包中包含 Ubuntu Mono。AstroBox 的“编辑器字体”面板可校准行高与字符宽度，配置会同步到手环并用于光标、点按定位和横向滚动计算。

当前 Vela 官方文档只定义了私有文件的读写，没有定义把 `internal://files/` 下的 TTF/OTF 运行时注册为 `font-family` 的接口。因此插件不提供看似成功、实际无法渲染的字体文件上传；待真机与官方接口确认支持后，才能安全开放该项能力。

## 架构约束

插件是 `wasm32-wasip2` WebAssembly Component，只调用 AstroBox Host API：

- `device`：获取当前已连接设备
- `thirdpartyapp`：确认并启动设备上的 `icu.ccicc.jslab`
- `register`：按设备地址和 `icu.ccicc.jslab` 注册接收
- `interconnect`：发送 JSLab RPC 消息
- `dialog`：选择上传文件与分块保存下载文件
- `timer`：请求超时
- `ui-v3`：渲染扩展界面

这里没有 Android 应用、证书、签名或 Vela 官方 Android 同步器配对逻辑。

插件直接依赖官方 `astrobox-ng-wit 0.3.1` crate，并使用其 `psys-world-v3`、`event_v3` 与 `ui_v3` 绑定，不再复制或裁剪 WIT 文件。

连接顺序以 Clartime 的可用实现为基准：发现设备、查询目标快应用、调用 `launch_qa`、等待 2 秒、注册 Interconnect 接收，然后发送首包。JSLab 的首包是 `hello` 握手请求，握手成功后再读取文件列表。插件会在 AstroBox 完成设备连接前有界重试，并在收到设备状态事件时重新发现。

## 构建

需要 Rust 与 `wasm32-wasip2` target：

```powershell
rustup target add wasm32-wasip2
./build.ps1
```

脚本会生成 `JSLab-Sync.abp`，其中包含 `manifest.json`、`icon.png` 和 `jslab_sync.wasm`。
