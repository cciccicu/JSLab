# JSLab 示例脚本

将示例源码导入设备端 JSLab 即可运行。脚本使用 JSLab 注入的运行接口，不是 Node.js 或浏览器程序。

| 目录 | 内容 |
| --- | --- |
| [scripts](scripts/aurora-lights-out.js) | 独立示例：极光熄灯游戏 |
| [图片与画布](scripts/image-canvas.js) | Base64 图标、内存绘图，以及 submit 后显式刷新 |
| [market](market/catalog.json) | 井字棋、数字华容道、猜数字、随机决策、二维码与分账工具；目录信息在 catalog.json |
| [diagnostics](diagnostics/unified-runner-check.js) | 人工运行器验收脚本，用于视图切换、重载和对话框检查 |

设备运行需自行安装和导入。主机检查不会自动把这些脚本发送给设备。接口说明见[脚本指南](../docs/guide/script-basics.md)和[完整运行参考](../docs/reference/runtime-api.md)。
