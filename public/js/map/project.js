// Encodes the terrain grid as PNG (lossless) to save the project as JSON.

const STEP = 32;

// Pixels of the image that stores the grid (gray = type * STEP). Used here and in workers/encode-worker.js.
export function gridPixels(grid, data) {
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i] * STEP, o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = v;
    data[o + 3] = 255;
  }
}

export function encodeGrid(t) {
  const c = document.createElement('canvas');
  c.width = t.w;
  c.height = t.h;
  const ctx = c.getContext('2d');
  const im = ctx.createImageData(t.w, t.h);
  gridPixels(t.grid, im.data);
  ctx.putImageData(im, 0, 0);
  return c.toDataURL('image/png');
}

export function decodeGrid(url, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      // willReadFrequently: canvas in regular memory. On the GPU, reading the pixels back
      // (getImageData) on a big map took seconds and delayed opening the site.
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, w, h).data;
      const grid = new Uint8Array(w * h);
      for (let i = 0; i < grid.length; i++) grid[i] = Math.round(d[i * 4] / STEP);
      resolve(grid);
    };
    img.onerror = () => reject(new Error('Terreno do projeto inválido'));
    img.src = url;
  });
}
