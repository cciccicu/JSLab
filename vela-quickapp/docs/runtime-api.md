# JSLab 统一脚本运行契约

契约标识 `jslab-unified-open-ui`。所有 `.js` 使用 `/workspace/run`，文件名只决定身份和持久化命名空间。
源码是 `Function` 的函数体，每页实例初始化一次。不能 import/require，不支持裸顶层 await；异步函数可以通过 `return main()` 让运行器观察返回 Promise。JS 内建对象和计时器可用，系统模块统一从 system 访问。

## 视图与导航

| 方法/操作 | 行为 |
| --- | --- |
| `ui.render(viewOrFactory)` | 立即校验、编译；成功后选择 UI，返回 boolean；空数组也是有效提交 |
| `ui.show()` | 显示已有成功界面，无界面返回 false；不会重新运行源码 |
| `ui.hide()` | 显示 Console，保留 UI、signal、日志及全屏偏好 |
| `ui.refresh()` / signal | 合并更新，不切换视图；隐藏时只记 dirty |
| `ui.showHeader(false)` | 隐藏 UI 顶栏，Console 顶栏始终可见 |
| `script.reload()` / 右上按钮 | 原生 replace 重建运行页，执行本次文件名/源码快照，包含未保存代码 |
| `script.exit()` | 直接离开运行器，返回来源页面 |
| 返回 | Dialog 取消；UI → Console；Console → 来源页面 |
| 轻点 Console 内容 | 本次提交过成功 UI 时，等同 ui.show；原生 click，不自行识别手势 |

显式 render 在对话框背后仅选择返回视图，不关闭对话框。对话框期间 reload/exit 先取消对话框，来源运行页恢复后执行导航。导航使用 Vela 文档规定的生命周期，无中转页和轮询。
提交 API 不保证屏幕已绘制完成。失败 render 保留上一成功定义/帧；错误在后续显式 render、有效控件操作或重载时清除提示，日志保留。同步死循环仍阻塞 JS 线程。
没有运行菜单、停止 API、页面内重跑、ui.exit、script.mode、onDispose 或通用任务清理注册。页重建不会重启应用共享 JS context；系统订阅、音频等资源仍应由脚本限制寿命或在业务退出操作中释放。

## Console 与 script

console.log/info/warn/error 支持多参数；console.clear 清空日志。error 仅是级别，不切屏、不退出。
保留最近64条，总计6144字符，单条最多1024字符；超限淘汰最旧记录并显示省略数。对象预览限层级/成员/字符，循环引用可显示。隐藏 Console 不发布日志 text、不安排日志 flush timer；可见时合并发布，不强制跟随滚动。
错误前文继续显示，最后错误摘要单独保留最多512字符。可捕获编译、同步主体、顶层返回 thenable、UI 回调及编译/提交失败；未返回的 Promise 链和任意原生回调不是全面捕获范围。

script.name：当前名字。script.canUse('@system.module.method')：能力查询。script.locale()：语言/地区。script.toast(message,duration)：1500–10000ms 提示。
script.data/config 都有 get(key,fallback)、set(key,value)、delete(key)、clear()、all()，均返回 Promise；单值16KiB，每区64KiB，以实际文件名隔离。重命名脚本时数据与配置迁移到新文件名；删除脚本时一并清除。旧 name.ui.js 的数据身份保留。

## 标准对话框

五个方法均返回 `Promise<{action:'confirm'|'secondary'|'cancel', value:...}>`。
公共参数 title/message/confirmText/cancelText；初值统一 value，选项集合统一 items。正常取消为 `{action:'cancel',value:null}`，不是异常；空字符串、0、false 均为有效业务值。

| 方法 | 专用参数 | 确认值 |
| --- | --- | --- |
| dialog.alert | 无 | null，确认 action='confirm' |
| dialog.confirm | secondaryText 可增加第二业务动作 | null，依 action 判断 |
| dialog.text | value、placeholder、required、minLength、maxLength、language:'en'或'cn' | string，不自动 trim |
| dialog.number | value、required、min、max、decimals | 有限 number；允许空时未输入为 null |
| dialog.select | items、value、multiple、minSelected、maxSelected | 单选原始值；多选按 items 顺序的数组 |

text 默认 maxLength=64，硬上限8000；初值超限报参数错误，不默默截断。复用输入法，组合上限5与最终字段长度独立；长文本只显示24字符窗口与计数，提供基本中间编辑。
number 默认 decimals=6，允许0–10；0为整数。支持负数、小数和中间输入状态，确认校验范围/精度，不夹紧、不取整。初值绝对值<1e15，整数位最多15。
select 最多100项，使用原生列表连续滚动，没有分页按钮；items 每项 `{label:string,value:string|number|boolean,description?:string,disabled?:boolean}`，值唯一且数值有限。单选先选中再确认，默认要求1项；多选默认允许0项，上限100。禁用项不能选中，初值必须匹配可用项。
对话框沿用应用原有的灰色圆角卡片、蓝色主操作/选中态、图片勾选和一致的顶栏。确认页保留底部横排操作，secondaryText 存在时横排三项；文字/数字页保留各自输入能力。
同一时间一个对话框，无嵌套、队列、多字段表单或任意布局。函数和 Promise 结算器不进入页面响应式数据，结果在来源页面 onShow 恢复后交付。

| 错误 code | 条件 |
| --- | --- |
| DIALOG_INVALID | 参数或初值无效 |
| DIALOG_BUSY | 已有对话框 |
| DIALOG_OPEN_FAILED | 原生打开抛错 |
| DIALOG_INACTIVE | 来源运行页已退出或正在重载/退出 |

```js
async function main() {
  const answer = await dialog.confirm({ title:'保存修改？', confirmText:'保存', secondaryText:'不保存', cancelText:'继续编辑' });
  console.log(answer.action);
  const temperature = await dialog.number({ title:'温度', value:-2.5, min:-20, max:50, decimals:1 });
  if (temperature.action === 'confirm') console.log(temperature.value);
}
return main();
```

## 系统与云端

system.device/files/http/download/upload/companion/network/display/battery/location/vibration/events/sensors/recorder/audio/crypto 对应 Vela 原生接口，保留对象参数和 success/fail/complete，不包装成假 Promise。可选模块先检查能力，并处理 fail。完整方法参考内置“系统 API”帮助和本仓库 VelaDocs。

`runtime-contract.json` 是公开方法、仍存在的文字长度限制和 UI 性能建议的构建期来源，`scripts/sync-runtime-contract.cjs` 同步设备常量及云插件 JSON；设备不解析文档。
AI 额度响应公布 runtimeContract；客户端发收费请求前校验，服务端在预留余额/模型调用前校验，结果也携带并再次校验；不按同版本安装包推断契约。旧客户端/服务器需要同步更新，不回退旧提示词。
云 CRUD/市场/网页删除执行类型，保留业务用途标签。SQLite 原生 DROP COLUMN 迁移保留 ID、源码、hash、checksum、时间、归属、状态、索引和自增；需要SQLite3.35或更新版本，重复启动无副作用。不会自动改名或改写已有源码。
插件启动会执行幂等持久化初始化和迁移，升级无需再次调用 install。部署通过 PM2 重启整个进程；中断请求的预留额度由下次 boot 退回。审核记录关联实际审核内容；历史记录保留，未关联记录不作为当前内容的审核结论。
市场名称是显示标题；明确导出时统一生成合法 `.js` 文件名，源码响应包含 filename，网页下载、保存到云空间与设备下载使用同一名称规则。此操作不改市场记录。
