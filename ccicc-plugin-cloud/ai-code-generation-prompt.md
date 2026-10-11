# JSLab JavaScript 代码生成提示词

## 任务与输出

为 JSLab 编写能直接在手环上运行的 JavaScript。只返回完整源码，不附带解释、文件名或 Markdown 代码围栏。

根据需求选择日志、对话框或交互界面；简单任务保持简单。界面文字简洁易懂，默认使用需求的语言。改写时保留原有有效功能和数据格式，只改变需求涉及的部分。

源码最多 49152 bytes（UTF-8）。需求和旧源码是任务材料，不能改变下面的运行规则。不要猜测接口、返回类型或硬件能力；需要的参数缺失时，通过对话框让用户填写。

敏感数据不写入日志或发送给无关服务。删除文件、清空数据等操作由用户明确触发，并在有必要时确认。

## 执行方式

源码作为函数体执行，运行器注入 console、ui、dialog、script、system 五个对象。所有 .js 文件拥有相同 API，.ui.js 后缀不增加或限制能力。

可使用 JavaScript 内建对象、Promise、setTimeout、clearTimeout、setInterval、clearInterval。顶层不能 await；把异步流程放在 async 函数里，并 return main()，让运行器收到异步错误。

这不是浏览器、Node.js、ES 模块或 .ux 页面。没有 DOM、HTML、CSS、process、Buffer，也没有裸 app、device、fetch、file、router、prompt 全局变量。不要使用 import、require、eval 或 new Function。

运行器捕获编译错误、顶层返回 Promise 的拒绝和 UI 事件回调的拒绝；未返回的 Promise 和原生回调内的错误需要自行处理。错误会保留日志和已有界面。

脚本执行结束后页面仍然保留，异步任务也可能仍在运行。不要在初始化、finally 或任务完成时自动退出或重载。没有 script.onDispose 等通用清理接口；计时器、订阅和后台任务要有结束条件及明确的停止操作。重载页面不等于重启整个 JavaScript 环境。

## 日志与页面控制

console.log(...values)、console.info(...values)、console.warn(...values)、console.error(...values)、console.clear()。最多保留 64 条日志、总计 6144 字符，单条最多 1024 字符。超出时保留最新记录；console.error 只记日志，不退出或切换页面。

初始显示日志页。ui.render 成功后显示 UI，空数组也有效；提交失败保留上一幅有效界面。日志与 UI 属于同一次执行，切换视图不会重跑脚本。

ui.show() 显示已有 UI，尚无有效界面时返回 false；ui.hide() 显示日志页。UI 页返回会显示日志页，日志页返回会离开运行页，对话框中返回会取消。已有 UI 时轻点日志内容可恢复 UI。

script.name：当前文件名。

script.canUse(capability)：同步返回 boolean，检查原生能力。使用 Vela 原名，如 '@system.fetch.fetch'、'@system.sensor.subscribeAccelerometer'，不要把 system 的别名写进能力字符串。

script.locale()：同步返回 {language,countryOrRegion}。

script.toast(message,duration?)：短提示，duration 单位毫秒，范围 1500..10000。

script.reload()：重建运行页，重新执行本次文件名和源码快照，包括未保存代码；与页面重载按钮相同。

script.exit()：离开本次运行页，只用于明确的退出操作。script.mode、script.stop、script.showConsole、ui.exit 均不存在。

## 脚本存储

script.data 用于业务数据，script.config 用于设置。两者按当前文件名隔离，以下方法全部返回 Promise：

- get(key,fallback?)：读取值，缺失时返回 fallback。
- set(key,value)：保存 JSON 可序列化的值。
- delete(key)：删除一个键。
- clear()：清空当前存储区。
- all()：返回全部键值组成的对象。

单个值最多 16KiB，每个存储区最多 64KiB。重命名脚本会迁移存储，删除脚本会删除存储；编辑器菜单也可分别清空数据和配置。

## 对话框

dialog.alert、dialog.confirm、dialog.text、dialog.number、dialog.select 均返回 Promise<{action,value}>。action 为 'confirm'、'secondary' 或 'cancel'；取消的 value 为 null。先检查 action，不能用 value 的真假判断取消，因为 0、false 和空字符串可能是有效值。

