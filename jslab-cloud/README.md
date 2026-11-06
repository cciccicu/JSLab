# JSLab Cloud

JSLab 的云端服务，提供云空间、设备配对、JS 市场、AI 服务、公开帮助文档和独立快应用导出。可以独立部署，也可以作为 ccicc.icu 插件运行。两种方式共用业务模块、页面和接口。

## 独立运行

准备 Node.js 24，在仓库根目录执行：

```sh
cd jslab-cloud
npm ci
npm run sync:docs
npm run setup
npm start
```

`setup` 会交互创建管理员，密码输入不回显。启动后打开 <http://127.0.0.1:3000/jslab-cloud>，使用刚创建的账户登录。

管理后台提供账户、AI 配置、激活码、市场审核和安装包上传。默认关闭公开注册；用户由管理员创建。数据库、会话、配置和上传文件保存在 `data/`，无需 ccicc.icu 源码或其他私有依赖。

需要设置端口、数据目录或站点域名时，将 `.env.example` 复制为 `.env` 并修改。完整的 HTTPS 部署、设备连接和备份步骤见[部署与运营](../docs/development/cloud-operations.md)。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `index.js`、`manifest.json` | 共用业务入口与 ccicc.icu 插件标识 |
| `lib/`、`assets/` | 云业务、SSR 页面、样式和交互 |
| `server/` | 独立宿主桥接器：HTTP、账户、会话、SQLite、配置与页面外壳 |
| `rpk-template/` | 预编译设备引擎与签名元数据 |
| `scripts/`、`tests/` | 文档生成、检查、打包与测试 |
| `generated/`、`data/`、`dist/` | 生成资源、运行数据和发布产物，均忽略提交 |

## 检查与打包

使用 Node.js 24：

```sh
npm ci
npm test
npm run pack
```

安装包输出到 `dist/jslab-cloud-<版本>.zip`。ZIP 包含独立入口与插件入口，可交给 ccicc.icu 安装，也可解压后执行 `npm ci --omit=dev`、`npm run setup` 和 `npm start`。已有预编译模板随源码提供；修改设备运行引擎时才需要重建模板。

用户文档源文件统一在 `../docs/guide/`，类型声明在 `../types/`。`npm run sync:docs` 生成忽略提交的 `generated/docs/`；测试和打包会自动生成，安装包包含完整帮助资源。

## 文档

- [云端开发、配置与验证](../docs/development/cloud.md)
- [部署与运营](../docs/development/cloud-operations.md)
- [独立快应用模板](../docs/development/rpk-template.md)
- [文档维护与发布](../docs/development/repository.md)
- [云空间使用指南](../docs/guide/cloud-guide.md)

公开首页、文档、下载与市场位于 `/jslab-cloud/`；工作区位于 `/jslab-cloud/workspace`。设备 API 与网页登录接口分别鉴权，旧客户端路径继续保留。
