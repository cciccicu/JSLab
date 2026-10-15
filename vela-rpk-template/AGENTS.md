# 独立 RPK 引擎模板

默认适配 336×480 / designWidth 336，另以静态构建目标适配 REDMI Watch 5 的 432×514 / designWidth 432。遵守根目录兼容性与设备授权要求。
运行页由 scripts/sync-runtime.cjs 从 vela-quickapp 的运行页派生；运行时、持久化和对话框文件原样同步，勿直接修改生成文件。
仅开发时编译并导出模板。云端只读模板并在内存替换资源、签名，禁止将用户脚本、证书或产物写入服务器磁盘。
build 命令不连接任何设备。不要运行 server/watch/ADB。
`npm run build` 顺序预编译并导出两个设备模板。公共设备覆盖来自 `vela-quickapp/targets/redmi-watch5/`，本项目关于页覆盖位于 `targets/redmi-watch5/`。云端未指定设备的旧请求继续使用默认手环模板。
