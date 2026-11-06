const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const { readAndroidVersion } = require('./android-version');

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const DEFAULT_ASTROBOX_RESOURCE_URL = 'https://abox.run/open?source=resv2&id=icu.ccicc.jslab&provider=OfficialV2';
const DOWNLOAD_SLOTS = Object.freeze([
  { id: 'android', label: 'Android 同步器', filename: 'JSLab-Android-Sync.apk', extension: '.apk' },
  { id: 'full-pro', label: '小米手环Pro系列', filename: 'JSLab-Full-Pro.rpk', extension: '.rpk', width: 336, edition: 'full' },
  { id: 'full-rw', label: '红米手表系列', filename: 'JSLab-Full-RW.rpk', extension: '.rpk', width: 432, edition: 'full' },
  { id: 'community-pro', label: 'Pro 社区版', filename: 'JSLab-Community-Pro.rpk', extension: '.rpk', width: 336, edition: 'community' },
  { id: 'community-rw', label: 'RW 社区版', filename: 'JSLab-Community-RW.rpk', extension: '.rpk', width: 432, edition: 'community' },
]);

function defaultDownloadsDirectory(rootDir) {
  return rootDir ? path.resolve(rootDir, '../../data/jslab-cloud-downloads') : '';
}

function downloadError(status, message) {
  return Object.assign(new Error(message), { status });
}

function normalizeAstroboxResourceUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch (_) { throw downloadError(400, '请输入完整的 AstroBox HTTPS 资源分享链接。'); }
  if (url.protocol !== 'https:' || url.username || url.password || text.length > 2048) throw downloadError(400, '请输入完整的 AstroBox HTTPS 资源分享链接。');
  return url.href;
}

async function validatePackage(slot, buffer) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); }
  catch (_) { throw downloadError(400, '安装包不是有效的 APK / RPK 文件。'); }
  const manifest = zip.file(slot.extension === '.apk' ? 'AndroidManifest.xml' : 'manifest.json');
  if (!manifest || manifest._data.uncompressedSize > 1024 * 1024) throw downloadError(400, '安装包缺少有效的应用清单。');
  let versionName = '';
  if (slot.extension === '.apk') {
    const bytes = await manifest.async('nodebuffer');
    if (!zip.file('classes.dex') || ![Buffer.from('icu.ccicc.jslab'), Buffer.from('icu.ccicc.jslab', 'utf16le')].some(value => bytes.includes(value))) {
      throw downloadError(400, '请选择 JSLab Android 同步器的 APK。');
    }
    // Version labels must not make an otherwise supported older APK unavailable.
    try { versionName = readAndroidVersion(bytes); } catch (_) {}
  } else {
    let value;
    try { value = JSON.parse(await manifest.async('string')); }
    catch (_) { throw downloadError(400, 'RPK 的应用清单无效。'); }
    const expectedName = slot.edition === 'community' ? 'JSLab社区版' : 'JSLab';
    if (value.package !== 'icu.ccicc.jslab' || value.name !== expectedName || value.config?.designWidth !== slot.width) {
      throw downloadError(400, `请选择${slot.label}对应的${slot.edition === 'community' ? '社区版' : 'Full'}安装包，其他版本或设备的包不能替代。`);
    }
    versionName = value.versionName;
  }
  return typeof versionName === 'string' && /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/.test(versionName) ? versionName : '';
}

