# JSLab Cloud 开发

云端插件提供云文件、配对、市场、AI、下载和文档页面，通过 ccicc.icu 宿主的插件生命周期、数据库、会话与页面渲染提供服务。

## 环境、测试与打包

使用 Node.js 24，在 `ccicc-plugin-cloud/jslab-cloud/` 执行：

```sh
npm ci
npm test
npm run pack
```

测试使用本地数据库及接口替身，不要求旁边另有宿主 checkout、VelaDocs 副本或开发 Kit。主机可验证协议、权限、数据持久化、文档、计费和 RPK 装配；实际宿主中的 SSR 和浏览器交互另行验证。

打包器只收集运行入口、manifest、依赖清单、assets、lib、固定 RPK 模板与生成帮助资源。产物位于项目 `dist/`。依赖通过宿主安装流程或在安装目录执行 `npm ci --omit=dev` 准备，node_modules 不进入 ZIP。

云端打包使用仓库提供的模板，不需要安装 AIoT 工具链。修改运行引擎时按[模板说明](rpk-template.md)更新产物；`check:rpk-template` 会验证源码、设备覆盖与模板摘要。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `index.js` | 生命周期与模块装配 |
| `lib/server-context.js`、`persistent-state.js` | 配置和持久化初始化 |
| `lib/browser-api.js`、`device-api.js` | Web 会话 API 与设备令牌 API |
| `lib/browser-*-pages.js`、`browser-view.js` | 复用宿主布局的 SSR 页面 |
| `lib/market-service.js`、AI 与账户服务 | 业务校验、审核、用量与计费 |
| `lib/rpk-builder.js`、`rpk-service.js` | 固定模板装配、签名与请求处理 |
| `lib/release-downloads.js` | 安装包校验、替换与公开下载 |
| `assets/` | 插件作用域样式、交互脚本和页面资源 |

持久化初始化在 install 与 boot 中都能执行，更新部署不依赖再次安装。Web API 使用会话与 CSRF，设备 API 使用 Bearer 令牌；两者可以共享内部服务，不能混用鉴权入口。

## 业务边界

云空间是用户主动保存和下载的当前文件集合。市场发布的是独立快照，删除云文件不会删除已发布作品；编辑已发布作品仍经过审核，审核期间继续提供原公开版本。

市场浏览和下载公开，发布需要登录或设备配对；保存到个人云空间仍按云空间权限判断。运行器、传输和 API 的兼容要求见[项目架构](architecture.md)。

AI 生成和审核使用独立配置。内置提示词由 `lib/ai-prompts.js` 按客户端 JSLab 版本选择，公开 Markdown 下载也由此生成。`lib/ai-prompt-v1.json` 保存冻结的旧版内容，不能随当前运行契约或新能力自动更新；v2 加入 `lib/ai-prompt-emoji.json` 的可用图标清单，v3 在 v2 基础上加入图片与内存画布。

| 请求携带的客户端版本 | 提示词 |
| --- | --- |
| 缺省、非法版本或低于 2.0.6 | v1 |
| 2.0.6 | v2 |
| 2.0.7 及以上 | v3 |

版本门槛集中在 `promptReleases`，将版本各段转换为数字后比较。未携带版本参数的早期 2.0.6 客户端使用 v1，其余客户端按请求版本选择提示词。原生方法覆盖测试使用 `tests/fixtures/native-api-methods.json` 中带来源的接口清单。

## 文档与本地预览

帮助正文在根目录 `docs/guide/`，声明在 `types/`。`sync:docs` 生成 `generated/docs/`；`check:docs` 检查输出，`npm test` 和打包前自动同步。新增文章仍需登记 `lib/browser-docs-pages.js` 中的目录与主题。完整流程见[文档维护](repository.md)。

本地宿主预览应使用独立数据库和安装目录，避免覆盖开发者已有数据。生产服务地址、下载目录、AI 配置及设备 HTTP 兼容入口见[部署与运营](cloud-operations.md)。

所有新版设备云请求在 URL 中附带 `jslabVersion` 和 `jslabVersionCode`，来自客户端构建 manifest，直连与代理使用相同字段。版本号只用于能力兼容，不参与鉴权；版本无效时退回旧提示词。生成接口返回可选的 `aiPromptVersion`，不改变旧响应字段。请求正文中的用户材料不参与系统提示词选择。新增能力时显式维护版本到提示词的映射，不更改旧快照。

公开提示词下载默认提供最新版；`/docs/download/jslab-ai-prompt.md?version=1` 和 `?version=2` 分别提供旧快照。旧版提示词正文与系统消息均有一致性校验。
