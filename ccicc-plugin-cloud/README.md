# JSLab Cloud 云端插件

`jslab-cloud/` 是安装到 ccicc.icu 的 JSLab Cloud 插件，负责云空间、设备配对、
JS 市场、账户激活、充值和服务端 AI 代码生成。manifest ID 为 `jslab-cloud`，
展示名称为 `JSLab Cloud`。

## 最新功能

- 云空间按网盘模型管理当前 `.js` 和 `.ui.js` 文件，不保存用户可见版本历史；
- 手环端只在用户操作时上传或下载，不执行自动同步；
- 市场支持浏览、查看详情、下载源码、保存到云空间和查看作者；
- 云空间“发布到市场”只负责自动填充代码，标题、说明、分类等信息仍需填写；
- 用户可管理自己发布的脚本，管理员可审核、删除和处理举报；
- 发布后的编辑仍需审核，审核通过前不替换线上代码；
- 支持人工审核或单模型审核，模型拒绝后管理员仍可人工通过；
- 手环发起一次性配对，网页可输入配对码或扫描手环二维码确认；
- 支持云空间激活、AI 激活、充值、余额和按 Token 计费；
- 代码生成和审核使用独立的 API、模型和价格配置；
- AI 提示词注入完整的 JSLab/Vela API、Console/UI 模式约束和设备运行信息。

## 打包与地址

在 `jslab-cloud/` 目录执行：

```powershell
npm test
npm run pack -- .\ .\dist\jslab-cloud-0.5.0.zip
```

当前快应用开发地址为 `http://192.168.3.17:3000/jslab-cloud`。二维码地址由插件
运行环境生成，不写死临时开发地址；生产环境使用 `ccicc.icu` 域名。

## AI 配置

管理员在 JSLab Cloud 管理页配置生成和审核 API。生成 API 的主要配置项：

- `aiApiUrl`：OpenAI 兼容的 Chat Completions 地址；
- `aiApiKey`：仅保存在服务端插件配置中的密钥；
- `aiModel`：模型标识；
- `aiInputCentsPerMillionTokens`、`aiCachedInputCentsPerMillionTokens`、
  `aiOutputCentsPerMillionTokens`：分/M Token 价格；
- `aiMaxOutputTokens`、`aiRequestTimeoutMs`：生成上限和请求超时。

设备只接收生成后的 `.js` 或 `.ui.js` 源码和 Token 用量，不接收服务商密钥、
系统提示词、激活码或其他管理凭据。生成源码限制为 48 KiB。

## 页面与数据

网页工作区位于 `/jslab-cloud/workspace`，使用 ccicc.icu 的 SSR 布局、Bootstrap
组件、插件作用域 CSS 和渐进式 JavaScript。市场发布内容是独立快照，删除云空间
文件不会删除已发布市场条目。