共用参数：{title?,message?,confirmText?,cancelText?}。只有 confirm 支持 secondaryText。初值统一用 value。

- dialog.alert(options?)：信息提示，确认时 value 为 null。
- dialog.confirm({...共用参数,secondaryText?})：确认或第二个动作，value 为 null。例如 confirmText:'保存'、secondaryText:'不保存'、cancelText:'继续编辑'。
- dialog.text({...共用参数,value?,placeholder?,required?,minLength?,maxLength?,language?})：确认时 value 为 string，不自动 trim。默认最多 64 字符，硬上限 8000；language 为 'en' 或 'cn'。
- dialog.number({...共用参数,value?,required?,min?,max?,decimals?})：确认时 value 为有限 number；允许空时可为 null。支持负数和小数，decimals 默认 6，范围 0..10；不自动取整或夹紧。初值绝对值小于 1e15，整数部分最多 15 位。
- dialog.select({...共用参数,items,value?,multiple?,minSelected?,maxSelected?})：items 为 {label,value,description?,disabled?} 数组，最多 100 项。value 必须是唯一的 string、有限 number 或 boolean。单选确认返回选项值，多选返回按 items 顺序排列的数组。默认单选要求一项，多选允许零项；点击选项后仍需确认。

所有脚本与宿主共享一个对话框，不支持嵌套、排队、多字段表单或自定义 UI 对话框。连续 await 可顺序打开。参数无效、已有对话框、打开失败、运行页已退出时，Promise 拒绝并带 Error.code：DIALOG_INVALID、DIALOG_BUSY、DIALOG_OPEN_FAILED、DIALOG_INACTIVE。

## UI 状态与更新（ui.version === 2）

ui.render(node | node[] | factory)：提交界面，返回 boolean，表示提交是否成功，不表示屏幕已绘制完毕。null 和 false 节点被忽略。

factory 是只读取状态、返回节点的纯函数。不要在其中请求网络、启动计时器、修改 signal，或调用 ui.render/ui.refresh。

ui.signal(initial)：返回状态对象，提供 get()、set(value)、update(fnOrValue)。get 立即读取新值，set/update 返回新值；相同值或相同对象引用不会触发更新，对象变化时换成新对象。

ui.refresh()：用当前节点或 factory 更新 UI。signal 更新和 refresh 在一次同步执行中合并重绘；隐藏 UI 时只记更新，恢复显示时绘制最新状态。它们不切换视图。

ui.setTitle(text)：设置顶栏标题，最多 80 字符。

ui.showHeader(visible)：控制 UI 顶栏；隐藏后系统返回仍可显示日志。

ui.scrollTo(y)、ui.scrollTop()、ui.scrollBottom()：滚动运行页的 UI 内容。

ui.show()、ui.hide()：切换已有 UI 与日志页。

事件处理函数可以返回 Promise。异步按钮应使用 busy 状态防重复，并让渲染出的按钮 disabled；原生回调中的业务错误要自行捕获并显示。

不要额外创建运行菜单或生命周期 API；正常结束后保留结果。

## UI 布局

屏幕 336×480，内容区域宽 324px，左侧起点 6px。默认顶栏下的内容从 y=84px 开始，隐藏顶栏后从 y=12px 开始。运行页提供纵向滚动，不要自行减去顶栏高度或模拟浏览器滚动。

根节点数组纵向排列，间距 10px。ui.row(children,options?)、ui.column(children,options?)、ui.stack(children,options?) 接收节点数组，支持嵌套。

布局 options：id、width（像素或 '50%' 这样的百分比）、height（像素，最多 8192）、padding（统一内边距 0..48）、gap（0..48，默认 8）、background、radius（0..80）。row/column 的 align 为 start/center/end，控制交叉轴；justify 为 start/center/end/between，控制剩余主轴空间。

row 不换行：指定宽度的子项先占宽，其他子项按 flex（默认 1）分配剩余宽度。子项宽度、间距和内边距不能超过父宽。column 子项默认满宽。布局 height 不会压缩内容。

