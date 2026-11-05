# 读写与管理文件

> 最低支持版本：JSLab 2.0.0。调用前使用 `script.canUse()` 查询设备对文件接口的支持。

希望保存一段可单独导出的文本或二进制内容时，可以使用 `system.files`。如果只是保存次数、偏好等键值，先考虑更简单的 [script.data 和 script.config](script-storage.md)。

## 认识文件地址

`uri` 是文件地址，例如 `internal://files/my-note.txt`。`internal://files/` 用于应用内的持久文件，缓存地址用于临时内容。需要长期保留的缓存文件应复制到持久目录。

这些路径由 JSLab 和其中的脚本共享。为自己的文件使用专属名称或目录，将它们与应用的脚本库、数据文件和其他脚本的文件区分开。

## 写入后再读取文字

下面会写入示例文件，再在写入成功后读取它。再次运行会覆盖同名示例文件。

```js
if (script.canUse('@system.file.writeText') && script.canUse('@system.file.readText')) {
  const uri = 'internal://files/my-jslab-note.txt';
  const failed = (message, code) => console.error('文件操作失败', code, message);
  system.files.writeText({
    uri,
    text: '今天完成了第一个脚本。',
    success: () => system.files.readText({
      uri,
      success: result => console.log(result.text),
      fail: failed
    }),
    fail: failed
  });
}
```

`writeText` 的必需参数是 `uri`、`text`；默认使用 UTF-8，`append: true` 表示追加到末尾。`readText` 接收 `uri`，在成功回调的 `text` 字段中返回内容。可选 `encoding` 指定文本编码。

## 查看文件和目录

| 方法 | 主要参数 | 成功结果 |
| --- | --- | --- |
| `list` | `uri`：目录地址 | `fileList` 数组，条目含 `uri`、`length`、`lastModifiedTime` |
| `get` | `uri`；可选 `recursive` | 文件元信息，包括 `type`、`length`；目录可返回 `subFiles` |
| `access` | `uri` | 存在时进入成功回调，否则进入失败回调 |
| `mkdir` | `uri`；可选 `recursive` | 创建目录；递归选项可创建缺失的父目录 |

文件大小 `length` 的单位是字节。读取失败时，根据错误码和提示检查文件是否存在、路径是否正确以及存储状态。

## 复制、移动和删除

`copy`、`move` 使用 `srcUri` 和 `dstUri` 表示源地址和目标地址。`delete` 使用 `uri` 删除文件；`rmdir` 使用 `uri` 删除目录，`recursive: true` 会连同子内容删除。

覆盖或删除用户内容前先确认目标，将递归操作限定在脚本自己的目录中。重命名 JSLab 的脚本文件时，使用文件管理或同步器，以便同时迁移它的数据和配置。

## 二进制读写

`writeArrayBuffer` 接收 `uri`、`buffer`，其中 `buffer` 为 `Uint8Array`。可用 `position` 指定写入偏移，或用 `append` 追加。

`readArrayBuffer` 接收 `uri`，可用 `position` 和 `length` 指定读取范围，成功结果的 `buffer` 为 `Uint8Array`。

大文件分段处理可以减少内存占用。每个异步步骤都应处理失败，依赖新文件内容的操作放在写入成功的回调中。

接口与支持明细：[小米文件存储文档](https://iot.mi.com/vela/quickapp/zh/features/data/file.html)。
