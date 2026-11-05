# 独立 RPK 模板维护

`vela-rpk-template/` 将共享运行器编译成固定快应用外壳。云端请求只替换应用信息和脚本数据，再在内存中签名。实现原理见[了解 JSLab](../guide/how-jslab-works.md)。

## 构建阶段

先在 `vela-quickapp/` 安装锁定的工具链依赖，再进入 `vela-rpk-template/`：

```sh
npm ci
npm run check:runtime
npm run build
npm test
```

`build` 顺序执行源码同步、Pro 与 RW 编译、模板导出，不连接设备。主项目的设备覆盖和模板关于页覆盖在隔离副本中应用，不改写公共源码。

## 同步边界

`scripts/sync-runtime.cjs` 从主快应用复制运行层、持久化、对话框、输入法、内置字体及其原始许可等必要资源，运行页通过明确的替换规则派生。不要直接修改被同步的副本；应先改主项目，再同步并检查规则是否仍适用。

独立应用入口从 `app.js` 内嵌的数据加载源码，避免依赖部分固件对包内 JSON 的读取。它保留五组脚本注入接口，日志与顶栏选项由外壳实现，持久化使用独立应用自己的存储空间。

## 提交与校验

需提交的编译资产位于：

- `ccicc-plugin-cloud/jslab-cloud/rpk-template/template.zip` 与 `metadata.json`；
- 同目录下 `redmi-watch5/template.zip` 与 `metadata.json`。

元数据记录模板、源文件、设备覆盖与运行契约摘要。导出会排除调试 sourcemap、工具链默认签名和旧元数据；模板不包含用户源码或私钥。

源码同步、导出与校验共用 `scripts/source-content.cjs`：代码、配置和许可文本统一为 LF 换行后计算摘要，字体与图片按原始字节计算。Git 在 Windows 与 Linux 上转换文本换行不会使模板失效；模板 ZIP 本身仍按原始字节校验。

修改引擎后运行完整 `npm run build`，并在云插件运行 `npm run check:rpk-template`。必须同时提交同步后的源文件、两个设备模板及元数据。只更新版本文字或只替换一个 ZIP 不能完成引擎更新。

## 云端装配

云端依赖只需读取固定模板和签名所需库，无需安装 AIoT 工具链。它不会执行用户源码或创建用户脚本、证书、RPK 的磁盘临时文件。省略设备参数的旧请求继续使用默认 Pro 模板。

签名适配源码由 `scripts/vendor-signer.cjs` 从锁定工具链提取，上游文件摘要和 ISC 许可保留，详见[来源说明](../third-party/rpk-signature.md)。更新提取流程时核对云端独立签名验证测试。
