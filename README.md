<div align="center">
  <img src="vela-quickapp/src/common/logo.png" width="96" alt="JSLab" />
  <h1>JSLab</h1>
  <p>在手腕上编写、运行和分享 JavaScript</p>
  <p><a href="https://ccicc.icu/jslab-cloud/downloads">下载安装</a> · <a href="docs/README.md">文档</a> · <a href="CONTRIBUTING.md">参与开发</a> · <a href="LICENSE">GPL-3.0</a></p>
</div>

JSLab 是面向小米 Vela 穿戴设备的 JavaScript 开发环境。设备端提供代码编辑器、脚本运行器和原生交互界面；Android 与 AstroBox 配套端用于编辑和传输脚本；JSLab Cloud 提供云空间、作品市场、AI 辅助编写和独立快应用导出。

脚本在设备上执行，文件由用户主动上传或下载。项目同时维护 Pro 手环与 RW 手表的静态布局，旧脚本和旧客户端接口保持兼容。

## 开始使用

- 安装应用：[版本与安装指南](docs/guide/installation.md)。
- 第一次写脚本：[快速上手](docs/guide/getting-started.md)、[脚本基础](docs/guide/script-basics.md)。
- 连接配套端：[Android 与 AstroBox 同步](docs/guide/sync-guide.md)。
- 使用云端：[云账户与云空间](docs/guide/cloud-guide.md)、[作品市场](docs/guide/market-guide.md)。
- 深入实现：[运行器、编辑器与快应用打包原理](docs/guide/how-jslab-works.md)。

## 项目组成

本仓库采用多项目结构，各端独立安装依赖、构建和发布。根目录不安装所有平台的工具链。

| 目录 | 职责 | 开发入口 |
| --- | --- | --- |
| [vela-quickapp](vela-quickapp/README.md) | Vela 设备端编辑器、运行器与原生 UI | [快应用开发](docs/development/quickapp.md) |
| [android-sync](android-sync/README.md) | 原生 Android 同步器与代码编辑器 | [Android 开发](docs/development/android.md) |
| [astrobox-plugin-sync](astrobox-plugin-sync/README.md) | AstroBox v2 WASI 同步插件 | [AstroBox 开发](docs/development/astrobox.md) |
| [ccicc-plugin-cloud](ccicc-plugin-cloud/README.md) | ccicc.icu 的 JSLab Cloud 插件 | [云端开发与部署](docs/development/cloud.md) |
| [vela-rpk-template](vela-rpk-template/README.md) | 独立快应用的预编译引擎模板 | [模板维护](docs/development/rpk-template.md) |
| [vela-luawatchface](vela-luawatchface/README.md) | JSLab Helper Lua 表盘 | [表盘开发](docs/development/watchface.md) |
| [docs](docs/README.md) | 使用指南、接口、架构、协议与开发文档 | 按读者和任务组织 |
| [types](types/runtime-api.d.ts) | 脚本环境的 TypeScript 类型声明 | 在编辑器中提供补全 |
| [examples](examples/README.md) | 独立脚本示例与人工验收脚本 | 可导入设备运行 |
| [scripts](scripts/check-repository.cjs) | 仓库结构检查与本地清理 | 不连接设备 |

## 从源码开始

```sh
git clone https://github.com/cciccicu/JSLab.git
cd JSLab
node scripts/check-repository.cjs
```

JavaScript 构建与检查使用 Node.js 24；依赖版本由各项目的锁文件固定。按需要选择一个项目，无需一次安装全部工具链。

```sh
# 设备端：安装依赖、检查并构建 Pro 调试包
cd vela-quickapp
npm ci
npm run check:contract
npm run check:devices
npm run build:bandpro
```

RW 构建、社区版、签名与产物位置见[设备布局与构建](docs/development/device-layouts.md)。Android 需要 JDK 17 或 21、Android SDK 36 和官方穿戴 SDK；AstroBox 需要 Rust 与 `wasm32-wasip2`；表盘编译器由开发者自行准备。各项目 README 提供对应的最短构建步骤。

云端插件可直接使用仓库内的预编译 RPK 模板，普通云端开发无需先编译设备端。更改运行引擎后，必须按[模板维护说明](docs/development/rpk-template.md)重新生成两种模板。

## 开发与发布

阅读[架构与模块边界](docs/development/architecture.md)、[贡献指南](CONTRIBUTING.md)和[发布流程](docs/development/releasing.md)。仓库检查与 CI 验证文档、运行契约及可在主机执行的测试；设备安装、模拟器和生产部署需要单独执行。

所有人工维护的长文档集中在 `docs/`。云端帮助从 `docs/guide/` 和 `types/` 生成，发布包自带所需资源。生成文件、本地工具、私钥、SDK 二进制和安装包不作为源码提交，具体边界见[文档与仓库维护](docs/development/repository.md)。

## 许可证与第三方组件

项目采用 [GPL-3.0](LICENSE)。第三方代码、字体、语法文件与工具保留各自许可，详见[第三方组件说明](THIRD_PARTY_NOTICES.md)。官方穿戴 SDK 和表盘编译器由开发者按上游条件自行获取，不随本仓库源码重新授权。
