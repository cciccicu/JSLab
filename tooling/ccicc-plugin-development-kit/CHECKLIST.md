# 插件发布检查清单

- [ ] 插件目录名、`manifest.json.id` 一致，ID 符合 `^[a-z0-9-]{3,32}$`。
- [ ] `manifest.json.version` 为 SemVer，入口文件存在于插件目录内。
- [ ] ZIP 根目录直接包含 `manifest.json`；没有额外外层目录。
- [ ] 安装包不含 `node_modules`、`.git`、密钥、`.env`、日志、缓存或无关构建产物。
- [ ] npm 第三方包只写入 `package.json.dependencies`；宿主依赖只写入 `package.json.ccicc.hostDependencies`，两者不重复。
- [ ] `install` 的数据库初始化可重复执行；表名均使用 `ctx.db.table(...)`。
- [ ] 所有 SQL 用户输入均使用参数绑定，不拼接到 SQL 字符串中。
- [ ] 所有状态变更路由都使用 `ctx.security.csrfProtection`，表单含有 `ctx.security.csrfToken(req)`。
- [ ] 路由、模块、导航和 Caddy 子域名仅在 `boot` 注册；后台导航标记 `private: true`。
- [ ] `close` / `ctx.onClose` 会释放定时器、监听器、连接等资源。
- [ ] 升级时保留并兼容现有插件配置和数据；`uninstall` 只在 `purgeData` 为真时删除数据。
- [ ] 本地完成安装、启用、禁用、更新、卸载和重新安装验证。
- [ ] 使用 `npm run pack -- <插件目录> <输出.zip>` 生成最终 ZIP，并在干净环境中通过 `ccicc plugin install --file` 验证。