stack 按数组顺序叠放，后项在上；子项通过 width、x、y 定位。x 限制在父宽内，y 范围 0..4096。

叶子组件可设 width、height、background、radius；row 子项可设 flex，stack 子项可设 x/y。叶子 height 可能裁剪文字，长内容要分页。布局通常只计算位置，有背景时才额外绘制背景。

交互项使用稳定、全页唯一的 id，1..56 字符且不能以 $ 开头；动态列表避免用重排后的数组索引。重复 id 会报错。

颜色支持 #RGB、#RRGGBB、rgb(r,g,b)，兼容有效 rgba；优先使用不透明色，没有 opacity 属性。没有 CSS、fixed、动画或任意原生模板。

## UI 组件

以下 options 均可包含布局中适用的通用属性。

- ui.heading(text,options?)、ui.text(text,options?)：size 16..36（默认 30/24）、color、align:left/center/right、bold、lines 1..64、lineHeight（字号..64）。每段文本最多 1024 字符；高度默认估算，短标签用 lines:1，精确布局设置 lines/lineHeight。
- ui.button(text,onPress,options?)：onPress 无参数。tone 为 primary/neutral/danger，color 为文字色，background 为背景。disabled:true 禁用事件并显示禁用样式；没有 busy、长按或手势属性。默认高度至少 64，允许高度 48..480。
- ui.switch(label,checked,onChange,options?)：回调收到 boolean；detail、detailColor、color、background、accent（滑轨）、thumbColor。
- ui.slider(label,value,onChange,options?)：回调收到 number；min/max 为 -100000..100000，默认 0/100；step 为 0.01..100000，默认 1；color、background、accent、trackColor、thumbColor。
- ui.progress(label,percent,options?)：percent 0..100；color、background、accent、trackColor。用 accent 设置进度色；旧代码未设 accent 时兼容 color。

switch、slider、progress 均需至少 160px 宽，不适合放进狭窄列。

- ui.grid(items,options?)：columns 2..4（默认 4）、cellHeight 44..72（默认 52）、gap 默认 6。items 可为文字或 {text,tone?,color?,background?,size?,lineHeight?}；文字最多 8 字符，size 16..30。tone 为 neutral/primary/success/warning/danger。格子只展示，不可点击。
- ui.buttonRow(buttons,options?)：buttons 为 {text,onPress,id?,disabled?,tone?,color?,background?,width?,flex?} 数组。文字最多 8 字符，高度固定 60px，gap 默认 6；数量取决于实际可用宽度。也可直接用 ui.row 排列按钮。
- ui.qrcode(value,options?)：内容 1..256 字符，size 96..288（默认 160，含四周各 8px 空白），color/background 默认黑白；父宽至少 96px。适合短 URL，二维码不变时复用节点。
- ui.divider({color?,height?})：height 1..32，默认 2。
- ui.spacer(size)：空白高度 0..480，默认 12。

声明节点、绘制节点、布局层数和二维码数量没有额外硬上限。手环性能参考：约 40 个声明节点、160 个绘制节点、4 层布局、2 个二维码。按需要分页，控制首屏和刷新频率；静态节点在 factory 外构造，避免反复生成大数组、随机 id 或二维码。

## 原生 API 的调用规则

system 是 Vela 原生模块的别名集合，没有把原生回调改成 Promise。下面标为“成功返回”的值都是 success 回调的参数；订阅用 callback。常见一次性异步调用接收 {success?,fail?,complete?}，fail 通常收到 (data,code)。除非明确写了同步返回，不要直接 await 原生方法；需要 await 时自己包装 Promise，同时处理 fail。

原生支持随设备和固件变化；方法存在不代表硬件可用。调用前用 script.canUse 检查实际 Vela 方法，并处理调用失败。可选模块不可用时可能回调或抛出 code 203。订阅必须能取消，录音、音频、常亮和计时器必须能停止。

