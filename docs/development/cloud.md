# JSLab Cloud 开发

云端服务提供云文件、配对、市场、AI、下载和文档页面。`index.js` 负责装配共用业务模块；ccicc.icu 插件模式由原宿主提供上下文，独立模式由 `server/` 桥接器提供同一组接口。独立运行只需要本项目的公开依赖。

## 环境、测试与打包

使用 Node.js 24，在 `jslab-cloud/` 执行：

```sh
npm ci
npm test
npm run pack
```

测试覆盖业务协议、权限、文档、计费和 RPK 装配。`tests/standalone.test.js` 通过本机 HTTP 服务验证实际路由、登录与 CSRF、旧客户端配对、大脚本保存、会话与配置持久化、二进制上传和公开注册权限；不需要宿主 checkout。

打包器收集共用入口、`server/` 独立入口、manifest、依赖清单、静态资源、固定 RPK 模板与生成帮助资源。产物位于项目 `dist/`。依赖通过宿主安装流程或在安装目录执行 `npm ci --omit=dev` 准备，node_modules 和运行数据不进入 ZIP。

云端打包使用仓库提供的模板，不需要安装 AIoT 工具链。修改运行引擎时按[模板说明](rpk-template.md)更新产物；`check:rpk-template` 会验证源码、设备覆盖与模板摘要。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `index.js` | 生命周期与模块装配 |
| `lib/server-context.js`、`persistent-state.js` | 配置和持久化初始化 |
| `lib/browser-api.js`、`device-api.js` | Web 会话 API 与设备令牌 API |
| `lib/browser-*-pages.js`、`browser-view.js` | 两种宿主共用的 SSR 页面 |
| `lib/market-service.js`、AI 与账户服务 | 业务校验、审核、用量与计费 |
| `lib/rpk-builder.js`、`rpk-service.js` | 固定模板装配、签名与请求处理 |
| `lib/release-downloads.js` | 安装包校验、替换与公开下载 |
| `assets/` | 插件作用域样式、交互脚本和页面资源 |
| `server/app.cjs` | 将 Express 路由、数据库、账户、配置和渲染接口组装为插件上下文 |
| `server/database.cjs`、`accounts.cjs` | SQLite 持久化、密码散列、会话存储和访问校验 |
| `server/pages.cjs`、`render.cjs`、`assets/` | 独立登录、管理页面、导航和本地 UI 资源 |
| `server/start.cjs`、`setup.cjs` | 启动服务、初始化管理员和重置密码 |

持久化初始化在 install 与 boot 中都能执行，更新部署不依赖再次安装。Web API 使用会话与 CSRF，设备 API 使用 Bearer 令牌；两者可以共享内部服务，不能混用鉴权入口。

## 宿主桥接边界

桥接器实现当前业务使用的上下文接口：`db`、`config`、`routes`、`users`、`security`、`render`、`navigation` 和 `logger`。前台路由挂在 `/jslab-cloud`，管理路由挂在 `/admin/jslab-cloud`，保持现有客户端的路径与响应格式。Caddy 子域名注册属于原宿主的可选集成；独立模式由部署者配置反向代理。

业务表以 `jslab_` 为前缀，独立账户、会话与配置使用 `host_` 表，均保存在 `data/jslab.sqlite`。账户密码使用随机盐和 scrypt 散列；登录时更新会话 ID，密码重置使原网页登录会话失效。设备 Token 沿用业务模块的存储和撤销流程。

Bootstrap、Bootstrap Icons 和桥接器页面样式由本机提供。共用页面仍调用 `ctx.render`，因此 `server/assets/` 的样式只作用于独立服务，原 ccicc.icu 页面继续使用原宿主外壳。

原宿主与独立服务各自管理账户和数据。新部署在管理后台创建账户、配置模型和发放激活码；详细操作见[部署与运营](cloud-operations.md)。

## 业务边界

云空间是用户主动保存和下载的当前文件集合。市场发布的是独立快照，删除云文件不会删除已发布作品；编辑已发布作品仍经过审核，审核期间继续提供原公开版本。

