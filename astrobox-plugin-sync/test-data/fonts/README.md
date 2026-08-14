# 字体上传测试夹具

这些文件用于测试 AstroBox 字体上传和 Lua 表盘安装流程，不会打入 JSLab 默认字体。

测试 `SarasaTermSCNerd-Misans-v2.ttf` 时，请在 AstroBox 字体表单中使用同名 JSON
中的参数：

- 名称：`Sarasa Term SC Nerd`；
- 行高倍率：`1.5543`；
- 行高偏移：`0.4022`；
- ASCII 字宽倍率：`0.5`；
- 宽字符字宽倍率：`1`。

这些参数来自 JSLab 旧版 Sarasa 编辑器测量公式：
`fontSize * 1.5543 + 0.4022`，用于保持光标定位和点按命中计算一致。
