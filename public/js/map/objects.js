import { assets, engravingSize, variantImg, baseWidth } from './assets.js';

// Box (unrotated) of an engraving, in map coordinates.
export function engravingBox(o) {
  const a = assets.get(o.asset);
  const { w, h } = a ? engravingSize(a, o.scale, o.variant) : { w: 40 * o.scale, h: 40 * o.scale };
  const top = a && a.anchor === 'center' ? o.y - h / 2 : o.y - h;
  return { x: o.x - w / 2, y: top, w, h };
}

// Engraving colors (Wonderdraft asset convention):
//  "cor": "amostra" -> white becomes the color of the terrain it was placed on (o.solo);
//  "cores": [c1, c2, c3] -> the red, green and blue parts of the image become c1, c2 and c3.
function tintOf(a, o, look) {
  if (a.color === 'sample' && look.pal) {
    const p = look.pal, T = o.ground ? p.terrains[o.ground] : null;
    if (!o.ground) return p.water.shallow;
    if (!T) return null;
    return T.light.map((c, i) => Math.round(c * 0.65 + T.dark[i] * 0.35));
  }
  return null;
}

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Image with colors already applied, sized w x h.
export function colored(img, w, h, a, tint) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const g = c.getContext('2d', { willReadFrequently: !!a.colors });
  g.drawImage(img, 0, 0, c.width, c.height);
  if (tint) {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${tint.join(',')})`;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in'; // restores the original transparency
    g.drawImage(img, 0, 0, c.width, c.height);
  } else if (a.colors) {
    const [c1, c2, c3] = a.colors.map(hexRgb);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
      for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, r * c1[k] + gg * c2[k] + b * c3[k]);
    }
    g.putImageData(im, 0, 0);
  }
  return c;
}

// Each image is pre-rendered once with colors, filter and shadow; drawing becomes a cheap copy.
const SPRITE_RES = 2; // cache resolution relative to default width (sharp up to a 2× export)
const sprites = new Map();

function sprite(a, o, look) {
  const img = variantImg(a, o.variant);
  const tint = tintOf(a, o, look);
  const key = `${a.id}|${o.variant || 0}|${!!o.flip}|${look.filter}|${look.shadow}|${tint}`;
  let s = sprites.get(key);
  if (s) return s;
  const k = SPRITE_RES;
  const w = baseWidth(a, o.variant) * k, h = (w * img.naturalHeight) / img.naturalWidth;
  const src = colored(img, w, h, a, tint);
  const pad = look.shadow ? 12 * k : 0;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w + 2 * pad);
  c.height = Math.ceil(h + 2 * pad);
  const g = c.getContext('2d');
  g.filter = look.filter;
  if (look.shadow) {
    g.shadowColor = 'rgba(25, 18, 8, 0.45)';
    g.shadowBlur = 5 * k;
    g.shadowOffsetX = 2 * k;
    g.shadowOffsetY = 3 * k;
  }
  // Mirror only the image: the shadow keeps falling to the same side.
  g.translate(pad + w / 2, pad);
  if (o.flip) g.scale(-1, 1);
  g.drawImage(src, -w / 2, 0, w, h);
  s = { canvas: c, pad: pad / k };
  sprites.set(key, s);
  return s;
}

// look = { filter, shadow, pal }; without look draws the raw image (used in the preview).
export function drawEngraving(ctx, o, look) {
  const a = assets.get(o.asset);
  const img = a && variantImg(a, o.variant);
  const b = engravingBox(o);
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate((o.rot * Math.PI) / 180);
  const top = b.y - o.y;
  if (img && look) {
    const sp = sprite(a, o, look);
    const pad = sp.pad * o.scale;
    ctx.drawImage(sp.canvas, -b.w / 2 - pad, top - pad, b.w + 2 * pad, b.h + 2 * pad);
  } else if (img) {
    if (o.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -b.w / 2, top, b.w, b.h);
  } else {
    ctx.strokeStyle = '#7a2a2a';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-b.w / 2, top, b.w, b.h);
    ctx.fillStyle = '#7a2a2a';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(o.asset, 0, top + b.h / 2);
  }
  ctx.restore();
}

function setLabelFont(ctx, o) {
  ctx.font = `${o.size}px "${o.font}", serif`;
  ctx.letterSpacing = `${o.spacing}px`;
}

// Curved text (o.curve from -1 to 1): lines follow the parabola y = a·x², with a = 2·curve/w.
// curve > 0 makes an arch (ends down), curve < 0 a "bowl". The sag (height of the middle
// relative to the ends) is sag; the whole text moves up sag/2 to stay centered on the anchor.
function parabola(curve, w) {
  const a = (2 * curve) / Math.max(w, 1);
  // arc length from 0 to x
  const S = (x) => (Math.abs(a) < 1e-9 ? x : (x * Math.sqrt(1 + 4 * a * a * x * x)) / 2 + Math.asinh(2 * a * x) / (4 * a));
  // x whose arc length from the middle is s (bisection; S is increasing)
  const X = (s) => {
    let lo = -Math.abs(s) - 1, hi = Math.abs(s) + 1;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (S(m) < s) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  const half = X(w / 2);
  return { a, X, half, sag: a * half * half };
}

export function labelBox(ctx, o) {
  setLabelFont(ctx, o);
  const lines = o.text.split('\n');
  let w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  let h = lines.length * o.size * 1.15;
  if (o.curve) { // width = curve chord + tilted letters at the ends; height grows by the sag
    const { a, half, sag } = parabola(o.curve, w);
    h += Math.abs(sag);
    w = 2 * half + (o.size + (lines.length - 1) * o.size * 1.15) * Math.abs(Math.sin(Math.atan(2 * a * half))); // outer lines spread more
  }
  return { x: o.x - w / 2, y: o.y - h / 2, w, h };
}

// Letter positions for each line, in the text's local coordinates (before positioning and rotating).
// edges[i] = distance from the line start to the edge before letter i (measured by prefixes, which
// keeps kerning and spacing); at(s) = point and angle of the curve s px from the line start.
// Used for letter-by-letter drawing and for the cursor when editing curved text.
export function labelLayout(ctx, o) {
  setLabelFont(ctx, o);
  const lines = o.text.split('\n'), lh = o.size * 1.15;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const pb = o.curve ? parabola(o.curve, w) : null;
  return lines.map((line, k) => {
    const dy = (k - (lines.length - 1) / 2) * lh;
    const edges = [0];
    for (let i = 1; i <= line.length; i++) edges.push(ctx.measureText(line.slice(0, i)).width);
    const lw = edges[line.length];
    const at = (s) => {
      if (!pb) return { x: s - lw / 2, y: dy, ang: 0 };
      const x = pb.X(s - lw / 2), ang = Math.atan(2 * pb.a * x);
      return { x: x - Math.sin(ang) * dy, y: pb.a * x * x - pb.sag / 2 + Math.cos(ang) * dy, ang };
    };
    return { line, edges, at };
  });
}

export function drawLabel(ctx, o, palette) {
  const lines = o.text.split('\n');
  const lh = o.size * 1.15;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate((o.rot * Math.PI) / 180);
  setLabelFont(ctx, o);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, o.size * 0.16);
  const [pr, pg, pb] = palette.paper;
  ctx.strokeStyle = `rgba(${pr},${pg},${pb},0.7)`;
  ctx.fillStyle = o.color;
  if (o.curve) { // letter by letter along the curve
    for (const { line, edges, at } of labelLayout(ctx, o)) {
      for (let i = 0; i < line.length; i++) {
        const p = at((edges[i] + edges[i + 1]) / 2);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.ang);
        ctx.strokeText(line[i], 0, 0);
        ctx.fillText(line[i], 0, 0);
        ctx.restore();
      }
    }
  } else {
    lines.forEach((line, k) => {
      const y = (k - (lines.length - 1) / 2) * lh;
      ctx.strokeText(line, 0, y);
      ctx.fillText(line, 0, y);
    });
  }
  ctx.restore();
}