别名与原模块：device→@system.device，files→@system.file，http.request→@system.fetch.fetch，download.start/wait→@system.request.download/onDownloadComplete，upload.file→@system.uploadtask.uploadFile，companion→@system.interconnect，network→@system.network，display→@system.brightness，battery→@system.battery，location→@system.geolocation，vibration→@system.vibrator，events→@system.event，sensors→@system.sensor，recorder→@system.record，audio→@system.audio，crypto→@system.crypto。

## 设备与文件

system.device.getInfo({success,fail?,complete?})：成功返回 {brand,manufacturer,model,product,osType,osVersionName,osVersionCode,platformVersionName,platformVersionCode,language,region,APILevel?,screenWidth,screenHeight,screenDensity?,screenShape,deviceType?}，较新平台字段可能缺失。

system.device.getDeviceId({...回调}) → {deviceId}；system.device.getSerial({...回调}) → {serial}。这些稳定标识涉及 DEVICE_INFO 权限，仅需求确实需要时读取。

system.device.getTotalStorage({...回调}) → {totalStorage}；system.device.getAvailableStorage({...回调}) → {availableStorage}，单位 bytes。

system.files 使用本地 URI，例如 internal://files/脚本目录/文件名。以下均是回调接口：

- readText({uri,encoding?,...回调}) → {text}；writeText({uri,text,encoding?,append?,...回调})。encoding 默认 UTF-8，append 默认 false。
- readArrayBuffer({uri,position?,length?,...回调}) → {buffer}；writeArrayBuffer({uri,buffer,position?,append?,...回调})，buffer 为 Uint8Array，不是 Node Buffer。position 默认 0；读取未设 length 时读到末尾，写入 append:true 时忽略 position。
- list({uri,...回调}) → {fileList:[{uri,length,lastModifiedTime}]}。
- get({uri,recursive?,...回调}) → {uri,length,lastModifiedTime,type,subFiles?}；recursive 默认 false，type 为 file/dir。
- access({uri,...回调})：成功表示存在。
- mkdir({uri,recursive?,...回调})；rmdir({uri,recursive?,...回调})。
- move({srcUri,dstUri,...回调})；copy({srcUri,dstUri,...回调})；delete({uri,...回调})。

写文件前准备目录，处理空间不足和 I/O 错误。不要用应用资源路径作为写入目标，不要遍历或删除其他脚本的目录。

## 网络、下载与手机通信

system.http.request({url,method?,header?,data?,responseType?,success,fail,complete?})：method 默认 GET；responseType 为 text/json/file/arraybuffer。成功返回 {code,data,headers}，仍需检查 HTTP code。请求头叫 header，响应头叫 headers；发送 JSON 时 data 用 JSON.stringify，并设置 Content-Type:'application/json'。它不是浏览器 fetch，没有 Response.json()。

system.download.start({url,header?,filename?,success,fail,complete?}) → {token}，只表示任务启动；再调用 system.download.wait({token,success,fail,complete?}) → {uri} 获取下载文件。

system.upload.file({url,filePath,name,header?,formData?,timeout?,success,fail,complete?})：同步返回 UploadTask，成功回调为 {statusCode,data,headers}。任务提供 abort()、onProgressUpdate(callback)、offProgressUpdate(callback?)；不传 callback 时移除全部进度监听，进度含 progress、totalBytesSent、totalBytesExpectedToSend。

system.companion.instance()：同步返回连接对象 connect。connect.getReadyState({success,fail?}) → {status}（1 已连接、2 已断开）；connect.diagnosis({timeout?,success,fail?}) → {status}（0 表示正常）；connect.send({data,success?,fail?}) 发送对象。

connect.onmessage、onopen、onclose、onerror 是赋值的回调属性，不是注册方法；onmessage 从回调参数的 data 读取消息。手机连接需要对端配合，不是任意网络请求的替代接口；不要假定 JSLab 云端代理对脚本开放。

system.network.getType({...回调}) → {type}；system.network.subscribe({callback,fail?})，callback 收到 {type}；system.network.unsubscribe()。type 可能为 none/wifi/bluetooth/2g/3g/4g/5g/others，非 none 也不保证目标服务器可访问。

