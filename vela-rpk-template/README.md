# JSLab 独立 Vela 快应用模板

本项目编译出 336×480 的固定脚本引擎壳。网页打包只在内存里替换静态
`common/payload.json`、图标、manifest，并将脚本数据和 manifest 填入预编译的
`app.js`，然后重建
`META-INF/CERT` 并生成 RPK 签名块。服务器无需安装 AIoT 工具链、执行用户脚本
或创建临时文件。

运行时、UI、对话框、输入法和脚本存储从 `vela-quickapp` 同步，保留旧脚本的
五个注入对象 `console/ui/dialog/script/system` 及方法行为。打包选项禁用日志
时，console 方法仍存在但无输出，运行错误仍可见；隐藏顶栏时禁止脚本重新
显示顶栏。默认顶栏右上角为信息按钮，关于页包含作者、版本及 JSLab 介绍。
独立 RPK 使用透明底代码文档图标，右下角保留黑底原 JSLab 标识；它不会从主快应用同步，避免覆盖这套设计。
应用独立安装，不依赖设备上安装 JSLab。脚本持久化数据归属该应用自己的沙箱。
启动及关于页读取入口内嵌的脚本数据，避免部分固件通过 `file.readText` 读取包内
JSON 资源时返回 202。用户脚本仍作为字符串交给原有脚本引擎运行，云端不执行它。

在此项目目录执行：

```powershell
npm install
npm run build
```

开发环境可复用同仓库 `vela-quickapp/node_modules` 中的 2.0.5 工具链。
`build` 同步引擎源码、编译（不连接设备）、导出到
`ccicc-plugin-cloud/jslab-cloud/rpk-template/template.zip`，同时记录模板及源文件摘要。
`check:runtime` 检查引擎源码是否仍与主项目一致；云端测试和 prepack 还会验证
模板产物对应当前源文件。调整引擎后必须重新构建模板。

模板 ZIP 是唯一有意提交的编译资产；其中没有用户脚本、私钥、调试 sourcemap
或工具链默认签名。模板自带的演示脚本在云端打包时被完整替换。

签名实现来自 `@aiot-toolkit/aiotpack` 2.0.5，仅保留内存处理部分，详见云端
`lib/rpk-signature/NOTICE.md`。`scripts/vendor-signer.cjs` 可复现提取过程。
项目代码遵循仓库根目录 LICENSE，输入法资源保留原有授权文件。

设备安装、模拟器和真机运行仍需用户单独授权；当前构建验证不代表真机验证。
