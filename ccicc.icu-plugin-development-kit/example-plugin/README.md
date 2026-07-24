# 示例插件

这是一个可直接打包安装的参考实现，展示当前正式接口的常用用法：

- 在 `install` 中注册配置并以 `ctx.db.table(...)` 创建命名空间表；
- 在 `boot` 中注册前台、后台路由、导航、模块和静态资源；
- 使用 `ctx.render.withLayout` / `ctx.render.adminPage` 继承系统页面框架；
- 使用 `ctx.users.requireVip` 与 `ctx.security.csrfProtection` 保护写入操作；
- 使用 `ctx.events` 通知事件，并通过生命周期安全关闭。

复制该目录后，先同时修改目录名、`manifest.json.id`、展示名称、路由前缀和数据库表逻辑。`manifest.json` 中的 ID 必须和目录名一致。

从开发 Kit 根目录打包：

```powershell
npm run pack -- .\example-plugin .\dist\example-plugin-0.1.0.zip
```

然后以 ZIP 文件安装：

```powershell
ccicc plugin install --file .\dist\example-plugin-0.1.0.zip
```

示例仅用于开发参考；发布前请完成上级目录的 `CHECKLIST.md`。
