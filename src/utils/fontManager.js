import configManager from './configManager.js';

export const DEFAULT_FONT_PROFILE = {
  family: 'UbuntuMono',
  lineHeightRatio: 1,
  lineHeightOffset: 0,
  asciiWidthRatio: 0.5,
  wideWidthRatio: 1
};

const LIMITS = {
  lineHeightRatio: [0.8, 2.5],
  lineHeightOffset: [-8, 12],
  asciiWidthRatio: [0.3, 1.2],
  wideWidthRatio: [0.5, 2.5]
};

function numberInRange(value, range, fallback) {
  const number = Number(value);
  if (isNaN(number)) return fallback;
  return Math.min(range[1], Math.max(range[0], number));
}

export function normalizeFontProfile(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    family: 'UbuntuMono',
    lineHeightRatio: numberInRange(source.lineHeightRatio, LIMITS.lineHeightRatio, DEFAULT_FONT_PROFILE.lineHeightRatio),
    lineHeightOffset: numberInRange(source.lineHeightOffset, LIMITS.lineHeightOffset, DEFAULT_FONT_PROFILE.lineHeightOffset),
    asciiWidthRatio: numberInRange(source.asciiWidthRatio, LIMITS.asciiWidthRatio, DEFAULT_FONT_PROFILE.asciiWidthRatio),
    wideWidthRatio: numberInRange(source.wideWidthRatio, LIMITS.wideWidthRatio, DEFAULT_FONT_PROFILE.wideWidthRatio)
  };
}

export function getProfile() {
  return configManager.get('editor.font.profile', DEFAULT_FONT_PROFILE)
    .then(normalizeFontProfile);
}

export function setProfile(profile) {
  return configManager.set('editor.font.profile', normalizeFontProfile(profile));
}

export default { getProfile, setProfile, normalizeFontProfile, DEFAULT_FONT_PROFILE };
