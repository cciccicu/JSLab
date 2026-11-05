# Xiaomi XMS Wearable SDK

`xms-wearable-lib_1.4_release.aar` 来自小米 Vela 官方 Interconnect 页面提供的开发测试示例，未修改 SDK 二进制文件。

- 官方入口：https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html
- 官方示例：https://cdn.cnbj3-fusion.fds.api.mi-img.com/quickapp-vela/interconnect_dev_test_demo.zip
- 示例内路径：`interconnect_dev_test_demo/libs/xms-wearable-lib_1.4_release.aar`
- SHA-256：`9c40fd1c5409bb948523d503af71e2978ae522c35636afe7d64f474c0f6bc195`
- 获取日期：2026-10-22。

SDK 的权利与使用条件归小米所有，不随本项目源码许可证重新授权。官方 SDK 未提供 Maven 坐标，故从官方示例引用 AAR；未使用第三方重打包或逆向的蓝牙协议。AAR 的实际 `MessageApi.removeListener` 签名为 `removeListener(String nodeId)`，优先于 PDF 中旧版的双参数示例。
