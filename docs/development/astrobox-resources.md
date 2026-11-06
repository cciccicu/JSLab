# 将 JSLab 社区版更新到 AstroBox 官方源

[`scripts/submit-astrobox.py`](../../scripts/submit-astrobox.py) 自动上传社区版安装包、更新资源清单，并向 AstroBox 官方源提交更新 PR。它使用现有的 **JSLab社区版** 条目，资源 ID 为 `icu.ccicc.jslab`。

| 用途 | 仓库 |
| --- | --- |
| 安装包、资源介绍与图片 | [cciccicu/JSLab_AstroBox_Release](https://github.com/cciccicu/JSLab_AstroBox_Release) |
| 官方资源目录与审核 | [AstralSightStudios/AstroBox-Repo](https://github.com/AstralSightStudios/AstroBox-Repo) |

JSLab Sync 的 ABP 插件有自己的分发仓库，发布步骤见 [AstroBox 插件分发](astrobox-release.md)。

## 准备

需要 Python 3.10 或更新版本，以及 Git。脚本只使用 Python 标准库。

使用 Git Credential Manager 登录拥有资源仓库写入权限的 GitHub 账户；脚本会读取已有登录。也可通过 `GH_TOKEN` 或 `GITHUB_TOKEN` 环境变量提供令牌。账户需要能更新资源仓库与自己的官方源 Fork，并创建 PR。凭据仅在进程内使用。

按[快应用开发指南](quickapp.md)构建两个社区版发布包，将它们放在 `vela-quickapp/release-archive/`：

```text
JSLab-Community-Pro-2.0.7.rpk
JSLab-Community-RW-2.0.7.rpk
```

脚本从包内读取版本和 `versionCode`，核对包名、社区版名称、设备布局、签名证书文件与 ZIP 完整性。Pro 对应手环 9 Pro、10 Pro；RW 对应现有条目中的 REDMI Watch 5、5 eSIM、6。设备范围沿用官方条目。

把本次面向用户的更新说明写入 UTF-8 文本文件，例如 `.local-tools/astrobox-2.0.7.txt`。支持 Markdown，每次更新会保留以前的版本记录。

## 提交

在 JSLab 根目录执行：

```sh
python scripts/submit-astrobox.py --version 2.0.7 --notes-file .local-tools/astrobox-2.0.7.txt
```

先查看计划可加 `--dry-run`。从其他目录读取安装包可加 `--package-dir`；需要本地代理时可加 `--proxy http://127.0.0.1:7890`。默认直连，不自动切换代理。

脚本会依次完成：

1. 读取官方条目与发布仓库当前提交，检查已有待审核 PR。
2. 将两个 RPK 和更新后的 `manifest_v2.json` 合为一个资源提交；保留介绍、图片、作者、链接及历史安装包。
3. 在自己的官方源 Fork 中创建提交分支，只写入 `tmp/<账号>/jslab_astrobox_release/resource.csv` 与 `request.json`。CSV 沿用原条目，仅更新资源提交短哈希；请求使用 `mode: edit`，带上原目录行摘要与目录提交。
4. 创建 PR，输出审核链接。已有对应待审核 PR 时更新原分支；相同文件会跳过上传。

脚本创建的分支直接基于官方源最新提交，Fork 的 `main` 保持原样。首次使用且尚无 Fork 时会创建 Fork，待 GitHub 初始化完成后重新运行同一条命令即可。

提交后由官方维护者审核、合并，并通过官方工作流应用到 `index_v2.csv`。可从输出的 PR 链接查看进度。

## 重复运行与版本管理

网络中断后可重新执行同一条命令。已经上传成功的文件会根据 Git blob 摘要跳过；已创建的待审核 PR 会继续使用。官方目录已经引用当前资源提交时，脚本直接提示完成。

同一 `versionCode` 只接受相同安装包。修改包内容后，应先提升版本并重新构建。资源介绍、图片或设备范围的编辑继续使用 Creator Console；脚本专注于现有条目的版本更新。

## 提交协议来源

实现依据 [AstroBox 官方适配说明](https://github.com/AstralSightStudios/AstroBox-Repo/blob/main/assets/docs/ResAdptV2.md)、[官方提交校验脚本](https://github.com/AstralSightStudios/AstroBox-Repo/blob/main/.github/scripts/resource_submissions.py) 和 [Creator Console 提交协议](https://github.com/AstralSightStudios/AstroBoxCreatorConsole/blob/main/app/logic/publish/submission-protocol.ts)。当前自动审核流程要求 PR 只包含一个资源的 `resource.csv`、`request.json`；根目录索引由官方工作流更新。
