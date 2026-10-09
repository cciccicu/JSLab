# UI 性能建议与验证

当前所有脚本共用 UI v2。组件数量、布局层数和二维码数量没有额外硬上限；
40 个声明节点、160 个绘制节点、4 层布局和 2 个二维码只是 336×480 手环的首屏性能参考。
公开规则见 [UI API](ui-api.md) 和 [统一脚本 API](runtime-api.md)。

## 编写脚本

- 给动态重排的控件设置稳定且唯一的 id，静态描述可提前构造。
- 同一同步调用中的 signal 更新会合并；相同值或相同对象引用不会触发刷新。
- render factory 保持纯函数，不在里面修改 signal 或调用 refresh。
- 大量组件分批显示，避免高频全量更新；二维码使用短内容并保持清晰对比。
- 隐藏 UI 时只记录待更新状态，恢复时合并刷新。

## 当前引擎

uiLayout 编译布局并缓存静态描述，uiPublisher 保留稳定拓扑中的数组和节点对象，
只发布变化字段。编译快照与响应式数据分离，失败编译保留上一幅有效界面。
运行页采用对象样式绑定，避免为每次变化重新生成动态 CSS 字符串。
这些实现沿用统一运行契约，不需要脚本选择不同运行模式。

## 本地验证

在 vela-quickapp 目录执行：

```powershell
npm run test:ui
npm run bench:ui:final
```

测试覆盖节点增删重排、稳定身份、失败回滚、回调更新、样式等价、脚本数据与游戏逐帧结果。
bench:ui:final 使用 tests/fixtures/uiLayout-v5.js 作为冻结基线，比较纯 JS 构造、编译与发布开销。
历史基准入口 bench:ui、bench:ui:optimized 保留供复现，不是当前设备的性能承诺。

## 设备诊断

[UI 性能诊断项目](../diagnostics/ui-performance-app/README.md) 比较动态字符串与对象样式绑定；
[运行器验收脚本](../diagnostics/unified-runner-check.js) 检查切换、重载与对话框。
设备连接与部署需要用户明确授权。

Node 基准不包含 Vela 原生绘制、交互延迟或设备内存。诊断的微任务和 timer 边界也不代表
屏幕实际绘制完成，不能把本地耗时直接换算为手环响应速度。
