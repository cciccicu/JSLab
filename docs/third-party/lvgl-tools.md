# LVGL 图片转换工具

`vela-luawatchface/watchface/tools/LVGLImage.py` 保留了 LVGL 图片转换器主体，并包含本地适配。上游源码可对照 [LVGL v9.3.0 的转换器](https://github.com/lvgl/lvgl/blob/v9.3.0/scripts/LVGLImage.py)，MIT 许可保存在同目录的 [LICENSE.LVGL](../../vela-luawatchface/watchface/tools/LICENSE.LVGL)。

原始引入版本尚未记录；追溯来源时可将本地适配与上述上游版本对照。后续更新应记录上游版本及修改范围，并保留许可。

`LVGLImage_v8.py` 是本项目用于 v8 资源格式的适配入口。Python 依赖由项目的 requirements.txt 声明；生成的图片与资源二进制保存在忽略的产物目录。表盘 Compiler.exe 是另行准备的本地工具，不由这里的 MIT 许可重新授权。
