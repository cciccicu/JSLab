const CACHE_ROOT = 'internal://cache/';
const OWNED_IMAGE = /^jslab-ui-[a-z0-9]+-[a-z0-9]*-\d+\.(png|jpg)$/;

// Run once at app startup, before any session can write a new media file.
// Only our generated images belong to this sweep; scripts and other caches do not.
export async function clearUiMediaCache(files) {
  function call(method, options) {
    return new Promise((resolve, reject) => {
      files[method](Object.assign({}, options, {
        success: resolve,
        fail: (message, code) => reject(new Error('清理图片缓存失败（' + code + '）：' + message))
      }));
    });
  }
  const result = await call('list', { uri: CACHE_ROOT });
  let failure = null;
  for (const entry of result.fileList) {
    const name = entry.uri.indexOf(CACHE_ROOT) === 0 ? entry.uri.slice(CACHE_ROOT.length) : entry.uri;
    if (!OWNED_IMAGE.test(name)) continue;
    try { await call('delete', { uri: CACHE_ROOT + name }); }
    catch (error) { if (!failure) failure = error; }
  }
  if (failure) throw failure;
}
