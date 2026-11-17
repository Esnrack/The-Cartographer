// Optimized terrain math vs direct versions (brute force / point by point).
// Run: node tests/test_terrain_math.js   (or: npm test)
import assert from 'node:assert/strict';
import { edt2d, INF } from '../public/js/map/edt.js';
import { fbm, valueNoise, tileX, fbmRow, valueNoiseRow, tileRow, cachedNoise3 } from '../public/js/map/noise.js';

// Distance to coast: edt2d (with and without limit) vs exact distance computed cell by cell.
const w = 60, h = 40, CAP = 6;
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let k = 0; k < 20; k++) {
  const src = Array.from({ length: w * h }, () => rnd() < 0.03 * (k % 4)); // includes a grid with no source at all
  const full = Float32Array.from(src, (s) => (s ? 0 : INF)), capped = full.slice();
  edt2d(full, w, h);
  edt2d(capped, w, h, CAP);
  for (let i = 0; i < w * h; i++) {
    let best = INF;
    for (let j = 0; j < w * h; j++) {
      if (src[j]) best = Math.min(best, (i % w - j % w) ** 2 + (((i / w) | 0) - ((j / w) | 0)) ** 2);
    }
    if (best === INF) assert.ok(full[i] > 1e19, `edt2d sem fonte, célula ${i}`); // INF in Float32 ≈ 1e20
    else assert.equal(full[i], best, `edt2d sem limite, célula ${i}`);
    assert.equal(Math.min(Math.sqrt(capped[i]), CAP), Math.min(Math.sqrt(best), CAP), `edt2d com limite, célula ${i}`);
  }
}

// Row-by-row noise vs point by point (includes the planet seam, tileRow/tileX).
const W = 700, row = new Float64Array(W);
for (const y of [0, 13, 377]) {
  fbmRow(row, W, 0, 0.018, y * 0.018, 4, 55);
  tileRow(row, W, 128, (x) => fbm(x * 0.018, y * 0.018, 4, 55));
  for (let x = 0; x < W; x++) assert.equal(row[x], tileX((xx) => fbm(xx * 0.018, y * 0.018, 4, 55), x, W, 128), `fbmRow x=${x}`);
  valueNoiseRow(row, W, 0, 0.45, y * 0.45, 7);
  for (let x = 0; x < W; x++) assert.equal(row[x], valueNoise(x * 0.45, y * 0.45, 7), `valueNoiseRow x=${x}`);
}

// Cached 3D noise vs direct trilinear interpolation of the same corners (order x, y, z).
const n3 = cachedNoise3(9);
const corner = (x, y, z) => n3(x, y, z); // at the exact corners the noise equals the random draw itself
for (let i = 0; i < 2000; i++) {
  const x = rnd() * 50, y = rnd() * 50, z = rnd() * 50, xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t), fx = s(x - xi), fy = s(y - yi), fz = s(z - zi), l = (a, b, t) => a + (b - a) * t;
  const plane = (zz) => l(l(corner(xi, yi, zz), corner(xi + 1, yi, zz), fx), l(corner(xi, yi + 1, zz), corner(xi + 1, yi + 1, zz), fx), fy);
  assert.ok(Math.abs(n3(x, y, z) - l(plane(zi), plane(zi + 1), fz)) < 1e-12, `cachedNoise3 em ${x},${y},${z}`);
}

console.log('ok');
