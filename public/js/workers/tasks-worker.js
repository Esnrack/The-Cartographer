// Heavy math done off the page, in parallel (the app splits each one into row bands
// [from, to) across several workers). On a big map they held up opening for seconds.
//  - 'grain': paper texture (grain), returned as the band's RGBA pixels.
//  - 'noise': terrain noise textures (texFine/texCoarse), as Float32Array.
import { fbm, valueNoise, hash, fbmRow, valueNoiseRow, tileRow } from '../map/noise.js';
import { terrainNoiseRows } from '../map/terrain.js';

function grain({ W, from, to, seed: s, paper: [pr, pg, pb] }) {
  // Raw pixels (RGBA) of the whole band; the page builds the image with createImageBitmap. An image
  // made here with OffscreenCanvas.transferToImageBitmap made the browser stop painting the page.
  const a = new Float64Array(W), b = new Float64Array(W), data = new Uint8ClampedArray(W * (to - from) * 4);
  const lowMid = (xx, y) => 0.5 * fbm(xx * 0.01, y * 0.01, 3, s + 3) + 0.3 * valueNoise(xx * 0.12, y * 0.12, s + 4);
  for (let y = from; y < to; y++) {
    // row by row with the fast noise versions: same result as point by point
    fbmRow(a, W, 0, 0.01, y * 0.01, 3, s + 3);
    valueNoiseRow(b, W, 0, 0.12, y * 0.12, s + 4);
    for (let x = 0; x < W; x++) a[x] = 0.5 * a[x] + 0.3 * b[x];
    tileRow(a, W, 256, (xx) => lowMid(xx, y));
    for (let x = 0, o = (y - from) * W * 4; x < W; x++, o += 4) {
      const m = 0.72 + 0.4 * (a[x] + 0.2 * hash(x, y, s + 5));
      data[o] = pr * m;
      data[o + 1] = pg * m;
      data[o + 2] = pb * m;
      data[o + 3] = 255;
    }
  }
  return [{ data, w: W, h: to - from }, [data.buffer]];
}

function noise({ w, from, to, seed }) {
  const fine = new Float32Array((to - from) * w), coarse = new Float32Array((to - from) * w);
  terrainNoiseRows(fine, coarse, w, from, to, seed);
  return [{ fine, coarse }, [fine.buffer, coarse.buffer]];
}

const TASKS = { grain, noise };

onmessage = ({ data: msg }) => {
  try {
    const [result, transfer] = TASKS[msg.type](msg);
    postMessage({ id: msg.id, from: msg.from, ...result }, transfer);
  } catch (err) {
    postMessage({ id: msg.id, error: String(err) });
  }
};
