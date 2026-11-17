// Deterministic noise (value noise + fBm). Same seed => same map.

export function hash(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// 3D noise (for textures on the planet sphere, without stretching at the poles): see cachedNoise3 and cachedFbm3.
function hash3(x, y, z, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440670441) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Makes f(x) periodic in x (period 'period'): near the right edge it blends with
// f(x - period), which at the edge equals exactly f(0). Used so the planet has no seam.
export function tileX(f, x, period, band) {
  const t = (x - (period - band)) / band;
  if (t <= 0) return f(x);
  const s = t * t * (3 - 2 * t), a = f(x);
  return a + (f(x - period) - a) * s;
}

export function fbm(x, y, octaves, seed) {
  let sum = 0, amp = 0.5, total = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f, y * f, seed + i * 31);
    total += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / total;
}

// ---- Fast versions (same result as computing point by point) ----
// Value noise only picks random values at grid corners; walking along a row the cell
// repeats for many pixels (dozens, at low frequencies). Keeping the corners while the
// cell doesn't change avoids recomputing hashes: opening a big map went from seconds to fractions.

// out[i] += amp * valueNoise((x0 + i) * fx * fo, y * fo, seed), for i = 0..n-1.
// (fx * fo and y * fo in the same order as fbm's math, to give exactly the same numbers.)
function valueNoiseRowAdd(out, n, x0, fx, fo, yv, seed, amp) {
  const yi = Math.floor(yv);
  let fy = yv - yi;
  fy = fy * fy * (3 - 2 * fy);
  let last = NaN, a = 0, b = 0, c = 0, d = 0;
  for (let i = 0; i < n; i++) {
    const xv = (x0 + i) * fx * fo, xi = Math.floor(xv);
    if (xi !== last) {
      a = hash(xi, yi, seed); b = hash(xi + 1, yi, seed);
      c = hash(xi, yi + 1, seed); d = hash(xi + 1, yi + 1, seed);
      last = xi;
    }
    let t = xv - xi;
    t = t * t * (3 - 2 * t);
    out[i] += amp * (a + (b - a) * t + (c - a) * fy + (a - b - c + d) * t * fy);
  }
}

// out[i] = fbm((x0 + i) * fx, y * fy, octaves, seed) for a whole row.
export function fbmRow(out, n, x0, fx, yv, octaves, seed) {
  out.fill(0, 0, n);
  let amp = 0.5, total = 0, f = 1;
  for (let k = 0; k < octaves; k++) {
    valueNoiseRowAdd(out, n, x0, fx, f, yv * f, seed + k * 31, amp);
    total += amp;
    amp *= 0.5;
    f *= 2;
  }
  for (let i = 0; i < n; i++) out[i] /= total;
}

// out[i] = valueNoise((x0 + i) * fx, yv, seed) for a whole row.
export function valueNoiseRow(out, n, x0, fx, yv, seed) {
  out.fill(0, 0, n);
  valueNoiseRowAdd(out, n, x0, fx, 1, yv, seed, 1);
}

// Applies tileX to an already computed row: near the right edge it blends with f(x - period).
export function tileRow(out, period, band, f) {
  for (let x = Math.max(0, Math.ceil(period - band)); x < period; x++) {
    const t = (x - (period - band)) / band;
    if (t <= 0) continue;
    const s = t * t * (3 - 2 * t);
    out[x] += (f(x - period) - out[x]) * s;
  }
}

// 3D value noise that remembers the last grid cell (the 8 corners only change when the cell does).
// Interpolates in x, then y, then z. One per seed/octave.
export function cachedNoise3(seed) {
  let lx = NaN, ly = NaN, lz = NaN, c000, c100, c010, c110, c001, c101, c011, c111;
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    if (xi !== lx || yi !== ly || zi !== lz) {
      c000 = hash3(xi, yi, zi, seed); c100 = hash3(xi + 1, yi, zi, seed);
      c010 = hash3(xi, yi + 1, zi, seed); c110 = hash3(xi + 1, yi + 1, zi, seed);
      c001 = hash3(xi, yi, zi + 1, seed); c101 = hash3(xi + 1, yi, zi + 1, seed);
      c011 = hash3(xi, yi + 1, zi + 1, seed); c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
      lx = xi; ly = yi; lz = zi;
    }
    let fx = x - xi, fy = y - yi, fz = z - zi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    fz = fz * fz * (3 - 2 * fz);
    const p0 = (c000 + (c100 - c000) * fx) + ((c010 + (c110 - c010) * fx) - (c000 + (c100 - c000) * fx)) * fy;
    const p1 = (c001 + (c101 - c001) * fx) + ((c011 + (c111 - c011) * fx) - (c001 + (c101 - c001) * fx)) * fy;
    return p0 + (p1 - p0) * fz;
  };
}

// 3D fBm (sum of cachedNoise3 octaves), with memory per octave.
export function cachedFbm3(octaves, seed) {
  const oct = Array.from({ length: octaves }, (_, i) => cachedNoise3(seed + i * 31));
  return (x, y, z) => {
    let sum = 0, amp = 0.5, total = 0, f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += amp * oct[i](x * f, y * f, z * f);
      total += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / total;
  };
}
