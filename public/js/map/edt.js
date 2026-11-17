// Exact Euclidean distance transform (Felzenszwalb & Huttenlocher).
// Used to draw the waves that follow the coast and the depth gradient.

export const INF = 1e20;

function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

// f: 0 at source cells, INF elsewhere. Returns the squared distance (in place).
let line, d, v, z; // reused between calls

// f must be binary (only 0 or INF), as in Terrain.update.
// cap (optional): only distances up to cap matter. Above it the value comes out as (cap + 1)²
// instead of the exact one, and rows with no source within cap cells skip the horizontal pass.
let prev; // vertical distance of the previous row, per column
export function edt2d(f, w, h, cap = Infinity) {
  const n = Math.max(w, h);
  if (!line || line.length < n) {
    line = new Float64Array(n);
    d = new Float64Array(n);
    v = new Int32Array(n);
    z = new Float64Array(n + 1);
  }
  if (!prev || prev.length < w) prev = new Float64Array(w);
  // Vertical pass: with binary input it is just the distance to the nearest source in the
  // column, which comes from two row-by-row sweeps (top-down and bottom-up). Same result as the
  // column-wise version, but reading memory sequentially: that one jumped w positions each step
  // and was most of the time spent computing coast distance on a big map.
  prev.fill(INF, 0, w);
  for (let y = 0, o = 0; y < h; y++, o += w) {
    for (let x = 0; x < w; x++) {
      const g = f[o + x] === 0 ? 0 : prev[x] + 1;
      prev[x] = g;
      f[o + x] = g;
    }
  }
  prev.fill(INF, 0, w);
  const far = cap + 1, far2 = cap === Infinity ? INF : far * far;
  for (let y = h - 1, o = (h - 1) * w; y >= 0; y--, o -= w) {
    for (let x = 0; x < w; x++) {
      const g = Math.min(f[o + x], prev[x] + 1);
      prev[x] = g;
      f[o + x] = g > cap || g >= INF ? far2 : g * g; // column with no source: stays INF
    }
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    // Only the stretch between the first and last source within cap cells (vertically), with cap of
    // margin on each side, can be closer than cap; outside it everything is already "far" (far2).
    let lo = 0, hi = w - 1;
    while (lo < w && f[o + lo] >= far2) lo++;
    if (lo === w) continue; // row with nothing nearby
    while (f[o + hi] >= far2) hi--;
    const x0 = Math.max(0, lo - (cap === Infinity ? w : cap)), x1 = Math.min(w, hi + 1 + (cap === Infinity ? w : cap)), m = x1 - x0;
    for (let x = 0; x < m; x++) line[x] = f[o + x0 + x];
    edt1d(line, m, d, v, z);
    for (let x = 0; x < m; x++) f[o + x0 + x] = d[x];
  }
}
