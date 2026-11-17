// Loads the engraving library from assets/manifest.json.

export const assets = new Map();
export let categories = [];

export async function loadAssets(onImageLoad) {
  const res = await fetch('assets/manifest.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`manifest.json: HTTP ${res.status}`);
  const manifest = await res.json();
  categories = manifest.categories || [];
  for (const cat of categories) {
    for (const item of cat.items) {
      // "arquivos" (list) = variations; each placed engraving picks one at random.
      const files = item.files || [item.file];
      const a = { anchor: 'base', width: 60, ...item, file: files[0], imgs: files.map(() => new Image()) };
      a.imgs.forEach((img, k) => {
        img.onload = onImageLoad;
        img.onerror = () => console.warn(`Imagem não encontrada: assets/${files[k]}`);
        img.src = encodeURI(`assets/${files[k]}`); // names with spaces/accents
      });
      assets.set(item.id, a);
    }
  }
  return categories;
}

// Engraving added by the user (stored only in the browser, see cache.js): becomes a library
// item like the manifest ones. "file" is just a name for the pack filter (folder "meus-assets").
export const USER_FOLDER = 'meus-assets';
export function registerUserAsset(rec, onImageLoad) {
  const item = { id: rec.id, name: rec.name, name_pt: rec.name, file: `${USER_FOLDER}/${rec.name}`, width: 60, pack: 'Meus assets', user: true };
  const img = new Image();
  img.onload = onImageLoad;
  img.src = URL.createObjectURL(rec.blob);
  assets.set(rec.id, { anchor: 'base', ...item, imgs: [img] });
  return item;
}

export function unregisterUserAsset(id) {
  const a = assets.get(id);
  if (a?.user) URL.revokeObjectURL(a.imgs[0].src);
  assets.delete(id);
}

// Image for variation v (or null while not loaded).
export function variantImg(a, v = 0) {
  const img = a.imgs[(v || 0) % a.imgs.length];
  return img.complete && img.naturalWidth ? img : null;
}

// Default width on the map. With "escala" (map px per image px) each variation
// keeps the image's relative size; otherwise all use "largura".
export function baseWidth(a, v = 0) {
  const img = a.scale && variantImg(a, v);
  return img ? img.naturalWidth * a.scale : a.width;
}

export function engravingSize(a, scale, v = 0) {
  const w = baseWidth(a, v) * scale;
  const img = variantImg(a, v);
  const ratio = img ? img.naturalHeight / img.naturalWidth : 1;
  return { w, h: w * ratio };
}
