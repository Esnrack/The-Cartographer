import { fbm, valueNoise, tileX, fbmRow, valueNoiseRow, tileRow, cachedNoise3, cachedFbm3 } from './noise.js';
import { edt2d, INF } from './edt.js';

// Max reach (in cells) of coast effects: waves, depth and edge.
export const MAXD = 48;

// Neighbor points used to smooth the transition between land types.
const BX = [0, 3, -3, 0, 0, 2, -2, 2, -2];
const BY = [0, 0, 0, 3, -3, 2, 2, -2, -2];

// Terrain grid: each cell stores a type (0 = water). The grid is rendered
// into an image of the same size, which is then scaled up to the map size.
// Terrain noise textures for rows [from, to): fine and coarse have (to - from) * w values.
// Also run in the workers (workers/tasks-worker.js), in bands, while the page decodes the terrain.
export function terrainNoiseRows(fine, coarse, w, from, to, seed) {
  // Row by row with the fast noise versions (same result as tileX(valueNoise/fbm)).
  const row = new Float64Array(w), band = Math.min(w / 4, 128);
  for (let y = from; y < to; y++) {
    valueNoiseRow(row, w, 0, 0.45, y * 0.45, seed + 7);
    tileRow(row, w, 16, (xx) => valueNoise(xx * 0.45, y * 0.45, seed + 7));
    fine.set(row, (y - from) * w);
    fbmRow(row, w, 0, 0.018, y * 0.018, 4, seed + 13);
    tileRow(row, w, band, (xx) => fbm(xx * 0.018, y * 0.018, 4, seed + 13));
    coarse.set(row, (y - from) * w);
  }
}

export class Terrain {
  // noise = false: the noise textures stay zeroed for someone to fill later
  // (the workers, when opening a map; or fillNoise()).
  constructor(w, h, seed, noise = true) {
    this.w = w;
    this.h = h;
    this.seed = seed;
    const n = w * h;
    this.grid = new Uint8Array(n);
    this.distLand = new Float32Array(n);
    this.distWater = new Float32Array(n);
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.texFine = new Float32Array(n);
    this.texCoarse = new Float32Array(n);
    if (noise) this.fillNoise();
    this.palette = null;
    this.style = null;
    this.wrapX = false; // planet: the left edge continues on the right
  }

  fillNoise() {
    terrainNoiseRows(this.texFine, this.texCoarse, this.w, 0, this.h, this.seed);
  }

  // Noise that warps the brush edge and makes a jagged coastline.
  // size > 1 makes the irregularities bigger (more stretched noise).
  rough(x, y, size = 1) {
    const k = 1 / size;
    const f = (xx) => 0.7 * fbm(xx * 0.045 * k, y * 0.045 * k, 3, this.seed + 101) + 0.3 * valueNoise(xx * 0.35 * k, y * 0.35 * k, this.seed + 202);
    return tileX(f, x, this.w, Math.min(this.w / 4, 64 * size));
  }

  typeAt(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.grid[y * this.w + x];
  }

