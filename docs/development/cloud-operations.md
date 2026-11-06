# JSLab Cloud 部署与运营

JSLab Cloud 支持独立 Node.js 服务和 ccicc.icu 插件两种部署方式。独立服务自带账户、会话、数据库、管理后台和页面外壳，使用本仓库即可运行。

## 独立服务：首次启动

安装 Node.js 24，获取仓库后进入 `jslab-cloud/`：

```sh
npm ci
npm run sync:docs
npm run setup
npm start
```

`setup` 会询问管理员用户名和密码，密码输入不回显。打开 `http://127.0.0.1:3000/jslab-cloud` 登录，顶部“管理”进入后台。服务未配置管理员时，启动命令会提示先执行 `setup`。

如果使用发布 ZIP，解压后执行 `npm ci --omit=dev`、`npm run setup`、`npm start` 即可；ZIP 已包含生成的帮助文档和 RPK 模板。

后台初始设置按以下顺序完成：

1. 在“账户管理”创建用户；也可打开公开注册，让用户自行创建账户。
2. 在“服务配置”填写代码生成和市场审核所需的模型地址、密钥与模型名。人工审核可以直接使用。
3. 在“JSLab Cloud 管理”生成激活码，让用户在云空间中兑换，开通云文件与 AI 额度。独立服务沿用现有激活和计费逻辑，额度由本站管理。
4. 按需在“安装包下载”上传设备端和 Android 安装包。公开下载页随上传内容更新。

## 配置端口、域名与数据目录

将项目内的 `.env.example` 复制为 `.env`，修改后重启服务。`npm start` 和 `npm run setup` 都读取这一文件。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `JSLAB_HOST` | `127.0.0.1` | HTTP 监听地址；容器内可设为 `0.0.0.0` |
| `JSLAB_PORT` | `3000` | HTTP 端口 |
| `JSLAB_DATA_DIR` | `data` | 数据目录；相对路径按 `jslab-cloud/` 解析 |
| `JSLAB_PUBLIC_ORIGIN` | 留空 | 网页公开地址，例如 `https://jslab.example.com`；不带 `/jslab-cloud` |
| `JSLAB_TRUST_PROXY` | 留空 | 可信反向代理 IP 或网段；代理在同机时填 `loopback` |
| `JSLAB_REGISTRATION` | `false` | 设为 `true` 开放网页注册；注册账户为普通用户 |
| `JSLAB_BODY_LIMIT` | `64mb` | JSON 和表单请求大小上限，可按部署资源调整 |

安装包上传保留独立的 50 MiB 限制。脚本接口沿用现有运行契约，不另设 48 KB 脚本长度限制。

AI、市场审核和下载设置在后台“服务配置”修改，保存在 SQLite 中，保存即生效。API 密钥输入框不显示已保存的值；留空保持原值，勾选“清除已保存的密钥”后保存可删除。`JSLAB_PUBLIC_ORIGIN` 的优先级高于后台的配对地址配置。

## HTTPS 与设备连接

生产部署设置网页公开地址和可信代理，例如：

```dotenv
JSLAB_PUBLIC_ORIGIN=https://jslab.example.com
JSLAB_TRUST_PROXY=loopback
```

Caddy 示例：

```caddyfile
jslab.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

反向代理保留原始路径。网页入口为 `https://jslab.example.com/jslab-cloud`；社区版设备端在“设置 > 云账户”选择第三方服务器，填写同一地址。手机扫码后登录本站并确认配对。已有官方站点账户与本站账户分别管理，云文件和设备配对也分别保存。

配置 HTTPS 公开地址后，登录 Cookie 带 `Secure` 标记；反向代理通过 `X-Forwarded-Proto` 传递 HTTPS 协议。将服务交给 systemd 等进程管理器时，工作目录设为 `jslab-cloud/`，启动命令使用 `node --env-file-if-exists=.env server/start.cjs`。

## 账户维护与备份

用户可通过顶栏的账户入口修改密码。管理员可在“账户管理”创建管理员或普通用户、停用和启用账户。关闭注册时，登录页引导用户联系本站管理员。

忘记密码时，在服务所在目录执行：

```sh
npm run setup -- --reset-password
```

密码重置使该账户原有网页登录会话失效；已配对设备可在云空间的设备页面单独撤销。自动化初始化支持 `npm run setup -- --stdin`，通过标准输入传入含 `username`、`password` 的 JSON 对象。

