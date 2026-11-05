# JSLab 独立快应用模板

为 Pro 手环和 RW 手表预编译固定的脚本运行引擎，供 JSLab Cloud 在内存中装配、签名为独立 RPK。用户打包请求不启动工具链，不执行脚本，也不创建用户脚本临时工程。

## 构建

使用 Node.js 24，并先安装 `../vela-quickapp/` 的依赖。在本目录执行：

```sh
npm ci
npm run check:runtime
npm run build
npm test
```

`build` 同步运行引擎、分别编译两个设备目标，并导出云插件的 `rpk-template/`。模板 ZIP 和元数据是需要提交的发布资产；`build/`、`dist/` 不提交。运行时与派生运行页由脚本同步，不直接编辑生成副本。

## 文档

- [模板同步、构建与校验](../docs/development/rpk-template.md)
- [打包原理](../docs/guide/how-jslab-works.md)
- [用户导出指南](../docs/guide/rpk-guide.md)
- [协作约束](AGENTS.md)
