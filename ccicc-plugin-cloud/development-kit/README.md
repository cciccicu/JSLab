# ccicc.icu 插件开发 Kit

此 Kit 与当前 ccicc.icu 插件运行时接口同步，包含：

- `ccicc-plugin-api.d.ts`：可直接复制到 JavaScript 或 TypeScript 插件目录的类型声明；
- `example-plugin/`：具备配置、数据库、前后台路由、CSRF、权限、导航、模块和静态资源的可安装示例；
- `tools/pack-plugin.mjs`：生成符合系统安装器要求的 ZIP；
- `CHECKLIST.md`：发布检查清单。

## 使用方法

```powershell
# 复制示例并重命名；目录名、manifest.json 中的 id 必须一致
Copy-Item .\example-plugin .\my-plugin -Recurse

# 在 Kit 根目录安装打包所需依赖（仅开发机）
npm install

# 生成安装包。ZIP 根目录会直接包含 manifest.json。
npm run pack -- .\my-plugin .\dist\my-plugin.zip

# 通过系统 CLI 安装
ccicc plugin install --file .\dist\my-plugin.zip
```

不要将 `node_modules`、构建缓存、环境文件或密钥打入安装包。插件的 npm 依赖应写在插件自己的 `package.json.dependencies` 中，由平台安装。

接口签名见 `ccicc-plugin-api.d.ts`，完整生命周期用法见 `example-plugin/`，发布前请逐项完成 [插件发布检查清单](CHECKLIST.md)。
