export const DEFAULT_HIGHLIGHT_PALETTE = 'midnight';

const PALETTES = {
  midnight: {
    label: '午夜',
    colors: {
      plain: '#F5F5F5', comment: '#6A9955', string: '#C3E88D', regex: '#C3E88D',
      number: '#F78C6C', keyword: '#C792EA', literal: '#F78C6C', builtin: '#82AAFF',
      function: '#FFD866', operator: '#89DDFF'
    }
  },
  classic: {
    label: '经典',
    colors: {
      plain: '#FFFFFF', comment: '#7FA66A', string: '#CE9178', regex: '#D16969',
      number: '#B5CEA8', keyword: '#569CD6', literal: '#569CD6', builtin: '#4EC9B0',
      function: '#DCDCAA', operator: '#D4D4D4'
    }
  },
  contrast: {
    label: '高对比',
    colors: {
      plain: '#FFFFFF', comment: '#8FD17F', string: '#FFF176', regex: '#FFF176',
      number: '#FF9E80', keyword: '#D7A8FF', literal: '#FF9E80', builtin: '#80D8FF',
      function: '#FFFFFF', operator: '#80FFFF'
    }
  },
  soft: {
    label: '柔和',
    colors: {
      plain: '#E6E6E6', comment: '#829978', string: '#B7C99A', regex: '#B7C99A',
      number: '#D7A28F', keyword: '#B8A0C9', literal: '#D7A28F', builtin: '#94ABC7',
      function: '#D2C49A', operator: '#9CBFC2'
    }
  }
};

export function normalizeHighlightPalette(value) {
  return Object.prototype.hasOwnProperty.call(PALETTES, value) ? value : DEFAULT_HIGHLIGHT_PALETTE;
}

export function getHighlightPalettePresets() {
  return Object.keys(PALETTES).map(id => ({ id, label: PALETTES[id].label }));
}

export function getPaletteColors(value) {
  return PALETTES[normalizeHighlightPalette(value)].colors;
}
