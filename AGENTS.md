# AGENTS.md - Vela JS 应用开发指南

> 本文档基于 [Xiaomi Vela JS 应用开发文档](./VelaDocs/docs/zh/guide/) 整理，专为智能可穿戴设备应用开发设计。  
> **固定适配尺寸：width: 336px; height: 480px**（小米手环 Pro 分辨率）
> 文档检索工具：./VelaDocs/search.py，用法：python search.py "Vela OS"

---

## 重要提示：这不是 HTML/EJS 模板开发

**Vela JS 应用使用专有的 UX 语法，而非标准 HTML 或 EJS 等模板引擎。** 虽然语法可能与 HTML 相似，但 Vela 拥有自己的组件系统、渲染引擎和开发范式。

---

## Vela JS 架构概述

Vela JS 应用是基于小米 Vela OS 的轻量级应用模型，专为内存和处理能力有限的智能可穿戴设备设计。

### 核心特性

- **轻量级**：更小的体积，便于在可穿戴设备上快速加载和运行
- **跨平台**：一次开发，多端运行
- **高性能**：优化渲染能力，支持 60fps 流畅体验
- **安全性**：三重隔离机制，保障数据与设备安全

### 应用场景

- 健康监测：实时监测心率、睡眠质量等健康数据
- 运动辅助：记录运动数据，提供运动指导
- 消息提醒：显示手机等设备的通知消息
- 智能控制：作为智能家居控制中心远程操控设备
- 日常工具：提供天气预报、闹钟、计时器等工具功能

---

## 项目结构

```
├── manifest.json          # 项目配置文件
├── app.ux                 # 应用生命周期与全局数据
├── pages/
│   ├── index/
│   │   └── index.ux       # 页面文件，包含 template/style/script
│   └── detail/
│       └── detail.ux
├── i18n/                  # 国际化文件
├── common/                # 共享资源（图片、样式、工具函数）
└── resources/             # 应用资源文件
```

[项目结构详解](./VelaDocs/docs/zh/guide/framework/project-structure.md)

---

## UX 文件结构

每个 `.ux` 文件包含三个必需部分：

```html
<template>
  <!-- 使用 Vela 组件编写页面结构 -->
</template>

<style>
  /* 类 CSS 样式，用于组件样式定义 */
</style>

<script>
  // JavaScript 逻辑，控制页面行为
  export default {
    private: {
      // 页面数据
    },
    onInit() {
      // 生命周期钩子
    }
  }
</script>
```

[UX 文件说明](./VelaDocs/docs/zh/guide/framework/ux.md)

---

## 固定尺寸配置（336x480）

### manifest.json 配置

```json
{
  "package": "com.example.demo",
  "name": "示例应用",
  "icon": "/Common/icon.png",
  "versionName": "1.0",
  "versionCode": 1,
  "minAPILevel": 1,
  "features": [
    { "name": "system.router" },
    { "name": "system.fetch" }
  ],
  "config": {
    "designWidth": 336
  },
  "router": {
    "entry": "index",
    "pages": {
      "index": {
        "component": "index",
        "path": "/"
      }
    }
  },
  "display": {
    "backgroundColor": "#000000"
  }
}
```

### 样式基准

- **设计基准宽度**：336px
- **设计基准高度**：480px
- **长度单位**：px（相对于 designWidth）、%、dp
- **布局系统**：仅支持 Flex 布局

[页面样式与布局](./VelaDocs/docs/zh/guide/framework/style/page-style-and-layout.md)

---

## 支持的组件

### 基础组件

| 组件 | 说明 | 文档 |
|------|------|------|
| `text` | 文本展示（所有文本必须使用此组件） | [text 组件](./VelaDocs/docs/zh/components/basic/text.md) |
| `span` | 格式化文本，仅可作为 text/a/span 的子组件 | [span 组件](./VelaDocs/docs/zh/components/basic/span.md) |
| `image` | 图片展示，支持 png/jpg 格式 | [image 组件](./VelaDocs/docs/zh/components/basic/image.md) |
| `progress` | 进度条，支持 horizontal/arc 类型 | [progress 组件](./VelaDocs/docs/zh/components/basic/progress.md) |
| `qrcode` | 二维码生成与展示 | [qrcode 组件](./VelaDocs/docs/zh/components/basic/qrcode.md) |
| `barcode` | 条形码生成与展示（Code128 码） | [barcode 组件](./VelaDocs/docs/zh/components/basic/barcode.md) |