function createReleaseDownloads(ctx) {
  const uploading = new Set();
  const versions = new Map();
  const directory = () => {
    const configured = ctx.config.get('downloadsDirectory');
    return typeof configured === 'string' && configured.trim() ? path.resolve(configured.trim()) : defaultDownloadsDirectory(ctx.rootDir);
  };
  async function fileInfo(slot, root = directory(), uploadedVersion) {
    if (!root) return null;
    const filename = path.join(root, slot.filename);
    let stat;
    try { stat = fs.lstatSync(filename, { throwIfNoEntry: false }); }
    catch (error) { ctx.logger?.warn({ err: error }, '无法读取安装包下载目录'); return null; }
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.size === 0) return null;
    const revision = crypto.createHash('sha256').update(`${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`).digest('hex').slice(0, 16);
    let cached = versions.get(slot.id);
    if (!cached || cached.path !== filename || cached.revision !== revision) {
      const value = uploadedVersion !== undefined ? Promise.resolve(uploadedVersion)
        : fs.promises.readFile(filename).then(buffer => validatePackage(slot, buffer)).catch(error => {
          ctx.logger?.warn({ err: error, slot: slot.id }, '无法读取安装包版本');
          return '';
        });
      cached = { path: filename, revision, value };
      versions.set(slot.id, cached);
    }
    const versionName = await cached.value;
    const downloadName = versionName ? `${path.basename(slot.filename, slot.extension)}-${versionName}${slot.extension}` : slot.filename;
    return { ...slot, path: filename, size: stat.size, updatedAt: stat.mtime.toISOString(), versionName, downloadName, revision,
      url: `/jslab-cloud/downloads/${slot.id}` };
  }
  const list = async () => (await Promise.all(DOWNLOAD_SLOTS.map(slot => fileInfo(slot)))).filter(Boolean);
  const enabled = () => ![false, 0, '0', 'false'].includes(ctx.config.get('downloadsBannerEnabled'));
  const astroboxUrl = () => {
    try { return normalizeAstroboxResourceUrl(ctx.config.get('astroboxResourceUrl')) || DEFAULT_ASTROBOX_RESOURCE_URL; }
    catch (_) { return DEFAULT_ASTROBOX_RESOURCE_URL; }
  };
  const revision = items => crypto.createHash('sha256').update(`astrobox-badge-v1:${astroboxUrl()}|` + items.map(item => `${item.id}:${item.revision}`).join('|')).digest('hex').slice(0, 16);
  async function upload(slotId, req) {
    const slot = DOWNLOAD_SLOTS.find(item => item.id === slotId);
    if (!slot) throw downloadError(404, '下载项不存在。');
    if (uploading.has(slot.id)) throw downloadError(409, '此安装包正在上传，请等待完成后再替换。');
    if (String(req.headers['content-type'] || '').split(';')[0].trim() !== 'application/octet-stream') throw downloadError(415, '请选择安装包后使用上传按钮提交。');
    const declared = req.headers['content-length'];
    if (declared != null && (!/^\d+$/.test(String(declared)) || Number(declared) > MAX_DOWNLOAD_BYTES)) throw downloadError(413, '安装包不能超过 50 MiB。');
    let original;
    try { original = decodeURIComponent(String(req.headers['x-jslab-filename'] || '')); }
    catch (_) { throw downloadError(400, '上传文件名无效。'); }
    if (!original.toLowerCase().endsWith(slot.extension)) throw downloadError(400, `请选择 ${slot.extension} 安装包。`);
    const root = directory();
    if (!root) throw downloadError(503, '请先在插件配置中设置安装包下载目录。');
    uploading.add(slot.id);
    const temporary = path.join(root, `.upload-${slot.id}-${crypto.randomUUID()}.tmp`);
    let file;
    try {
      await fs.promises.mkdir(root, { recursive: true });
      file = await fs.promises.open(temporary, 'wx', 0o644);
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_DOWNLOAD_BYTES) throw downloadError(413, '安装包不能超过 50 MiB。');
        await file.writeFile(chunk);
      }
      if (size === 0 || (declared != null && size !== Number(declared))) throw downloadError(400, '安装包未完整上传，请重试。');
      await file.sync();
      await file.close(); file = null;
      const versionName = await validatePackage(slot, await fs.promises.readFile(temporary));
      // The previous file remains available until the complete upload is valid.
      if (directory() !== root) throw downloadError(409, '下载目录已变更，请刷新页面后重新上传。');
      await fs.promises.rename(temporary, path.join(root, slot.filename));
      return await fileInfo(slot, root, versionName);
    } finally {
      if (file) await file.close().catch(() => {});
      await fs.promises.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') ctx.logger?.warn({ err: error }, '清理下载上传临时文件失败'); });
      uploading.delete(slot.id);
    }
  }
  function registerRoutes() {
    ctx.routes.frontend.get('/downloads/:slot', async (req, res) => {
      const slot = DOWNLOAD_SLOTS.find(item => item.id === req.params.slot);
      const item = slot && await fileInfo(slot);
      if (!item) return res.status(404).send('此安装包暂未提供下载。');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.download(item.path, item.downloadName, { dotfiles: 'allow' }, error => {
        if (error && !res.headersSent) res.status(404).send('此安装包暂时无法读取，请联系管理员。');
      });
    });
  }
  return { directory, list, enabled, revision, astroboxUrl, upload, registerRoutes };
}

module.exports = { createReleaseDownloads, defaultDownloadsDirectory, DOWNLOAD_SLOTS, MAX_DOWNLOAD_BYTES, validatePackage, DEFAULT_ASTROBOX_RESOURCE_URL, normalizeAstroboxResourceUrl };
