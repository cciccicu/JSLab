# 独立 RPK 引擎模板

适配 336×480，designWidth 336。遵守根目录兼容性与设备授权要求。
运行页由 scripts/sync-runtime.cjs 从 vela-quickapp 的运行页派生；运行时、持久化和对话框文件原样同步，勿直接修改生成文件。
仅开发时编译并导出模板。云端只读模板并在内存替换资源、签名，禁止将用户脚本、证书或产物写入服务器磁盘。
build 命令不连接任何设备。不要运行 server/watch/ADB。
