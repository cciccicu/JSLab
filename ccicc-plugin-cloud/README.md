# JSLab Cloud 云端插件

`jslab-cloud/` 是安装到 ccicc.icu 的 JSLab Cloud 插件，负责云空间、设备配对、
JS 市场、账户激活、充值和服务端 AI 代码生成。manifest ID 为 `jslab-cloud`，
展示名称为 `JSLab Cloud`。

## 最新功能

- 云空间按网盘模型管理当前 `.js` 文件，已有 `.ui.js` 名字只是普通文件身份，不保存用户可见版本历史；
- 手环端只在用户操作时上传或下载，不执行自动同步；
- 市场支持浏览、查看详情、下载源码、保存到云空间和查看作者；手环端可从本地脚本库选择源码并填写元信息提交审核；
- 云空间“发布到市场”只负责自动填充代码，文件名、说明、用途标签等信息仍需填写；
- 用户可管理自己发布的脚本，管理员可审核、删除和处理举报；
- 发布后的编辑仍需审核，审核通过前不替换线上代码；
- 支持人工审核或单模型审核，模型拒绝后管理员仍可人工通过；
- 手环发起一次性配对，网页可输入配对码或扫描手环二维码确认；
- 支持云空间激活、AI 激活、充值、余额和按 Token 计费；
- 代码生成和审核使用独立的 API、模型和价格配置；
- AI 提示词注入完整的 JSLab/Vela API、统一运行契约和设备运行信息；
- 内置公开使用文档，提供内容搜索、文章目录和 API 类型声明下载。

## 打包与地址

在 `jslab-cloud/` 目录执行：

```powershell
npm install
npm test
npm run pack -- .\ ..\dist\jslab-cloud-2.0.1.zip
```

## 使用文档

访问 `/jslab-cloud/docs`，无需登录或激活。云空间和 JS 市场页面均提供“文档”入口。
内置快速开始、云空间与市场指南、统一脚本 API、UI API，支持全文关键词搜索、
本页目录、相邻文章导航及 `runtime-api.d.ts` / `ui-api.d.ts` 下载。

入门和云端指南直接维护在 `jslab-cloud/docs/`。API 和类型声明源文件位于
`../vela-quickapp/docs/`，在插件目录运行 `npm run sync:docs` 更新副本；打包前自动同步，
`npm test` 会检查副本与源文件一致。插件只读取包内文档，部署后不依赖仓库其他项目。
Markdown 渲染使用声明在 `package.json.dependencies` 的 `markdown-it`，禁止原始 HTML，
并使用其默认安全链接校验。宿主安装或更新插件时需安装该依赖；直接覆盖部署也需运行 `npm install --omit=dev`。

当前快应用开发地址为 `http://192.168.3.17:3000/jslab-cloud`。二维码地址由插件
运行环境生成，不写死临时开发地址；生产环境使用 `ccicc.icu` 域名。

### 生产环境 HTTP 设备链路

Vela 设备的内置根证书库可能无法验证服务器当前的证书链。生产环境中，设备 API
固定使用 `http://jslab-api.ccicc.icu`，手机扫码后的登录和配对确认页面仍使用
`https://ccicc.icu/jslab-cloud/pair`，避免网页账户凭据通过明文 HTTP 传输。

宿主的 `ctx.caddy.registerSubdomain('jslab-api')` 会生成 HTTPS 子域名并在 80 端口
自动返回 308。需要在主 `/etc/caddy/Caddyfile` 的 managed import 之外保留以下
独立站点；不要写入由 ccicc.icu 自动生成的 managed Caddyfile：

```caddyfile
# BEGIN JSLab Vela HTTP API
http://jslab-api.ccicc.icu {
  rewrite * /jslab-cloud{uri}
  reverse_proxy 127.0.0.1:3000
}
# END JSLab Vela HTTP API
```

修改后先执行 `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`，
再执行 `caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`。插件配置
`pairingPublicOrigin` 应设为 `https://ccicc.icu`；设备 API 与二维码网页地址不要
使用同一个协议来源。

## AI 配置

管理员在 JSLab Cloud 管理页配置生成和审核 API。生成 API 的主要配置项：