### 容器组件

| 组件 | 说明 | 文档 |
|------|------|------|
| `div` | 基础容器，用作根节点或内容分组 | [div 组件](./VelaDocs/docs/zh/components/container/div.md) |
| `list` | 列表视图容器，仅支持 list-item 子组件 | [list 组件](./VelaDocs/docs/zh/components/container/list.md) |
| `list-item` | 列表项组件，必须设置 type 属性 | [list-item 组件](./VelaDocs/docs/zh/components/container/list-item.md) |
| `scroll` | 滚动视图容器，支持横向/纵向滚动 | [scroll 组件](./VelaDocs/docs/zh/components/container/scroll.md) |
| `stack` | 层叠容器，子组件按顺序堆叠 | [stack 组件](./VelaDocs/docs/zh/components/container/stack.md) |
| `swiper` | 滑块视图容器，支持自动播放/循环 | [swiper 组件](./VelaDocs/docs/zh/components/container/swiper.md) |

### 表单组件

| 组件 | 类型 | 说明 | 文档 |
|------|------|------|------|
| `input` | button/checkbox/radio | 用户输入与选择 | [input 组件](./VelaDocs/docs/zh/components/form/input.md) |
| `picker` | text/time | 滚动选择器 | [picker 组件](./VelaDocs/docs/zh/components/form/picker.md) |
| `switch` | - | 开关选择 | [switch 组件](./VelaDocs/docs/zh/components/form/switch.md) |
| `slider` | - | 滑动选择器 | [slider 组件](./VelaDocs/docs/zh/components/form/slider.md) |

[组件总览](./VelaDocs/docs/zh/components/)

---

## 语法规范

### 数据绑定

```html
<template>
  <text>{{message}}</text>
</template>

<script>
export default {
  private: {
    message: 'Hello'
  }
}
</script>
```