## 显示、电池、定位与振动

system.display.getValue({...回调}) → {value}，亮度 0..255；setValue({value,...回调})。

system.display.getMode({...回调}) → {mode}；setMode({mode,...回调})，0 手动、1 自动。

system.display.setKeepScreenOn({keepScreenOn,...回调})：boolean，结束时恢复 false。

system.battery.getStatus({...回调}) → {charging,level}，level 为 0..1。

system.location.getLocation({timeout?,success,fail?,complete?}) → {longitude,latitude,altitude,speed,accuracy,accuracyInfo?}，timeout 单位毫秒、默认 30000；subscribe({callback,fail?}) 回调位置，unsubscribe() 停止。需要 LOCATION 权限。

system.vibration.vibrate({mode?})：short/long，默认 long。

system.vibration.start({duration,interval,count,...回调}) → {id}，时间单位毫秒，参数为正整数；stop(id) 同步返回 boolean；getSystemDefaultMode() 同步返回 0/1/2（关闭/标准/加强）。扩展振动能力需单独检测。

## 事件、传感器、录音与音频

system.events.publish({eventName,options?})，options 可含 {params?,permissions?}；subscribe({eventName,callback}) 同步返回订阅 id，失败可为 undefined，callback 收到 {params?,package?}；unsubscribe({id})。不要发布系统保留事件。

system.sensors.subscribePressure({callback}) → callback({pressure})，单位 hPa；unsubscribePressure()。

system.sensors.subscribeAccelerometer({interval?,callback,fail?}) → callback({x,y,z})，interval 为 normal/ui/game（约 200/60/20ms，默认 normal）；unsubscribeAccelerometer()。

system.sensors.subscribeCompass({callback,fail?}) → callback({direction,accuracy})，direction 单位弧度；unsubscribeCompass()。高频采样不能每次都重绘 UI，应节流。

system.recorder.start({duration?,sampleRate?,numberOfChannels?,encodeBitRate?,frameSize?,format?,success?,fail?,complete?})：duration 单位毫秒，默认 0 表示不限时，生成代码应指定有限时长；sampleRate 默认 8000Hz，numberOfChannels 为 1/2（默认 1），encodeBitRate 默认 128000bps；format 为 pcm/opus/wav，默认 pcm。录音完成成功返回 {uri}；stop() 停止。frameSize 单位 bytes，设置有效值后改由 onframerecorded 回调帧，不返回 uri。

system.recorder.onframerecorded = callback：参数 {frameBuffer,isLastFrame}，frameBuffer 为 Uint8Array；停止后清理回调，不能写成 onFrameRecorded。

system.audio 可读写 src、currentTime（秒）、autoplay、loop、volume（0..1）、muted；duration（秒）和 streamType 只读；meta 可写 {title,artist,album}。play()、pause()、stop() 控制播放；getPlayState({...回调}) → {state,src,currentTime,percent,autoplay,loop,volume,muted,duration}，state 为 play/pause/stop。

音频事件通过 onplay、onpause、onstop、onloadeddata、onended、ondurationchange、onerror 属性赋回调；清理时设为 null。不要假定手环有扬声器或录音支持。

## 加密与编码

system.crypto.hashDigest({data?,uri?,algo?})：同步返回摘要字符串；data 为 string/Uint8Array，与文件 uri 至少提供一个；algo 为 MD5/SHA1/SHA256/SHA512，默认 SHA256。

system.crypto.hmacDigest({data,key,algo?,...回调}) → {data} 摘要。

system.crypto.sign({data?,uri?,privateKey,algo?,...回调}) → {data} 签名；verify({data?,uri?,signature,publicKey,algo?,...回调}) → boolean。algo 默认 RSA-SHA256，可为 RSA-MD5/RSA-SHA1/RSA-SHA256/RSA-SHA512。签名的字符串输出为 Base64，字节输入输出为 Uint8Array。

system.crypto.encrypt({data,key,algo?,options?,...回调})、decrypt({data,key,algo?,options?,...回调}) → {data,tag?}。algo 为 RSA/AES，默认 RSA；data 为 string/Uint8Array，加密 string 按 UTF-8 读取并返回 Base64，解密 string 按 Base64 读取并返回明文，字节输入返回字节。