- `aiApiUrl`：OpenAI 兼容的 Chat Completions 地址；
- `aiApiKey`：仅保存在服务端插件配置中的密钥；
- `aiModel`：模型标识；
- `aiInputCentsPerMillionTokens`、`aiCachedInputCentsPerMillionTokens`、
  `aiOutputCentsPerMillionTokens`：分/M Token 价格；
- `aiMaxOutputTokens`、`aiRequestTimeoutMs`：生成上限和请求超时。

设备只接收生成后的 `.js` 源码和 Token 用量，不接收服务商密钥、
系统提示词、激活码或其他管理凭据。生成源码限制为 48 KiB。

## 页面与数据

网页工作区位于 `/jslab-cloud/workspace`，使用 ccicc.icu 的 SSR 布局、Bootstrap
组件、插件作用域 CSS 和渐进式 JavaScript。市场发布内容是独立快照，删除云空间
文件不会删除已发布市场条目。
JS 市场浏览和下载公开，无需登录或激活；发布、编辑和管理自己的市场条目只要求登录或设备配对，
不查询云空间激活状态。只有“保存到我的云空间”涉及云空间权限，仍需激活。
手环通过设备 Bearer 令牌调用 `/api/cloud/device/market/submit`，与网页发布共用审核和数据校验；
网页发布继续使用登录会话与 CSRF。覆盖插件并由 PM2 重启时在 `boot` 注册设备路由，
不依赖再次执行 `install`。插件版本为 2.0.1。

手环的文件、市场、配对和 AI 接口集中在 `/api/cloud/device/`；文件读写必须使用设备令牌。
网页账户和文件接口使用 `/api/cloud/` 下不带 `device` 的路径，以登录会话及 CSRF 保护写操作。
市场列表与已发布源码可公开读取，两端各有独立路径；发布共用同一审核逻辑，
手环需设备配对，网页需登录，两者都不要求激活云空间。

服务端 `index.js` 只执行持久化准备及模块装配。`lib/device-api.js` 与 `lib/browser-api.js`
分别注册手环和网页接口；`cloud-files.js`、`market-service.js`、`ai-service.js`、
`activation-service.js` 保存各自业务逻辑。网页页面按工作区、市场、设备分在对应的
`browser-*-pages.js` 中，`browser-view.js` 提供共同的布局和表单片段。

## 统一运行契约与迁移

快应用为 2.0.0，云插件为 2.0.1，使用独立 `runtimeContract: 'jslab-unified-open-ui'` 协调 AI。
额度响应公布契约，客户端收费请求前检查；服务端在预留余额/模型调用前拒绝不匹配请求；结果携带契约，客户端检查后才写入编辑器。fetch 与 cloudProxy 使用同一结构。
云文件/市场/待审副本不再保存 type/pending_type，网页不要求 marketType。install 与 boot 共用幂等持久化初始化；升级只执行 boot 也会补建缺失辅助表、更新配置元数据并迁移（已有配置值保留）。boot 中事务执行可重复 SQLite DROP COLUMN（SQLite≥3.35），保留记录/索引/自增/源码/hash/checksum/时间，不自动改名或重新计算源数据。
审核记录新增可空 content_hash，关联被审核的名称、说明、标签和源码哈希；旧记录保留，无法确认所属内容的旧结论不在当前审核中展示。异步审核返回后再次核对快照，避免把旧结论应用到新提交或已撤回内容。
覆盖部署通过 PM2 重启整个进程，旧请求不会继续回调，不维护热更新请求管理器。进程中断留下的预留额度由下次 boot 恢复，不重复退款。
市场名称可作为显示标题；明确下载或保存到云空间时统一生成合法 `.js` 文件名，源码响应提供 filename，保留已有市场记录。新增/改名文件统一限制为128个UTF-8字节，已有长文件名保持可读，原名更新保留。网页和管理页静态资源地址使用启动时计算的内容哈希，支持同版本重复覆盖更新。
上线前备份真实数据库；覆盖后重启 PM2 并核对插件版本、接口和数据迁移。旧双模式客户端与旧服务需要同步更新，不支持旧 AI 提示词回退。
运行方法、文字长度限制和 UI 性能建议来自根目录 runtime-contract.json，构建期同步 lib/runtime-contract.json。更新时在快应用目录执行 npm run sync:contract。
选择对话框最多 100 项，使用原生列表连续滚动；提示词不再描述每页 20 项或分页按钮。
