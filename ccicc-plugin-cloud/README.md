# JSLab Cloud

安装到 ccicc.icu 的服务端插件，提供云空间、设备配对、JS 市场、AI 服务、公开帮助文档和独立快应用导出。运行代码位于 `jslab-cloud/`，构建工具和测试位于同级的 `scripts/`、`tests/`。

## 检查与打包

使用 Node.js 24：

```sh
cd jslab-cloud
npm ci
npm test
npm run pack
```

安装包输出到 `ccicc-plugin-cloud/dist/jslab-cloud-<版本>.zip`。打包器使用本项目声明的依赖，不依赖宿主 checkout 或通用开发 Kit。已有预编译模板随源码提供；只有修改设备运行引擎时才需要重建模板。

用户文档源文件统一在 `../docs/guide/`，类型声明在 `../types/`。`npm run sync:docs` 生成忽略提交的 `jslab-cloud/generated/docs/`；测试和打包会自动生成，安装包包含完整帮助资源。

## 文档

- [云端开发、配置与验证](../docs/development/cloud.md)
- [部署与运营](../docs/development/cloud-operations.md)
- [独立快应用模板](../docs/development/rpk-template.md)
- [文档维护与发布](../docs/development/repository.md)
- [云空间使用指南](../docs/guide/cloud-guide.md)

公开首页、文档、下载与市场位于 `/jslab-cloud/`；工作区位于 `/jslab-cloud/workspace`。设备 API 与网页登录接口分别鉴权，旧客户端路径继续保留。