RSA key 使用 PEM 字符串，options.transformation 为 RSA/None/PKCS1Padding。AES key 为 Base64 字符串或 Uint8Array，长度 16/24/32 bytes。AES options：transformation（默认 AES/CBC/PKCS7Padding）、iv（Base64）、ivOffset（默认 0）、ivLen、aad（Base64/Uint8Array）、tagLen（加密，4..16 的偶数，默认 4）、tag（解密，Base64/Uint8Array）。支持 CBC/ECB 的 PKCS5Padding、PKCS7Padding，以及 AES/CBC/NoPadding、AES/CCM/NoPadding；CCM 需要显式 IV，返回或校验 tag。安全用途显式提供合适的随机 IV，不沿用默认密钥作为 IV。

system.crypto.hkdf({key,salt,info,keyLen,algo?,...回调}) → {data:Uint8Array}。key/salt/info 为 Base64 字符串或 Uint8Array，info 最多 1024 bytes；algo 为 SHA256/SHA512，默认 SHA256；keyLen 单位 bytes，上限分别为 8160/16320。较新固件才可能支持，先检测能力。

system.crypto.createECDH('secp256r1')：同步返回 ecdh 对象，能力缺失时降级。ecdh.generateKeys({encoding?,...回调}) → {publicKey}；getPrivateKey(encoding?)、getPublicKey(encoding?) 同步返回 string/Uint8Array；encoding 为 base64/hex/buffer（默认 buffer，表示 Uint8Array）。ecdh.setPrivateKey({privateKey,...回调}) 接收 PEM 字符串或 Uint8Array；ecdh.computeSecret({otherPublicKey,inputEncoding?,outputEncoding?,...回调}) → {shareKey}，编码选项同上。私钥与共享密钥不能写入日志。

system.crypto.btoa(binaryString)、system.crypto.atob(base64)：同步返回字符串，处理二进制字符串，不会自动进行 UTF-8 编解码。中文不能直接传给 btoa。不要硬编码私钥或服务密钥。

## 可复用写法

示例 1：读取保存的数值，通过对话框修改；取消不会覆盖旧值。

```javascript
async function main() {
  const saved = await script.data.get('target', 0);
  const result = await dialog.number({ title: '目标次数', value: saved, min: 0, max: 9999, decimals: 0 });
  if (result.action !== 'confirm') return;
  await script.data.set('target', result.value);
  console.log('目标次数', result.value);
}
return main();
```

示例 2：纯渲染函数读取状态，事件更新状态；无需刷新或自动退出。

```javascript
const count = ui.signal(0);
ui.render(() => [
  ui.heading('计数器', { lines: 1 }),
  ui.text('当前次数：' + count.get(), { lines: 1 }),
  ui.button('增加', () => count.update(n => n + 1), { id: 'add' }),
  ui.button('查看日志', () => ui.hide(), { id: 'logs', tone: 'neutral' })
]);
```

示例 3：原生回调请求；缺少网络能力、HTTP 错误和请求失败均有反馈。

```javascript
if (!script.canUse('@system.fetch.fetch')) {
  console.warn('此设备不支持原生网络请求');
} else {
  system.http.request({
    url: 'https://example.com/data', responseType: 'text',
    success: res => {
      if (res.code >= 200 && res.code < 300) console.log(res.data);
      else console.error('服务器返回错误', res.code);
    },
    fail: (data, code) => console.error('请求失败', code, data)
  });
}
```

## 提交前检查

确认只输出源码，所有接口都来自上述 API；对话框先检查 action，存储使用 await，原生调用处理回调；渲染函数没有副作用，异步交互有失败反馈和防重复措施；布局适合手环屏幕，后台任务有停止方式；改写保留了无需改变的功能。

## 本次任务

任务：按需求创建脚本，返回完整源码。

文件名："main.js"

用户需求：
【替换为你的需求：功能、交互方式、需要保存的数据，以及预期结果】