独立服务的 `data/` 包含 `jslab.sqlite` 数据库及默认 `downloads/` 上传目录。数据库保存账户、配置、登录会话和业务数据。备份时停止服务，复制整个数据目录和本地 `.env`，然后重新启动；自定义了安装包目录时一并备份该目录。仓库已忽略默认运行数据和 `.env`。

源码更新后执行 `npm ci --omit=dev`、`npm run sync:docs`，保留数据目录并重启。发布 ZIP 更新则保留原 `.env` 与数据目录、替换运行文件，再安装依赖并重启。回退版本时使用更新前配套的代码和数据备份。

## ccicc.icu 插件：安装与更新

在云端项目运行 `npm run pack` 生成 ZIP，再通过宿主支持的插件安装或更新流程部署。更新前备份宿主数据库和当前插件目录。

插件 ID 与目录名均为 `jslab-cloud`。安装包包含运行代码、依赖锁文件、文档和两种设备的预编译 RPK 模板。安装或更新后在插件目录安装生产依赖，并重启宿主进程，使 boot 注册新路由并完成幂等初始化。

手动替换时使用打包脚本生成的插件 ZIP，并保留宿主的配置、数据库和数据目录。更新失败时恢复配套的代码与数据库备份。

## 公开入口

| 路径 | 用途 |
| --- | --- |
| `/jslab-cloud/` | 产品首页 |
| `/jslab-cloud/docs` | 无需登录的指南、搜索与类型声明下载 |
| `/jslab-cloud/workspace` | 云空间与用户管理入口 |
| `/jslab-cloud/workspace/market` | JS 市场 |
| `/jslab-cloud/downloads` | 安装包下载 |
| `/jslab-cloud/pair` | 网页设备配对确认 |

设备 API 与 Web 页面独立鉴权。旧客户端使用的路径、方法、请求字段和响应语义保持兼容。

## 下载资源

独立服务的下载文件默认保存在 `JSLAB_DATA_DIR` 下的 `downloads/`；ccicc.icu 插件模式默认使用宿主的 `data/jslab-cloud-downloads/`。两种模式都可通过 `downloadsDirectory` 配置绝对路径。后台“安装包下载”页面可上传替换文件并配置下载横幅；公开下载页独立于横幅开关。

| 文件名 | 下载标识 |
| --- | --- |
| `JSLab-Android-Sync.apk` | `android` |
| `JSLab-Full-Pro.rpk` | `full-pro` |
| `JSLab-Full-RW.rpk` | `full-rw` |
| `JSLab-Community-Pro.rpk` | `community-pro` |
| `JSLab-Community-RW.rpk` | `community-rw` |

公开地址为 `/jslab-cloud/downloads/<标识>`。缺少的包不显示空链接；后台上传检查包类型、设备与版本标记，失败保留旧文件。

## AI 与额度配置

生成 API 的配置包括 `aiApiUrl`、`aiApiKey`、`aiModel`、输入 / 缓存输入 / 输出的每百万 Token 价格、`aiMaxOutputTokens` 和 `aiRequestTimeoutMs`。审核使用独立配置。服务商密钥、系统提示词中的内部配置与设备令牌不应写入公开日志或源码。

用户只收到生成源码与用量。计费、失败退款及相同请求重试由服务端处理；价格以实际部署的配置与界面显示为准。生成或上传的 RPK 私钥与证书在装配过程中使用，不写入插件源码或临时工程。

## 设备网络入口

部分固件的证书库与服务器证书链不兼容。官方部署保留 `http://jslab-api.ccicc.icu` 作为设备 API 入口，登录和扫码确认仍使用 `https://ccicc.icu/jslab-cloud/pair`。自建部署应根据固件能力配置设备地址，并让网页账户操作使用 HTTPS。

需要 HTTP 兼容入口时，在宿主自动管理的 Caddy 配置之外添加单独站点。例如官方部署对应：

```caddyfile
http://jslab-api.ccicc.icu {
  rewrite * /jslab-cloud{uri}
  reverse_proxy 127.0.0.1:3000
}
```

使用自己的域名和后端端口，并在启用前执行 Caddy 配置校验。`pairingPublicOrigin` 设置为浏览器可访问的 HTTPS 来源；设备 API 地址与网页配对来源可以不同。HTTP 设备链路不提供传输加密，这一兼容选择需结合部署环境判断。

## 部署后验证

独立服务提供 `/healthz` 健康检查，正常返回 `status: "ok"` 与服务版本。检查公开首页、文档与下载，使用测试账户验证登录、云文件、市场和配对操作；重启后确认文件、配置和下载内容保留。设备端可通过社区版连接本站完成实际配对与同步。
