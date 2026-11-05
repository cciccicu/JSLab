# JSLab Cloud 部署与运营

本页面向 ccicc.icu 宿主管理者。先按[云端开发说明](cloud.md)生成插件 ZIP，再通过宿主支持的插件安装或更新流程部署。生产操作前备份宿主数据库和当前插件目录；部署、重启与远端发布由维护者单独执行。

## 安装与更新

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

下载文件默认独立保存在宿主的 `data/jslab-cloud-downloads/`，也可通过 `downloadsDirectory` 配置绝对路径。该目录随插件更新保留。后台“安装包下载”页面可上传替换文件并配置下载横幅；公开下载页独立于横幅开关。

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

检查公开首页、文档与下载，使用测试账户验证登录、CSRF、云文件及市场操作。检查模板装配和重复请求的计费行为，确认下载数据目录在更新后保留。在目标设备上验证配对、固件接口与安装效果。