[数据绑定文档](./VelaDocs/docs/zh/guide/framework/template/#数据绑定)

### 事件绑定

支持常规写法与简写语法：

```html
<template>
  <div>
    <text onclick="press"></text>
    <text @click="press"></text>
  </div>
</template>

<script>
export default {
  press(e) {
    this.title = 'Hello'
  }
}
</script>
```

事件回调支持语法：
- `fn`：函数名，`<script>` 中需有对应实现
- `fn(a,b)`：参数可为常量或 `<script>` 中定义的变量
- 回调时自动追加 `evt` 参数，可访问事件上下文数据

[事件绑定文档](./VelaDocs/docs/zh/guide/framework/template/event.md)

### 列表渲染

```html
<template>
  <div>
    <div for="{{list}}" tid="uniqueId">
      <text>{{$idx}}</text>
      <text>{{$item.uniqueId}}</text>
    </div>
  </div>
</template>

<script>
export default {
  private: {
    list: [
      { uniqueId: 1 },
      { uniqueId: 2 }
    ]
  }
}
</script>
```

`for` 指令支持语法：
- `for="{{list}}"`：默认元素名为 `$item`
- `for="{{value in list}}"`：自定义元素名，默认索引名为 `$idx`
- `for="{{(index, value) in list}}"`：自定义索引名与元素名

`tid` 属性注意事项：
- 指定的数据属性必须存在且唯一
- 当前不支持表达式
- 用于复用节点，优化重绘效率

[列表渲染文档](./VelaDocs/docs/zh/guide/framework/template/for.md)

### 条件渲染

两类方式：`if/elif/else` 与 `show`

- `if` 为 `false` 时组件从 VDOM 移除
- `show` 为 `false` 时组件仅不可见，仍存在于 VDOM

```html
<template>
  <div>
    <text if="{{display}}">Hello-1</text>
    <text elif="{{display}}">Hello-2</text>
    <text else>Hello-3</text>
  </div>
</template>
```

注意：`if/elif/else` 节点必须为相邻兄弟节点。

[条件渲染文档](./VelaDocs/docs/zh/guide/framework/template/if.md)

---

## 核心 API

### 页面路由

```javascript
import router from '@system.router'

// 跳转到应用内页面
router.push({
  uri: '/pages/detail',
  params: { key: 'value' }
})

// 替换当前页面
router.replace({
  uri: '/pages/detail'
})

// 返回上一页
router.back()

// 清空历史页面
router.clear()
```

[页面路由文档](./VelaDocs/docs/zh/features/basic/router.md)

### 数据存储

```javascript
import storage from '@system.storage'

// 存储数据
storage.set({
  key: 'userName',
  value: '张三',
  success: () => {}
})

// 读取数据
storage.get({
  key: 'userName',
  success: (data) => {}
})

// 删除数据
storage.delete({ key: 'userName' })

// 清空存储
storage.clear()
```

[数据存储文档](./VelaDocs/docs/zh/features/data/storage.md)

### 网络请求

```javascript
import fetch from '@system.fetch'

fetch.fetch({
  url: 'https://api.example.com/data',
  method: 'GET',
  responseType: 'json',
  success: (res) => {},
  fail: (data, code) => {}
})
```

[数据请求文档](./VelaDocs/docs/zh/features/network/fetch.md)

### 设备信息

```javascript
import device from '@system.device'

device.getInfo({
  success: (ret) => {
    // ret.screenWidth, ret.screenHeight
    // ret.deviceType: watch/band/smartspeaker
    // ret.screenShape: rect/circle/pill-shaped
  }
})
```

[设备信息文档](./VelaDocs/docs/zh/features/basic/device.md)

### 弹窗提示

```javascript
import prompt from '@system.prompt'

prompt.showToast({
  message: '操作成功',
  duration: 2000
})
```

[弹窗文档](./VelaDocs/docs/zh/features/other/prompt.md)

### 振动反馈

```javascript
import vibrator from '@system.vibrator'

vibrator.vibrate({
  mode: 'short'
})
```

[振动文档](./VelaDocs/docs/zh/features/system/vibrator.md)

---

## 关键开发规范

### 模板规范
1. **单根节点**：`<template>` 必须仅包含一个根元素（如 `div`），不可使用 `block` 作为根节点
2. **文本组件化**：所有文本内容必须包裹在 `<text>` 组件中，否则不会显示
3. **列表渲染**：使用 `for` 指令时必须指定 `tid` 属性优化重绘效率

### 样式规范
4. **仅支持 Flex 布局**：Vela 样式系统仅支持 Flex 布局，不支持 Grid/Float 等
5. **固定尺寸**：designWidth 配置为 336，所有尺寸基于此基准
6. **角度单位**：角度相关的 CSS 属性必须书写单位，如 `total-angle: 360deg`

### 数据规范
7. **数据对象**：页面数据使用 `private`/`protected`/`public` 定义，影响数据覆盖机制
8. **Props 传递**：父子组件通信使用 `props`，注意驼峰命名转短横线命名
9. **事件回调**：回调函数末尾自动追加 `evt` 参数，通过 `evt.detail` 访问事件数据

### 生命周期
10. **页面生命周期**：`onInit` → `onReady` → `onShow` → `onHide` → `onDestroy`
11. **应用生命周期**：`onCreate` → `onShow` → `onHide` → `onDestroy` → `onError`

[生命周期详解](./VelaDocs/docs/zh/guide/framework/script/lifecycle.md)

---

## 常见错误避免清单

- ❌ 使用 HTML 标签如 `<p>`、`<span>`、`<h1>` — 请改用 Vela 组件
- ❌ 直接书写文本内容 — 必须使用 `<text>` 组件包裹
- ❌ 模板中存在多个根节点 — 请使用单一容器包裹
- ❌ 列表渲染忽略 `tid` 属性 — 该属性对性能优化至关重要
- ❌ 使用 CSS Grid/Float 布局 — 仅支持 Flex 布局
- ❌ 在 `if/elif/else` 中插入非相邻节点 — 必须为相邻兄弟节点
- ❌ 表单组件嵌套子组件 — 表单类组件不支持子组件
- ❌ image 的 src 使用变量拼接 — 建议直接使用变量 `src="{{imgPath}}"`
- ❌ list-item 中混用 if/else — 保证所有 list-item 结构一致

---

## 性能优化建议

1. **减少网络请求**：控制请求次数和并发数
2. **本地缓存**：数据实时性要求不高的接口做本地缓存
3. **控制文件数量**：避免直接遍历获取所有文件大小
4. **低分辨率图片**：尽可能使用低分辨率的网络图片
5. **列表分页**：每页保持在 20 个 item 以内
6. **精简数据存储**：只存储需要用到的字段
7. **轻量级依赖**：谨慎使用三方依赖
8. **公共代码全局化**：避免多次引入
9. **防重复点击**：添加 loading 态，防止按钮频繁点击

[注意事项](./VelaDocs/docs/zh/guide/other/tips.md)

---

## 示例：完整页面结构与页面标准模板

```html
<template>
  <div class="page" style="flex-direction: column;">
    
    <!-- 
      【重要渲染规则说明】
      1. 模板按照从上到下的顺序渲染
      2. 后渲染的元素会覆盖（层叠在）先渲染的元素之上
      3. 为确保顶栏和按钮显示在内容区域之上，必须将它们放在模板的最后面
      
      当前渲染顺序：
      1. 内容区域 (底层)
      2. 顶栏背景、文字、按钮 (顶层)
    -->

    <!-- 1. 内容区域 (位于底层) -->
    <!-- 注意：由于顶栏高度为 102px，底栏按钮区域高度约 78px，内容需注意 padding -->
    <scroll class="content" scroll-y="true">
      <!-- 自定义内容写在这里 -->
      <text class="center-text" style="top: 88px; font-size: 30px">敬请期待</text>
      <text class="center-text" style="top: 133px; font-size: 20px;">由于作者学业问题</text>
      <text class="center-text" style="top: 158px; font-size: 20px;">短时间内此部分可能不会上线</text>
      <text class="center-text" style="top: 193px; font-size: 20px; color: #666;">
        JS 市场，旨在一定程度上替代部分简单快应用的功能
      </text>
    </scroll>

    <!-- 2. 顶栏背景图 (位于顶层) -->
    <image static src="/common/images/hd.png" class="topbar-bg" />

    <!-- 3. 顶栏文字 (位于顶层) -->
    <text class="time-text">{{nowTime}}</text>
    <text class="title-text">JS 市场</text>

    <!-- 4. 按钮层 (位于最顶层，确保可点击且覆盖所有内容) -->
    
    <!-- 左上角：返回按钮 -->
    <image static class="btn btn-left-top" src="/common/images/back.png" @click="handleBack" />
    
    <!-- 右上角按钮 -->
    <image static class="btn btn-right-top" src="/common/images/null.png" @click="handleRightTop" />
    
    <!-- 左下角按钮 -->
    <image static class="btn btn-left-bottom" src="/common/images/null.png" @click="handleLeftBottom" />
    
    <!-- 右下角按钮 -->
    <image static class="btn btn-right-bottom" src="/common/images/null.png" @click="handleRightBottom" />

  </div>
</template>

<script>
import router from '@system.router';
import app from '@system.app';
import prompt from '@system.prompt';
import vibrator from '@system.vibrator';

export default {
  private: {
    nowTime: '00:00',
    timer: null
  },

  onInit() {
    this.updateTime();
    this.timer = setInterval(() => {
      this.updateTime();
    }, 1000);
  },

  onDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  },

  updateTime() {
    const date = new Date();
    let hours = date.getHours();
    let minutes = date.getMinutes();
    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    this.nowTime = `${hours}:${minutes}`;
  },

  handleBack() {
    this.vibrateShort();
    router.back();
  },

  handleRightTop() {
    this.vibrateShort();
    prompt.showToast({ message: '右上角按钮' });
  },

  handleLeftBottom() {
    this.vibrateShort();
    prompt.showToast({ message: '左下角按钮' });
  },

  handleRightBottom() {
    this.vibrateShort();
    prompt.showToast({ message: '右下角按钮' });
  },

  vibrateShort() {
    vibrator.vibrate({ mode: 'short' });
  },

  showToast(message, duration = 1500) {
    prompt.showToast({ message, duration });
  },

  navigateTo(page, params = {}) {
    router.push({
      uri: `/pages/${page}`,
      params
    });
  },

  exitApp() {
    app.terminate();
  }
};
</script>

<style>
/* ========== 页面基础样式 ========== */
.page {
  width: 336px;
  height: 480px;
  background-color: #000000;
  overflow: hidden;
}

/* ========== 顶栏样式 ========== */
.topbar-bg {
  position: absolute;
  left: 0px;
  top: 0px;
  width: 336px;
  height: 102px;
}

.time-text {
  position: absolute;
  left: 78px;
  top: 7px;
  width: 180px;
  line-height: 32px;
  font-weight: bold;
  font-size: 24px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
}

.title-text {
  position: absolute;
  left: 78px;
  top: 35px;
  width: 180px;
  line-height: 42px;
  font-weight: bold;
  font-size: 32px;
  color: white;
  text-align: center;
}

/* ========== 按钮样式 ========== */
/* 所有按钮统一尺寸：72px × 72px */
.btn {
  position: absolute;
  width: 72px;
  height: 72px;
}

.btn-left-top {
  left: 6px;
  top: 6px;
}

.btn-right-top {
  left: 258px;  /* 336 - 72 - 6 = 258 */
  top: 6px;
}

.btn-left-bottom {
  left: 6px;
  top: 402px;   /* 480 - 72 - 6 = 402 */
}

.btn-right-bottom {
  left: 258px;
  top: 402px;
}

/* ========== 内容区域 ========== */
.content {
  padding-top: 102px;
  padding-bottom: 78px;
  width: 336px;
  height: 480px;
  box-sizing: border-box;
}

/* ========== 通用文本样式 ========== */
.center-text {
  position: absolute;
  left: 0px;
  width: 336px;
  font-weight: bold;
  color: white;
  text-align: center;
}
</style>
```

---

## 接口声明规范

在 `manifest.json` 的 `features` 字段中声明所需接口：

```json
{
  "features": [
    { "name": "system.router" },
    { "name": "system.fetch" },
    { "name": "system.storage" },
    { "name": "system.device" },
    { "name": "system.prompt" },
    { "name": "system.vibrator" }
  ]
}
```

[接口声明文档](./VelaDocs/docs/zh/features/grammar.md)

---

## 权限配置

部分接口需要配置权限：

```json
{
  "permissions": [
    { "name": "hapjs.permission.LOCATION" },
    { "name": "hapjs.permission.DEVICE_INFO" }
  ]
}
```

| 权限名 | 对应接口 | 说明 |
|--------|----------|------|
| `hapjs.permission.LOCATION` | system.geolocation | 地理位置 |
| `hapjs.permission.DEVICE_INFO` | system.device | 获取设备信息 |

[权限说明](./VelaDocs/docs/zh/guide/framework/manifest.md)

---

## 多语言支持 (i18n)

### 资源文件结构

```
i18n/
├── defaults.json    # 默认语言
├── zh-CN.json       # 简体中文
└── en-US.json       # 英语（美国）
```

### 资源文件示例 (zh-CN.json)

```json
{
  "message": {
    "hello": "你好，世界",
    "welcome": "欢迎{name}使用{app}"
  }
}
```

### 页面中使用

```html
<template>
  <text>{{ $t('message.hello') }}</text>
  <text>{{ $t('message.welcome', { name: '用户', app: 'Vela' }) }}</text>
</template>
```

[多语言文档](./VelaDocs/docs/zh/guide/framework/other/i18n.md)

---

## 附注

- 本指南旨在帮助开发者正确理解 Vela UX 语法，避免与传统 HTML/模板开发混淆
- 请始终参考 [官方中文文档](./VelaDocs/docs/zh/guide/) 获取最新的组件 API 和语法规范
- Vela JS 应用专为可穿戴设备及 IoT 场景设计
- 框架提供跨硬件平台的统一 API 与组件支持，简化多端开发流程
- **固定尺寸配置已优化性能，无需额外适配工作**

> 官方文档地址：[./VelaDocs/docs/zh/](./VelaDocs/docs/zh/)