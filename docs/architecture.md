# JSLab 项目架构

| 项目 | 职责 | 构建产物 | 设备交互 |
| --- | --- | --- | --- |
| `vela-quickapp` | JSLab Vela 手环应用 | `.rpk` | 仅通过明确授权的 AIoT 工具操作 |
| `astrobox-plugin-sync` | AstroBox 文件和字体同步插件 | `.abp` | 通过 Host API 和 Interconnect 操作 |
| `ccicc-plugin-cloud` | ccicc.icu 云空间、市场、配对和 AI 插件 | `jslab-cloud/dist/*.zip` | 服务端插件，不直接部署到手环 |
| `vela-luawatchface` | JSLab Helper Lua 表盘 | `.face` | ADB 部署和热重载必须明确授权 |

## 所有权边界

- `vela-quickapp` 独占 Vela `.ux`、快应用 `manifest.json`、`src/` 和 AIoT 构建配置；
- AstroBox 插件只负责配套端传输和界面，通过 Interconnect 通信，不读取快应用私有目录；
- 云端插件负责云文件、账户、配对、市场、审核、激活和 AI 生成，不复用 AstroBox 宿主代码；
- Lua 表盘拥有独立的运行时资源和构建脚本，不打入 `.rpk` 或 `.abp`；其源码现在与其他项目一起由本根仓库版本控制。

## 云插件开发

从 `ccicc-plugin-cloud/development-kit/example-plugin` 复制示例后，修改目录名、
`manifest.json.id`、路由前缀和数据库表名。插件目录名必须与 manifest ID 一致，
生成的 ZIP 放在插件自己的 `dist/` 目录中。
