// Paintable terrain types. The id is the value stored in the map grid (0 = water).
export const TERRAIN_TYPES = [
  { id: 0, name: 'Water', name_pt: 'Água' },
  { id: 1, name: 'Grass', name_pt: 'Grama' },
  { id: 2, name: 'Dry field', name_pt: 'Campo seco' },
  { id: 3, name: 'Forest', name_pt: 'Floresta' },
  { id: 4, name: 'Desert', name_pt: 'Deserto' },
  { id: 5, name: 'Swamp', name_pt: 'Pântano' },
  { id: 6, name: 'Snow', name_pt: 'Neve' },
];

// Colors in [r, g, b]. To create a new style, copy a block and adjust the colors.
export const PALETTES = {
  colored: {
    name: 'Colored (painted)',
    name_pt: 'Colorido (pintado)',
    water: { shallow: [120, 152, 160], deep: [64, 88, 102], wave: [182, 208, 212], coastline: [48, 70, 76] },
    outline: [86, 100, 38],
    terrains: {
      1: { dark: [128, 152, 50], light: [182, 196, 84] },
      2: { dark: [158, 150, 78], light: [198, 186, 114] },
      3: { dark: [74, 100, 44], light: [108, 132, 58] },
      4: { dark: [204, 176, 118], light: [234, 210, 152] },
      5: { dark: [86, 102, 70], light: [118, 130, 88] },
      6: { dark: [214, 222, 230], light: [250, 251, 252] },
    },
    paper: [238, 228, 204],
    vignette: [44, 36, 24],
    objectFilter: 'none',
  },
  parchment: {
    name: 'Old parchment',
    name_pt: 'Pergaminho antigo',
    water: { shallow: [200, 182, 142], deep: [164, 140, 100], wave: [118, 94, 62], coastline: [82, 60, 36] },
    outline: [118, 90, 54],
    terrains: {
      1: { dark: [218, 196, 150], light: [236, 218, 176] },
      2: { dark: [210, 184, 134], light: [228, 206, 160] },
      3: { dark: [186, 164, 118], light: [204, 184, 140] },
      4: { dark: [228, 202, 152], light: [242, 224, 182] },
      5: { dark: [182, 164, 124], light: [200, 184, 144] },
      6: { dark: [238, 230, 212], light: [250, 246, 234] },
    },
    paper: [228, 208, 166],
    vignette: [72, 48, 22],
    objectFilter: 'sepia(0.75) saturate(0.85)',
  },
  // Colors taken from Wonderdraft's "Pastel PRO" theme (the theme has no snow: it was picked here).
  pastel: {
    name: 'Pastel',
    name_pt: 'Pastel',
    water: { shallow: [150, 204, 200], deep: [101, 166, 166], wave: [196, 230, 226], coastline: [62, 112, 110] },
    outline: [74, 62, 38],
    terrains: {
      1: { dark: [113, 134, 80], light: [143, 164, 108] },
      2: { dark: [127, 123, 72], light: [174, 170, 111] },
      3: { dark: [82, 102, 50], light: [100, 124, 63] },
      4: { dark: [170, 152, 120], light: [191, 172, 138] },
      5: { dark: [86, 82, 53], light: [120, 115, 76] },
      6: { dark: [220, 226, 228], light: [245, 247, 248] },
    },
    paper: [232, 224, 200],
    vignette: [44, 36, 24],
    objectFilter: 'none',
  },
};

export function swatchColor(palette, type) {
  if (type === 0) return palette.water.shallow;
  const t = palette.terrains[type];
  return t.dark.map((c, i) => Math.round((c + t.light[i]) / 2));
}