网页和 JSLab 2.0.8 起的设备发布接口在保存待审核记录后立即返回现有的 `pending` 状态。LLM 审核在服务进程内异步执行，并按提交快照核对后更新状态；人工审核等待管理员处理。“我的发布”通过手动刷新获取最新结果，不轮询或自动刷新。更早、未传或传入非法版本号的设备沿用原有行为：LLM 审核随提交响应返回结果，人工审核返回待审核。原接口路径、鉴权方式和响应字段保持不变，不增加独立的审核协商参数。审核失败或服务停止时，作品保留待审核状态，由管理员处理或作者重新提交。

市场浏览和下载公开，发布需要登录或设备配对；保存到个人云空间仍按云空间权限判断。运行器、传输和 API 的兼容要求见[项目架构](architecture.md)。

AI 生成和审核使用独立配置。内置提示词由 `lib/ai-prompts.js` 按客户端 JSLab 版本选择，公开 Markdown 下载也由此生成。`lib/ai-prompt-v1.json` 保存冻结的旧版内容，不能随当前运行契约或新能力自动更新；v2 加入 `lib/ai-prompt-emoji.json` 的可用图标清单，v3 在 v2 基础上加入图片与内存画布。

| 请求携带的 JSLab 版本 | 提示词 | AI 审核的提交响应 |
| --- | --- | --- |
| 缺省、非法版本或低于 2.0.6 | v1 | 等待审核结果 |
| 2.0.6 | v2 | 等待审核结果 |
| 2.0.7 | v3 | 等待审核结果 |
| 2.0.8 及以上 | v3 | 立即返回待审核 |

提示词与后台审核的版本门槛集中在 `lib/client-compatibility.js`，将 JSLab 版本各段转换为数字后比较。未携带版本参数的早期 2.0.6 客户端使用 v1，其余客户端按请求版本选择提示词。原生方法覆盖测试使用 `tests/fixtures/native-api-methods.json` 中带来源的接口清单。

## 文档与本地预览

Web 页面的错误处理集中在 `assets/jslab-errors.js`，由文件读取、网络请求、响应解析和页面校验各自标记来源：`[浏览器]` 表示文件、网络、剪贴板或本地存储操作失败；`[前端]` 表示页面校验或处理失败；`[接口]` 表示服务器拒绝请求或响应格式不符合约定，并在可用时显示 HTTP 状态码。展示层保留已有来源，避免重复添加前缀。设备 API 的响应格式保持原样。

RPK 图标在文件选择后立即读取到内存，打包和重试使用缓存；更换、清空图标或打开另一脚本的打包表单时清除旧缓存。读取失败会阻止使用该图标打包，重新选择成功或明确清空后才能继续。

帮助正文在根目录 `docs/guide/`，声明在 `types/`。`sync:docs` 生成 `generated/docs/`；`check:docs` 检查输出，`npm test` 和打包前自动同步。新增文章仍需登记 `lib/browser-docs-pages.js` 中的目录与主题。完整流程见[文档维护](repository.md)。

本地预览可直接执行 `npm run setup`、`npm start`。使用 `JSLAB_DATA_DIR` 指定预览数据目录。生产服务地址、下载目录、AI 配置及设备网络入口见[部署与运营](cloud-operations.md)。

所有新版设备云请求在 URL 中附带 `jslabVersion` 和 `jslabVersionCode`，来自客户端构建 manifest，直连与代理使用相同字段。云端统一根据 `jslabVersion` 判断能力；`jslabVersionCode` 保留为构建信息，不作为另一套判断依据。版本号不参与鉴权，缺省或非法版本沿用旧行为。生成接口返回可选的 `aiPromptVersion`，不改变旧响应字段。请求正文中的用户材料不参与系统提示词选择。新增能力时显式维护版本映射，不更改旧提示词快照。

公开提示词下载默认提供最新版；`/docs/download/jslab-ai-prompt.md?version=1` 和 `?version=2` 分别提供旧快照。旧版提示词正文与系统消息均有一致性校验。
