// The AstroBox release script changes this value only in its isolated build copy.
export const IS_ASTROBOX_EDITION = false;

export const ASTROBOX_RESTRICTION_MESSAGE = 'AstroBox 的付费资源发布政策要求购买 CreatorPro，或先上传 2 个免费资源。因此本版本关闭云空间和 AI 生成。JS 市场、本地脚本编辑与运行等功能不受影响。如需使用云空间或 AI，请到米坛社区或表盘自定义工具下载完整版本。';

export function showAstroBoxRestriction(owner) {
  return owner.$app.$def.openDialog('alert', {
    title: 'AstroBox 版本说明',
    message: ASTROBOX_RESTRICTION_MESSAGE,
    confirmText: '知道了'
  }, owner);
}