  // Paints an irregular circle. Coordinates and radius in cells.
  paint(cx, cy, r, type, roughness, onlyLand, roughSize = 1) {
    const amp = roughness * (8 * roughSize + r); // bigger notches also cut deeper
    const ext = r + amp * 0.5 + 1;
    const inner = r - amp * 0.5;
    const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(this.w, Math.ceil(cx + ext) + 1);
    const y0 = Math.max(0, Math.floor(cy - ext)), y1 = Math.min(this.h, Math.ceil(cy + ext) + 1);
    if (x0 >= x1 || y0 >= y1) return null;
    const { grid, w } = this;
    // Returns only the box of what changed: dragging over already painted area redraws nothing.
    let mx0 = x1, my0 = y1, mx1 = -1, my1 = -1;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        if (grid[i] === type || (onlyLand && grid[i] === 0)) continue; // before the noise, which is expensive
        const d = Math.hypot(x - cx, y - cy);
        if (d > ext) continue;
        if (d > inner && d > r + amp * (this.rough(x, y, roughSize) - 0.5)) continue;
        grid[i] = type;
        if (x < mx0) mx0 = x;
        if (x > mx1) mx1 = x;
        if (y < my0) my0 = y;
        my1 = y;
      }
    }
    if (mx1 < 0) return null;
    // Land-only painting doesn't change the coast: we can skip the distance transform.
    return { x0: mx0, y0: my0, x1: mx1 + 1, y1: my1 + 1, coast: !onlyLand };
  }

  // Planet brush: a circle on the sphere surface (angular distance), not on the flat map.
  // Near the poles it gets wider on the map, which is what keeps it round on the globe.
  // r is the radius in cells measured at the equator. Needs wrapX (x may go past the edges).
  paintSphere(cx, cy, r, type, roughness, onlyLand, roughSize = 1) {
    const { grid, w, h } = this;
    const kx = (2 * Math.PI) / w, ky = Math.PI / h; // radians per cell
    const amp = roughness * (8 * roughSize + r); // bigger notches also cut deeper
    const ext = r + amp * 0.5 + 1;
    const inner = r - amp * 0.5;
    const extAng = ext * kx;
    const latC = (0.5 - cy / h) * Math.PI, sC = Math.sin(latC), cC = Math.cos(latC);
    const ey = extAng / ky;
    const y0 = Math.max(0, Math.floor(cy - ey)), y1 = Math.min(h, Math.ceil(cy + ey) + 1);
    if (y0 >= y1) return null;
    // Longitude width of the cap; if it includes a pole, it spans the full circle.
    const ratio = Math.sin(Math.min(extAng, Math.PI / 2)) / cC;
    let x0, x1;
    if (Math.abs(latC) + extAng >= Math.PI / 2 || ratio >= 1) { x0 = 0; x1 = w; } else {
      const ex = Math.asin(ratio) / kx;
      x0 = Math.floor(cx - ex);
      x1 = Math.ceil(cx + ex) + 1;
      if (x1 - x0 >= w) { x0 = 0; x1 = w; }
    }
    // Compares cosines (no acos) and only computes distance in the irregular edge band.
    const cosExt = Math.cos(Math.min(Math.PI, extAng)), cosInner = inner > 0 ? Math.cos(inner * kx) : 2;
    const cosDL = new Float64Array(x1 - x0);
    for (let x = x0; x < x1; x++) cosDL[x - x0] = Math.cos((x - cx) * kx);
    let mx0 = Infinity, my0 = y1, mx1 = -Infinity, my1 = -1;
    for (let y = y0; y < y1; y++) {
      const lat = (0.5 - y / h) * Math.PI, a = sC * Math.sin(lat), b = cC * Math.cos(lat);
      for (let x = x0; x < x1; x++) {
        const xi = ((x % w) + w) % w, i = y * w + xi;
        if (grid[i] === type || (onlyLand && grid[i] === 0)) continue;
        const c = a + b * cosDL[x - x0];
        if (c < cosExt) continue;
        if (c < cosInner) {
          const d = Math.acos(c > 1 ? 1 : c) / kx;
          if (d > r + amp * (this.rough(xi, y, roughSize) - 0.5)) continue;
        }
        grid[i] = type;
        if (x < mx0) mx0 = x;
        if (x > mx1) mx1 = x;
        if (y < my0) my0 = y;
        my1 = y;
      }
    }
    if (my1 < 0) return null;
    return { x0: mx0, y0: my0, x1: mx1 + 1, y1: my1 + 1, coast: !onlyLand };
  }

  // Paint bucket: fills the contiguous region of the same type.
  fill(sx, sy, type) {
    const { w, h, grid } = this;
    const s = sy * w + sx;
    const from = grid[s];
    if (from === type) return null;
    let x0 = sx, x1 = sx, y0 = sy, y1 = sy;
    const stack = [s];
    grid[s] = type;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; else if (x > x1) x1 = x;
      if (y < y0) y0 = y; else if (y > y1) y1 = y;
      const l = x > 0 ? i - 1 : this.wrapX ? i + w - 1 : -1;
      const r = x < w - 1 ? i + 1 : this.wrapX ? i - w + 1 : -1;
      if (l >= 0 && grid[l] === from) { grid[l] = type; stack.push(l); }
      if (r >= 0 && grid[r] === from) { grid[r] = type; stack.push(r); }
      if (y > 0 && grid[i - w] === from) { grid[i - w] = type; stack.push(i - w); }
      if (y < h - 1 && grid[i + w] === from) { grid[i + w] = type; stack.push(i + w); }
    }
    return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }

  // Recomputes coast distances and redraws the changed area (with margin).
  update(r) {
    this.shadeRange(...this.distances(r));
  }

  // Recomputes coast distances around r and returns the area to repaint [x0, y0, x1, y1].
  distances(r) {
    const { w, h, grid, distLand, distWater } = this;
    const wrap = this.wrapX;
    const X = (x) => (wrap ? ((x % w) + w) % w : x);
    // Terrain color blending reads neighbors up to 3 cells away (BX/BY).
    if (r.coast === false) return [r.x0 - 3, r.y0 - 3, r.x1 + 3, r.y1 + 3];
    const M = MAXD;
    // With wrapX the window goes past the edge and reads the other side of the map.
    const ox0 = wrap ? r.x0 - 2 * M : Math.max(0, r.x0 - 2 * M), oy0 = Math.max(0, r.y0 - 2 * M);
    const ox1 = wrap ? r.x1 + 2 * M : Math.min(w, r.x1 + 2 * M), oy1 = Math.min(h, r.y1 + 2 * M);
    const sw = ox1 - ox0, sh = oy1 - oy0;
    // Buffers reused between frames: allocating on every stroke caused garbage collection pauses.
    if (!this.edtBuf || this.edtBuf[0].length < sw * sh) this.edtBuf = [new Float32Array(sw * sh), new Float32Array(sw * sh)];
    const fl = this.edtBuf[0].subarray(0, sw * sh), fw = this.edtBuf[1].subarray(0, sw * sh);
    for (let y = 0; y < sh; y++) {
      const row = (y + oy0) * w;
      if (!wrap) { // direct path (no wrapping around the map): the common case and much faster
        for (let x = 0, j = y * sw, i = row + ox0; x < sw; x++, j++, i++) {
          const land = grid[i] !== 0;
          fl[j] = land ? 0 : INF;
          fw[j] = land ? INF : 0;
        }
        continue;
      }
      for (let x = 0, j = y * sw; x < sw; x++, j++) {
        const land = grid[row + X(x + ox0)] !== 0;
        fl[j] = land ? 0 : INF;
        fw[j] = land ? INF : 0;
      }
    }
    edt2d(fl, sw, sh, M); // distances above M don't matter (they are capped at M just below)
    edt2d(fw, sw, sh, M);
    const ix0 = wrap ? r.x0 - M : Math.max(0, r.x0 - M), iy0 = Math.max(0, r.y0 - M);
    const ix1 = wrap ? Math.min(r.x1 + M, ix0 + w) : Math.min(w, r.x1 + M), iy1 = Math.min(h, r.y1 + M);
    for (let y = iy0; y < iy1; y++) {
      for (let x = ix0; x < ix1; x++) {
        const i = y * w + (wrap ? X(x) : x), j = (y - oy0) * sw + (x - ox0);
        const a = fl[j], b = fw[j]; // one of the two is 0 (the cell is land or water): skip the sqrt
        distLand[i] = a === 0 ? 0 : Math.min(Math.sqrt(a), M);
        distWater[i] = b === 0 ? 0 : Math.min(Math.sqrt(b), M);
      }
    }
    return [ix0, iy0, ix1, iy1];
  }

  // shade() with x allowed past the edges (wraps around if wrapX).
  shadeRange(x0, y0, x1, y1) {
    const { w, h } = this;
    y0 = Math.max(0, y0);
    y1 = Math.min(h, y1);
    if (!this.wrapX) return this.shade(Math.max(0, x0), y0, Math.min(w, x1), y1);
    if (x1 - x0 >= w) return this.shade(0, y0, w, y1);
    const a = ((x0 % w) + w) % w, b = a + (x1 - x0);
    this.shade(a, y0, Math.min(w, b), y1);
    if (b > w) this.shade(0, y0, b - w, y1);
  }

  updateAll() {
    this.update({ x0: 0, y0: 0, x1: this.w, y1: this.h });
  }

  shadeAll() {
    this.shade(0, 0, this.w, this.h);
  }

  // Planet version: same colors, but the texture near the poles comes from 3D noise
  // on the sphere (on the flat map it would stretch into rays at the pole). The flat map doesn't change.
  enableSphere() {
    if (this.sph) return;
    const { w, h, seed } = this;
    const fine = this.texFine.slice(), coarse = this.texCoarse.slice();
    const Rc = w / (2 * Math.PI); // sphere radius in cells: 1 cell at the equator = 1 unit
    const a0 = (55 * Math.PI) / 180, a1 = (70 * Math.PI) / 180; // transition to 3D noise
    const n3 = cachedNoise3(seed + 7), f3 = cachedFbm3(4, seed + 13);
    const sinL = new Float64Array(w), cosL = new Float64Array(w); // sine/cosine of longitude, per column
    for (let x = 0; x < w; x++) {
      const lon = (x / w - 0.5) * 2 * Math.PI;
      sinL[x] = Math.sin(lon);
      cosL[x] = Math.cos(lon);
    }
    for (let y = 0; y < h; y++) {
      const lat = (0.5 - y / h) * Math.PI;
      let t = (Math.abs(lat) - a0) / (a1 - a0);
      if (t <= 0) continue;
      t = t >= 1 ? 1 : t * t * (3 - 2 * t);
      const sy = Math.sin(lat) * Rc, cr = Math.cos(lat) * Rc;
      for (let x = 0; x < w; x++) {
        const px = cr * sinL[x], pz = cr * cosL[x], i = y * w + x;
        fine[i] += (n3(px * 0.45, sy * 0.45, pz * 0.45) - fine[i]) * t;
        coarse[i] += (f3(px * 0.018, sy * 0.018, pz * 0.018) - coarse[i]) * t;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    this.sph = { fine, coarse, canvas, ctx, img: ctx.createImageData(w, h) };
    // Outside the pole bands the textures didn't change: copy the already painted flat map and repaint
    // only the poles (with 3 rows of margin for neighbor color blending). Repainting everything
    // was most of the wait when first opening the planet on a big map.
    this.sph.img.data.set(this.img.data);
    ctx.putImageData(this.sph.img, 0, 0);
    const yN = Math.min(h, Math.ceil(h * (0.5 - a0 / Math.PI)) + 3), yS = Math.max(0, Math.floor(h * (0.5 + a0 / Math.PI)) - 3);
    if (yN >= yS) this.shadeInto(this.sph, 0, 0, w, h);
    else {
      this.shadeInto(this.sph, 0, 0, w, yN);
      this.shadeInto(this.sph, 0, yS, w, h);
    }
  }

  shade(x0, y0, x1, y1) {
    this.shadeInto({ fine: this.texFine, coarse: this.texCoarse, img: this.img, ctx: this.ctx }, x0, y0, x1, y1);
    if (this.sph) this.shadeInto(this.sph, x0, y0, x1, y1);
  }

  shadeInto(dst, x0, y0, x1, y1) {
    const { w, h, grid, distLand, distWater } = this;
    const texFine = dst.fine, texCoarse = dst.coarse;
    const p = this.palette, st = this.style, A = p.water;
    const data = dst.img.data;
    const sp = st.waveSpacing, rc = st.waves, deep = st.depth;
    const rippleMax = sp * (rc + 0.5), ws = st.waveStrength, ol = st.outline;
    // Colors outside the loop, with the same math in the same order (identical pixels), but without
    // object lookups per cell: painting a whole big map got much faster.
    const [s0, s1, s2] = A.shallow, [d0, d1, d2] = A.deep, [w0, w1, w2] = A.wave, [c0, c1, c2] = A.coastline;
    const [o0, o1, o2] = p.outline;
    const DR = new Float64Array(256), DG = new Float64Array(256), DB = new Float64Array(256);
    const LR = new Float64Array(256), LG = new Float64Array(256), LB = new Float64Array(256);
    // Sum of the 9 neighbors when all are the same type (the case for almost every land cell),
    // done with the same 9 additions in sequence: gives exactly the same number as the loop sum.
    const SDR = new Float64Array(256), SDG = new Float64Array(256), SDB = new Float64Array(256);
    const SLR = new Float64Array(256), SLG = new Float64Array(256), SLB = new Float64Array(256);
    for (let k = 1; k < 256; k++) {
      const T = p.terrains[k] || p.terrains[1];
      DR[k] = T.dark[0]; DG[k] = T.dark[1]; DB[k] = T.dark[2];
      LR[k] = T.light[0]; LG[k] = T.light[1]; LB[k] = T.light[2];
      for (let s = 0; s < 9; s++) {
        SDR[k] += DR[k]; SDG[k] += DG[k]; SDB[k] += DB[k];
        SLR[k] += LR[k]; SLG[k] += LG[k]; SLB[k] += LB[k];
      }
    }
    const OFF = BX.map((bx, s) => BY[s] * w + bx); // neighbors away from the edge: fixed offset
    const wrap = this.wrapX;
    for (let y = y0; y < y1; y++) {
      const yIn = y >= 3 && y < h - 3;
      for (let x = x0; x < x1; x++) {
        const i = y * w + x, t = grid[i], nf = texFine[i], nc = texCoarse[i];
        let r, g, b;
        if (t === 0) {
          const d = distLand[i];
          let k = (d - 1) / deep;
          k = k < 0 ? 0 : k > 1 ? 1 : k;
          k = k * k * (3 - 2 * k);
          const m = 0.9 + 0.2 * nc + (nf - 0.5) * 0.04;
          r = (s0 + (d0 - s0) * k) * m;
          g = (s1 + (d1 - s1) * k) * m;
          b = (s2 + (d2 - s2) * k) * m;
          if (rc > 0 && d < rippleMax) {
            const q = Math.round(d / sp);
            if (q >= 1 && q <= rc) {
              let a = 1 - Math.abs(d - q * sp);
              if (a > 0) {
                a *= ws * (1 - ((q - 1) / rc) * 0.75);
                r += (w0 - r) * a;
                g += (w1 - g) * a;
                b += (w2 - b) * a;
              }
            }
          }
          if (d < 2) {
            const a = (2 - d) * 0.6;
            r += (c0 - r) * a;
            g += (c1 - g) * a;
            b += (c2 - b) * a;
          }
        } else {
          let er = 0, eg = 0, eb = 0, cr = 0, cg = 0, cb = 0;
          const inside = yIn && x >= 3 && x < w - 3;
          let same = inside;
          for (let s = 1; same && s < 9; s++) { const v = grid[i + OFF[s]]; same = v === t || v === 0; }
          if (same) {
            er = SDR[t]; eg = SDG[t]; eb = SDB[t];
            cr = SLR[t]; cg = SLG[t]; cb = SLB[t];
          } else for (let s = 0; s < 9; s++) {
            let tt;
            if (inside) tt = grid[i + OFF[s]];
            else {
              let xx = x + BX[s], yy = y + BY[s];
              xx = wrap ? (xx + w) % w : xx < 0 ? 0 : xx >= w ? w - 1 : xx;
              yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
              tt = grid[yy * w + xx];
            }
            if (tt === 0) tt = t;
            er += DR[tt]; eg += DG[tt]; eb += DB[tt];
            cr += LR[tt]; cg += LG[tt]; cb += LB[tt];
          }
          const n = (nc * 0.7 + nf * 0.3) * 1.6 - 0.3;
          r = (er + (cr - er) * n) / 9;
          g = (eg + (cg - eg) * n) / 9;
          b = (eb + (cb - eb) * n) / 9;
          const dw = distWater[i];
          if (dw < ol + 1) {
            let a = 1 - (dw - 1) / ol;
            a = a < 0 ? 0 : a * a * 0.85;
            r += (o0 - r) * a;
            g += (o1 - g) * a;
            b += (o2 - b) * a;
          }
        }
        const o = i * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
    dst.ctx.putImageData(dst.img, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }

}
