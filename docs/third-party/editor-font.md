# 设备端内置字体

当前内置字体为 **JSLab Wrist Mono**：Ubuntu Mono 英文及半角符号、Sarasa Mono SC 中文、Noto Emoji 单色图标。编辑器、市场源码预览、脚本 UI 和日志共用 `vela-quickapp/src/common/fonts/active.ttf`；独立 RPK 模板在构建前从主项目同步同一文件。系统对话框仍由固件选择字体。

文件大小 **2,050,884 字节（1.956 MiB）**，SHA-256：`c861fc76f28eb7e4b54e52aa390a749994173fdd23564919a546ae585c7e44af`。

## 字符覆盖与排版

保留输入法词库全部 **6,763 个汉字**，连同英文键盘和中文符号共 **6,878 个可输入字符**，以及少量常用数学、货币和排版符号。图标保留 **144 个单字符 Emoji**；清单的唯一维护位置是 `ccicc-plugin-cloud/jslab-cloud/lib/ai-prompt-emoji.json`，新版 AI 提示词从该清单生成。没有收录的 Emoji 应换成文字，不承诺支持整个 Unicode 字库。

字体使用每 em 1,000 单位；ASCII 字宽 500，汉字、中文标点和清单图标字宽 1,000。升部 830、降部 −170、行距为 0。中文轮廓保持原比例，使用竖向平移与标点居中调整；删除提示指令、无用布局表和未选中的字形，再无损共享重复轮廓。图标为单色轮廓，跟随文字颜色，不依赖彩色字体扩展。

U+FE0E、U+FE0F 及连接控制符为零宽；提供图标的文本／Emoji 变体映射，但不提供肤色、旗帜或 ZWJ 组合字形。AI 提示词要求直接使用清单里的单字符，不附加变体选择符。字体配置记录额外全角字符与零宽字符，编辑器据此计算宽度；旧的自定义字体配置仍保留原有计量方式。

## 上游来源

| 组成 | 固定版本与来源 | SHA-256 | 许可 |
| --- | --- | --- | --- |
| Ubuntu Mono Regular | [Google Fonts 字体源](https://github.com/google/fonts/tree/main/ufl/ubuntumono)，0.80，Git blob `fdd309d716629f4e5339d5e5508225ed857a3ede` | `b35dd9d2131d5d83a9b87fe9ad22c6288fa3d17688d43302c14da29812417d63` | Ubuntu Font Licence 1.0 |
| Sarasa Mono SC Regular | [Sarasa Gothic 1.0.43](https://github.com/be5invis/Sarasa-Gothic/releases/tag/v1.0.43) | `f0db6e00d3f9ffc3643430483410fd463758d8da93204f1ed1d30278afc2db28` | SIL Open Font License 1.1 |
| Noto Emoji | [Google Fonts 字体源](https://github.com/google/fonts/tree/main/ofl/notoemoji)，3.002，取 wght=400，Git blob `c2c26ab612a88a8610ff9cfbb89299bf2aea6c7a` | `de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551` | SIL Open Font License 1.1 |

完整原始许可随字体保存为 `LICENSE.UbuntuMono`、`LICENSE.Sarasa` 和 `LICENSE.NotoEmoji`，复制到独立 RPK 模板时一并保留。这些字形不按本仓库的 GPL 重新授权。

## 构建与验证

本地处理工具位于已忽略的 `.local-tools/font-build/`，不作为公开项目构建依赖；通常编译直接使用已准备的字体资产。处理工具读取输入法词库、键盘符号和上述 Emoji 清单，核对上游文件摘要，输出 TTF、预览用 WOFF2、字体配置与覆盖报告。原字体覆盖基线保存在本地预览资产中，不从每次生成后的 active.ttf 反向扩大子集。

更新时必须核对全部输入字符和清单图标、字宽、行框、轮廓共享前后的一致性及 2 MiB 导入上限，并同步字体配置、AI 清单与双端 RPK 模板。浏览器和离线字形验证不能替代设备字体渲染验证。

## 公开发布前的待办

当前字体不再包含 MiSans 字形，但仍需确认 UFL 与 OFL 对合并衍生字体的分发要求。保留上游许可、更名和替换字形不代表该问题已经解决。**公开发布前需确认组合字体的分发许可，取得必要授权或采用许可兼容的替代方案，并整理可公开复现的处理工具与来源。**
