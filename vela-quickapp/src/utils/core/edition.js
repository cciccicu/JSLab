// The AstroBox release script changes this value only in its isolated build copy.
export const IS_ASTROBOX_EDITION = false;
export const IS_COMMUNITY_EDITION = false;

export const ASTROBOX_RESTRICTION_MESSAGE = '云空间需要长期支付服务器存储和流量费用，AI 生成还需要支付上游模型调用费用，因此这两项在完整版中属于付费功能。\n\nAstroBox 规定，发布付费资源需购买 CreatorPro，或先上传 2 个免费资源。受此上架条件限制，AstroBox 版暂不提供云空间和 AI 生成。\n\n本地脚本的编辑、保存和运行，以及 JS 市场的浏览、下载和发布仍可使用。如需使用云空间或 AI，请到米坛社区、表盘自定义工具或 QQ 群 1067265942 获取完整版。';

export function showAstroBoxRestriction(owner) {
  return owner.$app.$def.openDialog('alert', {
    title: '功能说明',
    message: ASTROBOX_RESTRICTION_MESSAGE,
    confirmText: '知道了'
  }, owner);
}
