# 显示图片

> 最低支持版本：JSLab 2.0.7。本页的图片地址、Base64、显示尺寸和 fit 用法均适用。

用 `ui.image(source, options)` 显示图片。可以使用已有图片的地址，也可以把小图标的 Base64 编码直接放进脚本。

## 显示一个 Base64 小图标

下面是一个橙色像素的 PNG 编码，放大显示为 32×32 的小方块。整段代码可以直接运行，不需要准备图片文件：

```js
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' +
  'CAYAAAAfFcSJAAAADUlEQVR4AWP438DwHwAGgAJ/' +
  '4jyYEwAAAABJRU5ErkJggg==';
ui.render(ui.image(png, {
  format: 'png', width: 32, height: 32
}));
```

Base64 是图片的文字编码。这里只提供了编码内容，所以用 `format: 'png'` 指定格式；JPG 图片可以写 `jpg` 或 `jpeg`。

如果已有完整的数据地址，例如以 `data:image/png;base64,` 或 `data:image/jpeg;base64,` 开头的字符串，直接作为 source 传入即可，不需要再写 format。

## 使用自己的图片

把 source 换成已有的本地文件地址或网络图片地址，就可以显示自己的图片。例如，本地文件可以使用 `internal://files/` 下的地址；请先准备好对应文件，再运行脚本。传地址时不需要 format。

Base64 图片目前支持 PNG/JPG，适合小图标。加载完成后界面会自动更新，相同内容会复用缓存。加载失败时，到日志页查看错误。

## 设置显示大小

用 `width` 和 `height` 控制显示大小。width 支持像素或百分比；省略时使用父容器的可用宽度。height 使用像素，省略时按显示宽度预留正方形。小图标建议明确设置宽高。

`fit` 控制图片怎样放进这块区域：

| 值 | 显示方式 |
| --- | --- |
| `contain` | 默认值，保持比例并完整显示 |
| `cover` | 保持比例铺满区域，超出部分裁剪 |
| `none` | 不缩放 |
| `scale-down` | 需要时缩小，不放大 |

图片可以像文字一样放入 row、column 或 stack，也支持 `id/background/radius/x/y/flex`。排列方式见[制作交互界面](ui-api.md)。

需要自己绘制线条或图形时，继续看[绘制画布](ui-canvas.md)。编辑器补全可使用 [UI 类型声明](../../types/ui-api.d.ts)。
