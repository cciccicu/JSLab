# 设备端内置字体

当前内置字体为 **JSLab Wrist Mono**：英文、中文及标点统一取自 Sarasa Mono SC，单色图标取自 Noto Emoji。两者均采用 SIL Open Font License 1.1，派生字体也按 OFL-1.1 分发。编辑器、市场源码预览、脚本 UI 和日志共用 `vela-quickapp/src/common/fonts/active.ttf`；独立 RPK 模板在构建前从主项目同步同一文件。系统对话框仍由固件选择字体。

文件大小 **2,052,148 字节（1.957 MiB）**，SHA-256：`9ece34cc9512c6617616cb2bf33a6755231e36561e21f7cc48920f7b8ba670b3`。

## 字符覆盖与排版

保留输入法词库全部 **6,763 个汉字**，连同英文键盘和中文符号共 **6,878 个可输入字符**，以及少量常用数学、货币和排版符号。图标保留 **144 个单字符 Emoji**；清单统一维护在 `jslab-cloud/lib/ai-prompt-emoji.json`，新版 AI 提示词从该清单生成。选用图标时从清单复制字符，其余含义用文字表达。

字体共映射 7,089 个字符，使用每 em 1,000 单位；ASCII 字宽 500，汉字、中文标点和清单图标字宽 1,000。升部 830、降部 −170、行距为 0。Sarasa 字形整体下移 30 单位并居中调整标点；超出行框的半角括号等比缩小约 0.2%，保持轮廓比例。所有可见轮廓位于行框内。删除提示指令、无用布局表和未选中的字形，再无损共享重复轮廓。图标为单色轮廓，跟随文字颜色，不依赖彩色字体扩展。

U+FE0E、U+FE0F 及连接控制符为零宽；提供图标的文本／Emoji 变体映射，但不提供肤色、旗帜或 ZWJ 组合字形。AI 提示词要求直接使用清单里的单字符，不附加变体选择符。字体配置记录额外全角字符与零宽字符，编辑器据此计算宽度；旧的自定义字体配置仍保留原有计量方式。

## 上游来源

| 组成 | 固定版本与来源 | SHA-256 | 许可 |
| --- | --- | --- | --- |
| Sarasa Mono SC Regular | [Sarasa Gothic 1.0.43](https://github.com/be5invis/Sarasa-Gothic/releases/tag/v1.0.43) | `f0db6e00d3f9ffc3643430483410fd463758d8da93204f1ed1d30278afc2db28` | SIL Open Font License 1.1 |
| Noto Emoji | [Google Fonts 字体源](https://github.com/google/fonts/tree/main/ofl/notoemoji)，3.002，取 wght=400，Git blob `c2c26ab612a88a8610ff9cfbb89299bf2aea6c7a` | `de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551` | SIL Open Font License 1.1 |

完整原始许可与版权声明随字体保存为 [LICENSE.Sarasa](../../vela-quickapp/src/common/fonts/LICENSE.Sarasa) 和 [LICENSE.NotoEmoji](../../vela-quickapp/src/common/fonts/LICENSE.NotoEmoji)，复制到独立 RPK 模板时一并保留。派生字体使用独立名称 JSLab Wrist Mono，字体内部也记录来源、OFL-1.1 许可和上游版权。这些字形不按本仓库的 GPL 重新授权。

## 构建与验证

生成脚本为 [scripts/build-font.py](../../vela-quickapp/scripts/build-font.py)，依赖版本固定在 [font-requirements.txt](../../vela-quickapp/scripts/font-requirements.txt)。通常编译直接使用已提交的字体资产；只有调整字体时才需要 Python 和上游字体源文件。

从上表来源取得对应版本的 TTF，在 `vela-quickapp/` 执行以下命令，把字体目录替换为实际路径：

```sh
python -m pip install -r scripts/font-requirements.txt
python scripts/build-font.py --sarasa "字体目录/SarasaMonoSC-Regular.ttf" --emoji "字体目录/NotoEmoji-Variable.ttf"
```

脚本离线核对两个上游文件的 SHA-256，读取输入法词库、键盘符号和 Emoji 清单，输出到已忽略的 `build/font/`；可用 `--output` 指定其他位置。输出包含 TTF、预览用 WOFF2、字体配置、逐字符来源、覆盖报告和两份许可文件。时间戳固定，生成过程不依赖旧字体或个人工具目录。

检查报告后，将生成的 `JSLabWristMono-Regular.ttf` 和 JSON 配置分别复制为 `src/common/fonts/active.ttf`、`active.json`。如度量配置改变，还需同步编辑器默认配置；然后按[模板维护说明](../development/rpk-template.md)同步并重建两个设备模板。

更新时核对字符覆盖、字宽、行框、轮廓共享结果及 2 MiB 导入上限，同步字体配置、AI 清单与两个设备的 RPK 模板，并在目标设备上检查显示效果。

## 再分发要求

字体来源与派生字体均采用 OFL-1.1。分发字体或含字体的安装包时，保留上游版权与许可；继续修改时遵守保留字体名、署名和分发条件。字体可以随软件分发，OFL 禁止单独出售字体，并要求派生字体继续使用 OFL。完整条款见随附许可。
