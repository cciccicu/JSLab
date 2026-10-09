# JSLab UI API

当前所有 JavaScript 脚本共用一个运行器，均同时注入 `console/ui/dialog/script/system`。
文件名 `.ui.js` 不再选择运行能力，旧文件不会被自动改名。

- [UI 组件、布局与更新](ui-api.md)
- [统一运行模型、日志、导航与对话框](runtime-api.md)
- [完整类型声明](runtime-api.d.ts)
- [UI 性能建议与验证](ui-performance.md)

UI 的编译缓存、浅层原生树、自定义颜色和字段更新继续保留。按钮自由定位使用 `ui.stack` 的 `x/y/width/height`。
