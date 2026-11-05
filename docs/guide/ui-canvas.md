# 绘制画布

> 最低支持版本：JSLab 2.0.7。请使用该版本的最新构建；早期测试包的尺寸参数和 RGBA 数组支持可能不完整。独立应用需要用新版引擎重新导出。

用 `ui.canvas()` 绘制简单图形。创建的画布同时也是一个界面组件，可以放入 row、column 或 stack。本文的代码块都可以单独运行。

## 创建、绘制与显示

先创建画布，再绘图。绘图只改变内存；等待 `submit()` 写入成功，然后调用 `ui.refresh()` 显示：

```js
const canvas = ui.canvas({
  pixelWidth: 160, pixelHeight: 96, width: '100%'
});
async function draw() {
  canvas.clear('#181818');
  canvas.rect(20, 20, 80, 50, { color: '#ff6600' });
  await canvas.submit();
  ui.refresh();
}
ui.render([canvas, ui.button('重新绘制', draw)]);
return draw();
```

在渲染函数外创建一次 canvas，并在初始化或按钮回调中绘图。每次更新继续使用同一个画布。

尚未提交的绘图不会显示。提交失败时保留上一幅画面；提交成功表示图片已写入，还需要原生组件加载显示。建议按需绘制，避免频繁提交。

## 调整画布大小

`pixelWidth/pixelHeight` 是绘图分辨率，建议从 160×96 开始。这两个值必须是正整数，创建后只读；绘图边界可以用 `canvas.pixelWidth/pixelHeight` 获取。

`width/height` 是显示大小。width 支持数值或百分比，默认使用父容器可用宽度；height 省略时按像素比例计算。上面的示例铺满父容器，但仍只处理 160×96 个像素。

直接修改 `canvas.width` 或 `canvas.height` 后调用 `ui.refresh()` 即可，不必重新提交。放大显示不会增加像素数量。`fit` 的用法与[图片](ui-images.md)相同，默认 contain。

## 绘制常用图形

绘图坐标从左上角开始，以内存像素为单位。小数坐标按最近的整数取整，超出画布的绘图部分会裁剪。

| 方法 | 用途 | 最低支持版本 |
| --- | --- | --- |
| `clear(color?)` | 清屏；省略颜色时清为透明 | 2.0.7 |
| `rect(x, y, width, height, options?)` | 绘制矩形 | 2.0.7 |
| `circle(x, y, radius, options?)` | 以 x、y 为圆心绘制圆形 | 2.0.7 |
| `line(x1, y1, x2, y2, options?)` | 连接两个端点 | 2.0.7 |
| `setPixel(x, y, color)` | 替换一个像素，包括透明度 | 2.0.7 |
| `getPixel(x, y)` | 读取一个像素的 RGBA 值 | 2.0.7 |
| `submit()` | 提交当前像素，返回 Promise；成功后再刷新界面 | 2.0.7 |

形状的 options 可以设置 `color` 和 `lineWidth`，默认白色、线宽 1 像素。矩形和圆默认填充；设置 `fill: false` 只画边框，边框向内延伸。矩形宽高与圆半径不能为负。

## 读取和复制像素

`getPixel()` 返回 `[r,g,b,a]` 数组，依次是红、绿、蓝和透明度。四项都是 0–255 的整数；透明度为 0 时完全透明，255 时不透明。

`setPixel()` 可以直接接收这个数组。下面把一个橙色像素复制到相邻位置：

```js
const canvas = ui.canvas({
  pixelWidth: 16, pixelHeight: 16, width: 160
});
canvas.setPixel(4, 4, [255, 128, 0, 255]);
canvas.setPixel(5, 4, canvas.getPixel(4, 4));
ui.render(canvas);
return canvas.submit().then(() => ui.refresh());
```

读取结果是独立数组，写入时复制数组中的颜色值。修改颜色后再次调用 `setPixel()` 即可更新画布。读取画布外的像素会报错。

## 设置颜色

颜色字符串支持 `#RGB`、`#RRGGBB`、`rgb()` 和 `rgba()`。只有 setPixel 额外接受 RGBA 数组；clear、line、rect、circle 继续使用字符串。

数组必须恰好有四项，透明度也使用 0–255 的整数。颜色字符串 `rgba()` 的透明度仍使用 0–1，例如 `rgba(255,128,0,0.5)`。

绘图颜色、数组长度或通道值无效时会抛错，并保留原像素。普通组件的外观颜色无效时使用默认值，这与绘图方法不同。

## 修改布局与复用画布

画布支持已有的 `id/background/radius/x/y/flex` 等布局属性，直接修改后调用 `ui.refresh()`。id 必须全页唯一，x/y 只在 stack 中生效。background 和 radius 只改变显示外观，不改动绘图像素。

始终复用原来的 canvas。不要用 `{ ...canvas }`、`Object.assign({}, canvas)` 或 JSON 复制来创建新节点；复制品没有关联的像素内容，渲染会报错。

## 旧脚本的尺寸写法

原来的 `ui.canvas({ width, height })` 仍然有效：同时省略两个 pixel 参数时，width/height 一起决定像素与显示尺寸，并保持只读；width 默认使用根内容宽。新脚本建议分别设置 pixelWidth/pixelHeight 和显示尺寸，不要只传一个 pixel 参数。

继续查看[制作交互界面](ui-api.md)或[显示图片](ui-images.md)。编辑器补全可使用 [UI 类型声明](../../types/ui-api.d.ts)。
