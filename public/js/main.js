import { Terrain, MAXD } from './map/terrain.js';
import { PALETTES, TERRAIN_TYPES, swatchColor } from './map/palettes.js';
import { loadAssets, assets, engravingSize, registerUserAsset, unregisterUserAsset } from './map/assets.js';
import { drawEngraving, drawLabel, engravingBox, labelBox, labelLayout, colored } from './map/objects.js';
import { encodeGrid, decodeGrid } from './map/project.js';
import { cacheGet, cachePut, userAssetsAll, userAssetPut, userAssetDelete } from './storage/cache.js';
import { fbm } from './map/noise.js';
import { createGlobe, screenToMap, mapToScreen } from './map/globe.js';
import { setupCloud, services } from './ui/cloud-dialog.js';
import { strokeSelection, drawSelectBox, SEL_COLOR, SEL_HINT } from './ui/selection.js';
import { splitOnPool } from './workers/pool.js';
import { startTour, tourDone } from './ui/tour.js';
import { t as tr, localName, lang, setLang, applyLanguage, LANGUAGES } from './i18n.js';

const $ = (s) => document.querySelector(s);
const AUTOSAVE_KEY = 'the-cartographer:autosave';
const CELL = 2; // map pixels per terrain cell
const FONTS = ['IM Fell English SC', 'IM Fell English', 'MedievalSharp', 'Cinzel', 'Uncial Antiqua', 'Pirata One'];
const DEFAULT_STYLE = {
  waves: 4, waveSpacing: 4, waveStrength: 0.55, depth: 22, outline: 3,
  grain: 0.45, vignette: 0.45, shadows: true,
};

const state = {
  W: 2000, H: 1500, seed: 1,
  palette: 'colored',
  style: { ...DEFAULT_STYLE },
  terrain: null,
  objects: [],
  tool: 'brush',
  brush: { mode: 'brush', type: 1, size: 60, rough: 0.6, roughSize: 1, onlyLand: false },
  engraving: { asset: null, variant: -1, scale: 1, vary: 0.15, randomFlip: true, scatter: false, radius: 60, density: 1, onlyLand: true },
  label: { text: tr('example_text'), font: FONTS[0], size: 48, color: '#3b2a1a', spacing: 4, curve: 0 },
  selected: null, // single selected object (for the properties panel)
  selection: [], // all selected objects
  view: { x: 0, y: 0, z: 1 },
  globe: { on: false, lon0: 0, lat0: 0, zoom: 1 }, // planet view
  ref: { img: null, opacity: 0.5, visible: true },
};

const canvas = $('#view');
const ctx = canvas.getContext('2d');
const objLayer = document.createElement('canvas');
let grain = []; // paper texture: finished strips from the workers [{ bitmap, y }] (empty = no grain)

// ---------------------------------------------------------------- render loop

let needsRender = true, objectsDirty = true, styleDirty = false;
const terrainQueue = []; // terrain areas to recompute, in order
let objectsRect = null, strokeRect = null; // areas of the objects layer to redraw

// Pre-composed map (terrain + engravings + paper + vignette) at map size. The screen only copies
// this image; recomposing the whole map every frame made rotating text, moving engravings etc. lag.
// Whoever changes terrain, objects or style marks the area with markComp(r) (or compAll = true).
const comp = document.createElement('canvas');
let compAll = true, compRect = null;
const markComp = (r) => { compRect = union(compRect, r); };

const union = (a, b) => (a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : b);

// Area an object covers, counting shadow and rotation around the anchor (o.x, o.y).
// When rotated, uses the tight box of the 4 corners: a loose circle around the anchor made
// rotating a long text redraw an area many times larger on every step of the control.
function objBounds(o) {
  const b = o.kind === 'label' ? labelBox(ctx, o) : engravingBox(o);
  const pad = 12 * (o.scale || 1);
  if (!o.rot) return { x0: b.x - pad, y0: b.y - pad, x1: b.x + b.w + pad, y1: b.y + b.h + pad };
  const a = (o.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
    const dx = px - o.x, dy = py - o.y;
    const x = o.x + dx * c - dy * s, y = o.y + dx * s + dy * c;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

// Marks the object for redraw only in its own area (call before and after changing it).
function markObject(o) {
  objectsRect = union(objectsRect, objBounds(o));
}
const requestRender = () => { needsRender = true; };

// Rough cost of recomputing an area: the distance transform uses a 2*MAXD margin.
const updateCost = (r) => (r.x1 - r.x0 + 4 * MAXD) * (r.y1 - r.y0 + 4 * MAXD);

// Merges with the previous area only if the union is not more expensive than the two apart;
// on a fast diagonal stroke the union would become a huge rectangle (and a freeze).
function markTerrain(r) {
  if (!r) return;
  const last = terrainQueue[terrainQueue.length - 1];
  if (last) {
    const u = { x0: Math.min(last.x0, r.x0), y0: Math.min(last.y0, r.y0), x1: Math.max(last.x1, r.x1), y1: Math.max(last.y1, r.y1),
      coast: last.coast !== false || r.coast !== false };
    if (updateCost(u) <= updateCost(last) + updateCost(r)) { terrainQueue[terrainQueue.length - 1] = u; return; }
  }
  terrainQueue.push(r);
}

// Planet texture: texFull = redo everything; texRects = only these areas (map px) changed.
// Also marked with the planet off, so switching only resends what changed.
let texFull = true, texRects = [];
function markTex(r) {
  const W = state.W;
  texRects.push(r);
  if (!state.globe.on) return;
  if (r.x0 < 0) texRects.push({ ...r, x0: r.x0 + W, x1: W }); // wraps around the seam
  if (r.x1 > W) texRects.push({ ...r, x0: 0, x1: r.x1 - W });
}

function frame() {
  if (grainHold) { requestAnimationFrame(frame); return; } // waiting for the paper texture (holdForGrain)
  if (styleDirty) texFull = true; // engravings and texts are not part of the texture (see drawGlobeObjects)
  // Time budget per frame: whatever is left goes to the next one, without stalling drawing.
  const t0 = performance.now();
  if (terrainQueue.length) {
    do {
      const r = terrainQueue.shift(), m = r.coast === false ? 3 : MAXD; // shade() reaches up to m cells beyond
      state.terrain.update(r);
      const px = { x0: (r.x0 - m) * CELL, y0: (r.y0 - m) * CELL, x1: (r.x1 + m) * CELL, y1: (r.y1 + m) * CELL };
      markTex(px);
      markComp(px);
    } while (terrainQueue.length && performance.now() - t0 < 8);
    needsRender = true;
  }
  if (styleDirty) {
    state.terrain.shadeAll();
    styleDirty = false;
    compAll = true;
    needsRender = true;
  }
  if (objectsDirty) {
    redrawObjects(objLayer, 1);
    objectsDirty = false;
    compAll = true;
    objectsRect = null;
    needsRender = true;
  } else if (objectsRect) {
    redrawObjects(objLayer, 1, objectsRect);
    markComp(objectsRect);
    objectsRect = null;
    needsRender = true;
  }
  if (needsRender) {
    render();
    needsRender = false;
  }
  requestAnimationFrame(frame);
}

// Paper texture: computed in the background (js/workers/tasks-worker.js) and only replaces the
// current one when complete, so the map never shows without grain. New map or one of another
// size (open, create, expand): the screen waits for it (see holdForGrain). Changing palette:
// the old texture stays until the new one is ready. grainReady resolves when the current one is ready.
let grainJob = 0, grainReady = Promise.resolve(), grainHold = null;


function makeGrain() {
  const { W, H } = state, id = ++grainJob;
  // ponytail: changing palette several times in a row queues the old jobs in the workers
  // (their replies are ignored); cancel with fresh workers if this gets heavy.
  const built = splitOnPool({ type: 'grain', W, seed: state.seed, paper: PALETTES[state.palette].paper }, H)
    // The strips are used directly when drawing (no pasting into a map-sized canvas: that copy
    // of tens of millions of pixels delayed the map showing up).
    .then((parts) => Promise.all(parts.map(async (m) => ({ bitmap: await createImageBitmap(new ImageData(m.data, m.w, m.h)), y: m.from }))))
    .catch(() => []); // no worker/OffscreenCanvas: carry on without grain instead of hanging
  grainReady = built.then((parts) => {
    if (id !== grainJob) { parts.forEach((g) => g.bitmap.close()); return; } // another texture was requested after this one
    grain.forEach((g) => g.bitmap.close());
    grain = parts;
    compAll = true;
    requestRender();
  });
  return grainReady;
}

// Holds screen drawing (the previous frame stays) until the current paper texture is ready
// and, if given, until 'also' finishes (e.g. the terrain being prepared when opening a map).
function holdForGrain(also) {
  const hold = (grainHold = Promise.all([grainReady, also]).then(() => {
    if (grainHold === hold) { grainHold = null; requestRender(); }
  }));
}

function sortedObjects() {
  const engravings = state.objects.filter((o) => o.kind === 'engraving').sort((a, b) => a.y - b.y);
  const labels = state.objects.filter((o) => o.kind === 'label');
  return { engravings, labels };
}

// Without rect redraws everything; with rect, only the objects touching that area.
function redrawObjects(target, scale, rect) {
  const c = target.getContext('2d');
  c.save();
  c.setTransform(scale, 0, 0, scale, 0, 0);
  if (rect) {
    // Edges on whole pixels: with fractions the clip and clearRect get antialiased and the
    // seam left a "cut" (half-erased line) across the redrawn engravings.
    const x0 = Math.floor(rect.x0 * scale) / scale, y0 = Math.floor(rect.y0 * scale) / scale;
    const x1 = Math.ceil(rect.x1 * scale) / scale, y1 = Math.ceil(rect.y1 * scale) / scale;
    c.beginPath();
    c.rect(x0, y0, x1 - x0, y1 - y0);
    c.clip();
    c.clearRect(x0, y0, x1 - x0, y1 - y0);
  } else {
    c.clearRect(0, 0, target.width / scale, target.height / scale);
  }
  const pal = PALETTES[state.palette];
  const { engravings, labels } = sortedObjects();
  const look = engravingLook();
  const hits = (o) => {
    if (!rect) return true;
    const b = objBounds(o);
    return b.x0 < rect.x1 && b.x1 > rect.x0 && b.y0 < rect.y1 && b.y1 > rect.y0;
  };
  for (const st of engravings) if (hits(st)) drawEngraving(c, st, look);
  for (const l of labels) if (l !== editing && hits(l)) drawLabel(c, l, pal);
  c.restore();
}

function engravingLook() {
  return { filter: PALETTES[state.palette].objectFilter, shadow: state.style.shadows, pal: PALETTES[state.palette] };
}

// Draws just one new engraving on top of the layer, without redrawing everything.
// The stacking order is fixed on the next full redraw.
function drawEngravingOnLayer(o) {
  drawEngraving(objLayer.getContext('2d'), o, engravingLook());
  markComp(objBounds(o));
  requestRender();
}

// Draws the full map in map coordinates (the transform must already be applied).
// globe = planet texture: terrain with 3D noise at the poles, no vignette and no grain
// (the planet does the grain in the shader).
function drawMap(c, objects, globe = false) {
  const { W, H, style } = state;
  const pal = PALETTES[state.palette];
  const vignette = !globe;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(globe ? state.terrain.sph.canvas : state.terrain.canvas, 0, 0, W, H);
  if (!globe) c.drawImage(objects, 0, 0, W, H);
  if (!globe && style.grain > 0) {
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = style.grain;
    for (const g of grain) c.drawImage(g.bitmap, 0, g.y);
    c.restore();
  }
  if (vignette && style.vignette > 0) {
    const [vr, vg, vb] = pal.vignette;
    const grad = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
    grad.addColorStop(0, `rgba(${vr},${vg},${vb},0)`);
    grad.addColorStop(1, `rgba(${vr},${vg},${vb},${style.vignette})`);
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
    c.restore();
  }
}

function fitRect(img, w, h) {
  const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
  return { x: (w - iw) / 2, y: (h - ih) / 2, w: iw, h: ih };
}

let mouse = null;

function render() {
  if (state.globe.on) { renderGlobe(); return; }
  const dpr = window.devicePixelRatio || 1;
  const { W, H } = state;
  const { x, y, z } = state.view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#141210';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * x, dpr * y);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  composeMap();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = renderQuality();
  ctx.drawImage(comp, 0, 0, W, H);
  if (state.ref.img && state.ref.visible) {
    const f = fitRect(state.ref.img, W, H);
    ctx.globalAlpha = state.ref.opacity;
    ctx.drawImage(state.ref.img, f.x, f.y, f.w, f.h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  drawUI();
  positionEditor();
}

// Downscaling the map to the screen with 'high' quality is expensive (was ~2/3 of each frame while dragging).
// During consecutive frames (drag, rotate, paint, pan) uses 'low'; 150 ms after
// the last one, a final 'high' frame makes the image sharp again.
let lastRenderAt = 0, hqTimer = null;
function renderQuality() {
  const now = performance.now(), busy = now - lastRenderAt < 120;
  lastRenderAt = now;
  if (!busy) return 'high';
  clearTimeout(hqTimer);
  hqTimer = setTimeout(() => { lastRenderAt = 0; requestRender(); }, 150);
  return 'low';
}

// Updates the composed map only where it changed (or all of it, if compAll).
function composeMap() {
  const { W, H } = state;
  if (comp.width !== W || comp.height !== H) { comp.width = W; comp.height = H; compAll = true; }
  if (!compAll && !compRect) return;
  const c = comp.getContext('2d');
  c.save();
  if (!compAll) {
    const x0 = Math.max(0, Math.floor(compRect.x0)), y0 = Math.max(0, Math.floor(compRect.y0));
    const x1 = Math.min(W, Math.ceil(compRect.x1)), y1 = Math.min(H, Math.ceil(compRect.y1));
    c.beginPath();
    c.rect(x0, y0, x1 - x0, y1 - y0);
    c.clip();
  }
  drawMap(c, objLayer);
  c.restore();
  compAll = false;
  compRect = null;
}


function drawUI() {
  const z = state.view.z;
  ctx.lineWidth = 1.5 / z;
  const outline = (list, color) => {
    const { x, y } = state.view, snap = (v) => Math.round(v) + 0.5; // crisp line on the pixel
    strokeSelection(ctx, list.map((o) => {
      const b = boxOf(o);
      const x0 = snap(b.x * z + x - 4), y0 = snap(b.y * z + y - 4);
      const x1 = snap((b.x + b.w) * z + x + 4), y1 = snap((b.y + b.h) * z + y + 4);
      return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    }), color);
  };
  outline(state.selection, SEL_COLOR);
  if (box) outline(box.hits, SEL_HINT);
  if (box) {
    const r = normRect(box), { x, y } = state.view, snap = (v) => Math.round(v) + 0.5;
    drawSelectBox(ctx, (c) => {
      const x0 = snap(r.x0 * z + x), y0 = snap(r.y0 * z + y);
      c.rect(x0, y0, snap(r.x1 * z + x) - x0, snap(r.y1 * z + y) - y0);
    });
  }
  if (editing?.curve) drawCurvedEditing();
  if (state.tool === 'expand') drawEdgeUI(z);
  if (!mouse) return;
  const a = state.tool === 'engraving' && assets.get(state.engraving.asset);
  if (a) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    const o = { asset: a.id, variant: nextVariant, x: mouse.x, y: mouse.y, scale: state.engraving.scale, rot: 0, flip: false };
    if (a.color === 'sample') o.ground = cellAt(mouse.x, mouse.y);
    drawEngraving(ctx, o, { ...engravingLook(), shadow: false });
    ctx.restore();
  }
  let r = 0;
  if (state.tool === 'brush' && state.brush.mode === 'brush') r = state.brush.size;
  else if (state.tool === 'engraving' && state.engraving.scatter) r = state.engraving.radius;
  if (r > 0) {
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3 / z;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.2 / z;
    ctx.stroke();
  }
}

// Handles on the edges (show that you can drag) and expansion preview.
function drawEdgeUI(z) {
  const W = state.W, H = state.H, hs = 6 / z, off = EDGE / 2 / z;
  ctx.fillStyle = '#c9a45c';
  ctx.strokeStyle = '#1b1814';
  ctx.lineWidth = 1 / z;
  for (const [x, y] of [[-off, -off], [W / 2, -off], [W + off, -off], [W + off, H / 2], [W + off, H + off], [W / 2, H + off], [-off, H + off], [-off, H / 2]]) {
    ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
    ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
  }
  if (!resize) return;
  const { t, r, b, l } = resize;
  ctx.fillStyle = 'rgba(120, 160, 190, 0.25)';
  ctx.fillRect(-l, -t, W + l + r, H + t + b);
  ctx.setLineDash([8 / z, 6 / z]);
  ctx.strokeStyle = '#c9a45c';
  ctx.lineWidth = 2 / z;
  ctx.strokeRect(-l, -t, W + l + r, H + t + b);
  ctx.setLineDash([]);
}

// ------------------------------------------------------------------ planet

// Engravings and texts on the planet are drawn upright on the screen, at the projected point,
// instead of baked into the texture (which would stretch them near the poles).
// Object as it appears on the planet: anchor projected on screen and size in screen px
// (null if on the back side). k = screen px per map px (north-south, undistorted).
function onGlobe(o, v) {
  const { W, H } = state, k = (v.R * Math.PI) / H, p = mapToScreen(o.x, o.y, v, W, H);
  if (!p) return null;
  return o.kind === 'label' ? { ...o, x: p.x, y: p.y, size: o.size * k, spacing: o.spacing * k } : { ...o, x: p.x, y: p.y, scale: o.scale * k };
}

// How the planet surface appears on screen at a map point: anchor (x, y) in screen px and
// J = [a, b, c, d] mapping 1 map px east (a, b) and south (c, d) to screen px.
// Includes the meridian tilt and the squashing near the edge; east is corrected by
// cos(latitude) so text is not squeezed near the poles (as it would be in the flat texture).
function globeFrame(o, v) {
  const { W, H } = state, e = 0.5;
  const p = mapToScreen(o.x, o.y, v, W, H), pe = mapToScreen(o.x + e, o.y, v, W, H), ps = mapToScreen(o.x, o.y + e, v, W, H);
  if (!p || !pe || !ps) return null;
  const ke = W / (2 * H * e * Math.max(Math.cos((0.5 - o.y / H) * Math.PI), 1e-3));
  return { x: p.x, y: p.y, J: [(pe.x - p.x) * ke, (pe.y - p.y) * ke, (ps.x - p.x) / e, (ps.y - p.y) / e] };
}

// Text drawn in the local frame (f): follows the planet's curvature at that point.
function drawLabelOn(c, o, f, pal) {
  c.save();
  c.translate(f.x, f.y);
  c.transform(...f.J, 0, 0);
  drawLabel(c, { ...o, x: 0, y: 0 }, pal);
  c.restore();
}

function drawGlobeObjects(v, ctx) {
  const { W, H } = state, k = (v.R * Math.PI) / H; // screen px per map px (north-south, undistorted)
  const look = engravingLook(), pal = PALETTES[state.palette];
  const place = (o) => { const p = mapToScreen(o.x, o.y, v, W, H); return p && { o, p }; };
  const { engravings, labels } = sortedObjects();
  const vis = engravings.map(place).filter(Boolean).sort((a, b) => a.p.y - b.p.y);
  for (const { o, p } of vis) drawEngraving(ctx, { ...o, x: p.x, y: p.y, scale: o.scale * k }, look);
  for (const o of labels) {
    const f = o !== editing && globeFrame(o, v);
    if (f) drawLabelOn(ctx, o, f, pal);
  }
}
// Objects go to the shader as a texture: that way they get the paper grain and lighting.
const globeObjs = document.createElement('canvas');

const globeCanvas = $('#globe');
const flat = document.createElement('canvas'); // flat map used as texture
let globe = null;

function globeView() {
  const r = canvas.getBoundingClientRect(), g = state.globe;
  return { cx: r.width / 2, cy: r.height / 2, R: Math.min(r.width, r.height) * 0.45 * g.zoom, lon0: g.lon0, lat0: g.lat0 };
}

function setGlobe(on) {
  if (on && !globe) {
    try { globe = createGlobe(globeCanvas); } catch (err) { console.error(err); }
    if (!globe) { alert(tr('alert_webgl')); return; }
  }
  // Toggling the seam only changes what is near the left and right edges:
  // recompute those strips instead of the whole map.
  state.globe.on = on;
  globeCanvas.hidden = !on;
  const t = state.terrain;
  if (on && !t.sph) { t.enableSphere(); texFull = true; } // 1st time: pole texture for the planet
  t.wrapX = on; // coast and waves now continue across the seam
  markTerrain({ x0: 0, y0: 0, x1: 1, y1: t.h });
  markTerrain({ x0: t.w - 1, y0: 0, x1: t.w, y1: t.h });
  $('#btn-planet').classList.toggle('active', on);
  if (on && editing) closeLabelEditor(true);
  resizeCanvas();
  updateZoomLabel();
}

function renderGlobe() {
  const dpr = window.devicePixelRatio || 1, { W, H } = state;
  const k = Math.min(1, globe.maxTexture / W, 4096 / W);
  const tw = Math.round(W * k), th = Math.round(H * k);
  if (texFull || globe.size !== `${tw}x${th}`) {
    flat.width = tw;
    flat.height = th;
    const c = flat.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0);
    drawMap(c, objLayer, true);
    globe.upload(flat);
    globe.size = `${tw}x${th}`;
  } else {
    // Redraws only the changed parts, each in a canvas of its size, and sends only those.
    for (const r of texRects) {
      const x0 = Math.max(0, Math.floor(r.x0 * k)), y0 = Math.max(0, Math.floor(r.y0 * k));
      const x1 = Math.min(tw, Math.ceil(r.x1 * k)), y1 = Math.min(th, Math.ceil(r.y1 * k));
      if (x1 > x0 && y1 > y0) {
        flat.width = x1 - x0;
        flat.height = y1 - y0;
        const c = flat.getContext('2d');
        c.setTransform(k, 0, 0, k, -x0, -y0);
        drawMap(c, objLayer, true);
        globe.upload(flat, x0, y0);
      }
    }
  }
  texFull = false;
  texRects = [];
  const v = globeView();
  let objs = null;
  if (state.objects.length) {
    globeObjs.width = canvas.width;
    globeObjs.height = canvas.height;
    const oc = globeObjs.getContext('2d');
    oc.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGlobeObjects(v, oc);
    objs = globeObjs;
  }
  globe.draw(v, dpr, { paper: PALETTES[state.palette].paper, grain: state.style.grain, W, seed: state.seed, objs });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Selection outline (and of what the box will select), as on the flat map
  const outline = (list, color) => strokeSelection(ctx, list.map((o) => {
    if (o.kind === 'label') {
      const f = globeFrame(o, v);
      if (!f) return null;
      const b = labelBox(ctx, { ...o, x: 0, y: 0 }), [a, bb, cc, d] = f.J, m = 4 / Math.hypot(cc, d);
      const pt = (x, y) => [f.x + a * x + cc * y, f.y + bb * x + d * y];
      return [pt(b.x - m, b.y - m), pt(b.x + b.w + m, b.y - m), pt(b.x + b.w + m, b.y + b.h + m), pt(b.x - m, b.y + b.h + m)];
    }
    const g = onGlobe(o, v);
    if (!g) return null;
    const b = boxOf(g), x0 = b.x - 4, y0 = b.y - 4, x1 = b.x + b.w + 4, y1 = b.y + b.h + 4;
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }).filter(Boolean), color);
  outline(state.selection, SEL_COLOR);
  if (box) outline(box.hits, SEL_HINT);
  if (box?.sx0 !== undefined) {
    const r = screenRect(box), snap = (n) => Math.round(n) + 0.5;
    drawSelectBox(ctx, (c) => c.rect(snap(r.x0), snap(r.y0), Math.round(r.x1 - r.x0), Math.round(r.y1 - r.y0)));
  }
  if (editing?.curve) drawCurvedEditing();
  positionEditor(); // the edit box follows the planet as it rotates
  // Brush circle projected on the sphere (the area that will actually be painted).
  let r = 0;
  if (state.tool === 'brush' && state.brush.mode === 'brush') r = state.brush.size;
  else if (state.tool === 'engraving' && state.engraving.scatter) r = state.engraving.radius;
  if (!mouse || r <= 0) return;
  ctx.beginPath();
  let pen = false;
  // Brush: circle on the sphere (same as paintSphere). Scattering engravings: circle on the flat map.
  const sphere = state.tool === 'brush';
  const lat1 = (0.5 - mouse.y / H) * Math.PI, lon1 = (mouse.x / W - 0.5) * 2 * Math.PI, ang = (r * 2 * Math.PI) / W;
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    let mx = mouse.x + Math.cos(a) * r, my = mouse.y + Math.sin(a) * r;
    if (sphere) { // point 'ang' radians from the center, in direction a
      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(a));
      const lon2 = lon1 + Math.atan2(Math.sin(a) * Math.sin(ang) * Math.cos(lat1), Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2));
      mx = (lon2 / (2 * Math.PI) + 0.5) * W;
      my = (0.5 - lat2 / Math.PI) * H;
    }
    const p = mapToScreen(mx, my, v, W, H);
    if (!p) { pen = false; continue; }
    if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    pen = true;
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  if (state.globe.on) {
    globeCanvas.width = canvas.width;
    globeCanvas.height = canvas.height;
  }
  requestRender();
}

function fitView() {
  if (state.globe.on) { state.globe.zoom = 1; updateZoomLabel(); requestRender(); return; }
  const r = canvas.getBoundingClientRect();
  const z = Math.min(r.width / state.W, r.height / state.H) * 0.94;
  state.view = { z, x: (r.width - state.W * z) / 2, y: (r.height - state.H * z) / 2 };
  updateZoomLabel();
  requestRender();
}

function updateZoomLabel() {
  $('#zoom-label').textContent = `${Math.round((state.globe.on ? state.globe.zoom : state.view.z) * 100)}%`;
}

// ------------------------------------------------------------------- history

let undoStack = [], redoStack = [];

function updateHistoryButtons() {
  $('#btn-undo').disabled = !undoStack.length;
  $('#btn-redo').disabled = !redoStack.length;
}

// Terrain same as in the last step: reuse the same copy (snapshots are never modified).
// Copying 11 MB every step, even just moving a text, filled memory on large maps.
let lastSnapGrid = null;
function snapshot() {
  if (!lastSnapGrid || !sameGrid(lastSnapGrid, state.terrain.grid)) lastSnapGrid = state.terrain.grid.slice();
  return { W: state.W, H: state.H, grid: lastSnapGrid, objects: JSON.stringify(state.objects) };
}

function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function restore(s) {
  if (s.W !== state.W || s.H !== state.H) { // undo/redo an expansion
    state.W = s.W;
    state.H = s.H;
    createTerrain();
    texFull = true;
    state.terrain.grid.set(s.grid);
    state.terrain.updateAll();
  } else {
    // Only recompute the area that changed (recomputing the whole map made Ctrl+Z hang).
    markTerrain(gridDiff(state.terrain.grid, s.grid, state.terrain.w));
    state.terrain.grid.set(s.grid);
  }
  if (s.objects !== JSON.stringify(state.objects)) {
    state.objects = JSON.parse(s.objects);
    objectsDirty = true;
  }
  updateHistoryButtons();
  select(null);
  scheduleAutosave();
}

// Box of the cells that differ between two grids; coast=false if none switched land <-> water.
function gridDiff(a, b, w) {
  let x0 = w, y0 = Infinity, x1 = -1, y1 = -1, coast = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    y1 = y;
    if ((a[i] === 0) !== (b[i] === 0)) coast = true;
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1, coast };
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
}

// --------------------------------------------------------------------- tools

let dragging = false, last = null, moved = false, dragStart = null, dragOrigins = null, box = null, boxBase = null, scatterAcc = 0, pan = null, spaceDown = false;

function toMap(e) {
  if (state.globe.on) return screenToMap(e.offsetX, e.offsetY, globeView(), state.W, state.H);
  return { x: (e.offsetX - state.view.x) / state.view.z, y: (e.offsetY - state.view.y) / state.view.z };
}

function cellAt(x, y) {
  return state.terrain.typeAt(Math.floor(x / CELL), Math.floor(y / CELL));
}

// Points (map px) every 'step' px along the sphere arc from a to b, not including a.
// Measured in equator px; empty if the distance is less than 'step'.
function greatCircle(a, b, step) {
  const { W, H } = state;
  const vec = (p) => {
    const lon = (p.x / W - 0.5) * 2 * Math.PI, lat = (0.5 - p.y / H) * Math.PI;
    return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
  };
  const va = vec(a), vb = vec(b);
  const ang = Math.acos(Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const n = Math.floor((ang * W) / (2 * Math.PI) / step);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, sa = Math.sin((1 - t) * ang) / Math.sin(ang), sb = Math.sin(t * ang) / Math.sin(ang);
    const x = sa * va[0] + sb * vb[0], y = sa * va[1] + sb * vb[1], z = sa * va[2] + sb * vb[2];
    out.push({ x: (Math.atan2(x, z) / (2 * Math.PI) + 0.5) * W, y: (0.5 - Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI) * H });
  }
  return out;
}

function paintAt(p) {
  const b = state.brush, t = state.terrain;
  const args = [p.x / CELL, p.y / CELL, b.size / CELL, b.type, b.rough, b.onlyLand && b.type !== 0, b.roughSize];
  // On the planet the brush is round on the sphere (and crosses the seam by itself).
  markTerrain(t.wrapX ? t.paintSphere(...args) : t.paint(...args));
}

let nextVariant = 0;
// state.engraving.variant: -1 = random pick for each engraving; otherwise always uses that variant.
function randomVariant() {
  const a = assets.get(state.engraving.asset);
  if (!a) return 0;
  if (state.engraving.variant >= 0 && state.engraving.variant < a.imgs.length) return state.engraving.variant;
  return Math.floor(Math.random() * a.imgs.length);
}

// Engraving thumbnail; "colors" ones show already colored (the original image is red/green/blue).
function thumb(a, v = 0) {
  const img = a.imgs[v];
  if (!a.colors) {
    const el = document.createElement('img');
    el.src = img.src;
    el.loading = 'lazy';
    el.alt = localName(a);
    return el;
  }
  const c = document.createElement('canvas');
  const paint = () => {
    const k = 64 / Math.max(img.naturalWidth, img.naturalHeight);
    const src = colored(img, img.naturalWidth * k, img.naturalHeight * k, a, null);
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
  };
  if (img.complete && img.naturalWidth) paint(); else img.addEventListener('load', paint, { once: true });
  return c;
}

function buildVariants() {
  const a = assets.get(state.engraving.asset), box = $('#variants');
  box.hidden = !a || a.imgs.length < 2;
  if (box.hidden) return;
  const grid = box.querySelector('.grid'), det = box.querySelector('details');
  det.open = !collapsedCats.has(VARIANTS_FOLD); // collapsed like the library categories (same memory)
  det.querySelector('small').textContent = a.imgs.length;
  grid.innerHTML = '';
  const add = (v, content, title) => {
    const b = document.createElement('button');
    b.title = title;
    b.classList.toggle('active', state.engraving.variant === v);
    b.append(content);
    b.addEventListener('click', () => {
      state.engraving.variant = v;
      nextVariant = randomVariant();
      grid.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      requestRender();
    });
    grid.appendChild(b);
  };
  const dice = document.createElement('span');
  dice.className = 'dice';
  dice.textContent = '🎲';
  add(-1, dice, tr('variant_random'));
  a.imgs.forEach((_, v) => add(v, thumb(a, v), tr('variant_n', { n: v + 1 })));
}

function placeEngraving(x, y, scattering) {
  const s = state.engraving;
  if (state.globe.on) x = ((x % state.W) + state.W) % state.W; // scatter across the seam
  if (x < 0 || y < 0 || x >= state.W || y >= state.H) return;
  if (scattering && s.onlyLand && cellAt(x, y) === 0) return;
  const scale = s.scale * (1 + (Math.random() * 2 - 1) * s.vary);
  const a = assets.get(s.asset);
  const o = {
    kind: 'engraving', asset: s.asset, x: Math.round(x), y: Math.round(y),
    scale: +scale.toFixed(3), rot: 0, flip: s.randomFlip && Math.random() < 0.5,
  };
  if (a.imgs.length > 1) { o.variant = nextVariant; nextVariant = randomVariant(); } // the preview shows the next one
  if (a.color === 'sample') o.ground = cellAt(x, y); // terrain type underneath: gives the engraving its color
  state.objects.push(o);
  drawEngravingOnLayer(o);
  strokeRect = union(strokeRect, objBounds(o));
}

function scatterAt(p) {
  const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * state.engraving.radius;
  placeEngraving(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, true);
}

function hitTest(p) {
  const pad = 4 / state.view.z;
  const inside = (b) => p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
  const { engravings, labels } = sortedObjects();
  for (let i = labels.length - 1; i >= 0; i--) if (inside(labelBox(ctx, labels[i]))) return labels[i];
  for (let i = engravings.length - 1; i >= 0; i--) if (inside(engravingBox(engravings[i]))) return engravings[i];
  return null;
}

function fillAt(p) {
  const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
  const t = state.terrain;
  if (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h || t.typeAt(cx, cy) === state.brush.type) return;
  pushHistory();
  markTerrain(t.fill(cx, cy, state.brush.type));
  scheduleAutosave();
}

const tools = {
  brush: {
    down(p) {
      if (state.brush.mode === 'bucket') { fillAt(p); return; }
      pushHistory(); dragging = true; last = p; paintAt(p);
    },
    move(p) {
      const step = Math.max(2, state.brush.size * 0.25);
      if (state.globe.on) { // on the planet the stroke follows the sphere, not the flat map (which stretches at the poles)
        const pts = greatCircle(last, p, step);
        if (!pts.length) return;
        pts.forEach(paintAt);
        last = p;
        return;
      }
      const dx = p.x - last.x, dy = p.y - last.y;
      const n = Math.floor(Math.hypot(dx, dy) / step);
      if (n < 1) return;
      for (let i = 1; i <= n; i++) paintAt({ x: last.x + (dx * i) / n, y: last.y + (dy * i) / n });
      last = p;
    },
    up() { scheduleAutosave(); },
  },
  engraving: {
    down(p) {
      if (!assets.get(state.engraving.asset)) { status(tr('msg_pick_engraving')); return; }
      pushHistory();
      dragging = true;
      last = p;
      scatterAcc = 0;
      if (state.engraving.scatter) scatterAt(p); else placeEngraving(p.x, p.y, false);
    },
    // Dragging places several engravings along the path (scattered within the radius, if enabled).
    move(p) {
      const a = assets.get(state.engraving.asset);
      const spacing = Math.max(4, (a.width * state.engraving.scale * 0.8) / state.engraving.density);
      const dx = p.x - last.x, dy = p.y - last.y, d = Math.hypot(dx, dy);
      let s = 0;
      while (scatterAcc + d - s >= spacing) {
        s += spacing - scatterAcc;
        scatterAcc = 0;
        const q = { x: last.x + (dx * s) / d, y: last.y + (dy * s) / d };
        if (state.engraving.scatter) scatterAt(q); else placeEngraving(q.x, q.y, false);
      }
      scatterAcc += d - s;
      last = p;
    },
    up() { if (strokeRect) objectsRect = union(objectsRect, strokeRect); strokeRect = null; scheduleAutosave(); },
  },
  text: {
    down(p) {
      const hit = hitTest(p);
      if (hit?.kind === 'label') { openLabelEditor(hit); return; }
      const L = state.label;
      if (!L.text.trim()) { status(tr('msg_type_text')); return; }
      pushHistory();
      const o = { kind: 'label', text: L.text, font: L.font, size: L.size, color: L.color, spacing: L.spacing, curve: L.curve, rot: 0, x: Math.round(p.x), y: Math.round(p.y) };
      state.objects.push(o);
      markObject(o);
      setTool('select');
      select(o);
      scheduleAutosave();
    },
  },
  select: {
    down(p, e) {
      const hit = hitTest(p);
      const sel = state.selection;
      if (!hit) {
        // Click on empty space: starts the selection box (with Shift, adds to the current selection).
        boxBase = e.shiftKey ? sel : [];
        if (!e.shiftKey) setSelection([]);
        box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, hits: [] };
        // On the planet the box is a screen rectangle (straight), not a map one (which curves on the sphere).
        if (state.globe.on) Object.assign(box, { sx0: e.offsetX, sy0: e.offsetY, sx1: e.offsetX, sy1: e.offsetY });
        dragging = true;
        return;
      }
      if (e.shiftKey) {
        setSelection(sel.includes(hit) ? sel.filter((o) => o !== hit) : [...sel, hit]);
        return;
      }
      if (!sel.includes(hit)) setSelection([hit]);
      dragging = true;
      moved = false;
      dragStart = p;
      dragOrigins = state.selection.map((o) => ({ o, x: o.x, y: o.y }));
    },
    move(p, e) {
      if (box) {
        box.x1 = p.x;
        box.y1 = p.y;
        if (box.sx0 !== undefined) {
          box.sx1 = e.offsetX;
          box.sy1 = e.offsetY;
        }
        const hits = box.sx0 !== undefined ? objectsInScreenBox(screenRect(box)) : objectsInBox(normRect(box));
        box.hits = hits.filter((o) => !boxBase.includes(o));
        return;
      }
      if (!moved) { pushHistory(); moved = true; }
      for (const { o, x, y } of dragOrigins) {
        markObject(o);
        o.x = Math.round(x + p.x - dragStart.x);
        o.y = Math.round(y + p.y - dragStart.y);
        markObject(o);
      }
    },
    up() {
      if (box) {
        setSelection([...boxBase, ...box.hits]);
        box = null;
        requestRender();
        return;
      }
      if (moved) scheduleAutosave();
    },
  },
  expand: {}, // only the handles on the edges (see edgeAt)
};

function setTool(name) {
  state.tool = name;
  document.querySelectorAll('#tools button').forEach((b) => b.classList.toggle('active', b.dataset.tool === name));
  document.querySelectorAll('[data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(name); });
  // With the brush the circle already shows the area; the cursor hides so it doesn't clutter the center.
  canvas.style.cursor = toolCursor();
  requestRender();
}

function toolCursor() {
  if (state.tool === 'brush' && state.brush.mode === 'brush') return 'none';
  return { select: 'default', text: 'text', expand: 'default' }[state.tool] || 'crosshair';
}

// --------------------------------------------- expand by dragging the edge (like in Paint)

const EDGE = 10; // screen px, just outside the map edge
let resize = null;

function edgeAt(e) {
  if (state.tool !== 'expand' || state.globe.on) return null;
  const v = state.view, L = v.x, T = v.y, R = L + state.W * v.z, B = T + state.H * v.z;
  const x = e.offsetX, y = e.offsetY;
  const inX = x >= L - EDGE && x <= R + EDGE, inY = y >= T - EDGE && y <= B + EDGE;
  const ed = {
    l: inY && x >= L - EDGE && x < L, r: inY && x > R && x <= R + EDGE,
    t: inX && y >= T - EDGE && y < T, b: inX && y > B && y <= B + EDGE,
  };
  return ed.l || ed.r || ed.t || ed.b ? ed : null;
}

function edgeCursor(ed) {
  const h = ed.l || ed.r, v = ed.t || ed.b;
  if (h && v) return (ed.l && ed.t) || (ed.r && ed.b) ? 'nwse-resize' : 'nesw-resize';
  return h ? 'ew-resize' : 'ns-resize';
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (e.button === 1 || e.button === 2 || spaceDown) {
    pan = { sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y, lon: state.globe.lon0, lat: state.globe.lat0 };
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (e.button !== 0) return;
  const ed = edgeAt(e);
  if (ed) {
    resize = { ed, sx: e.offsetX, sy: e.offsetY, t: 0, r: 0, b: 0, l: 0 };
    return;
  }
  const p = toMap(e);
  if (p) tools[state.tool].down?.(p, e); // null = off the planet
});

canvas.addEventListener('pointermove', (e) => {
  mouse = toMap(e);
  if (pan && state.globe.on) { // dragging rotates the planet
    const R = globeView().R;
    state.globe.lon0 = pan.lon - (e.clientX - pan.sx) / R;
    state.globe.lat0 = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pan.lat + (e.clientY - pan.sy) / R));
  } else if (pan) {
    state.view.x = pan.vx + e.clientX - pan.sx;
    state.view.y = pan.vy + e.clientY - pan.sy;
  } else if (resize) {
    const z = state.view.z, snap = (v) => Math.max(0, Math.round(v / z / CELL) * CELL);
    const dx = e.offsetX - resize.sx, dy = e.offsetY - resize.sy, ed = resize.ed;
    resize.r = ed.r ? snap(dx) : 0;
    resize.l = ed.l ? snap(-dx) : 0;
    resize.b = ed.b ? snap(dy) : 0;
    resize.t = ed.t ? snap(-dy) : 0;
    const w = Math.min(MAX_SIZE, state.W + resize.l + resize.r), h = Math.min(MAX_SIZE, state.H + resize.t + resize.b);
    status(tr('msg_expand_to', { w, h }));
    requestRender();
    return;
  } else if (dragging && mouse) {
    // On the planet, crossing the seam (180°) jumps from one side of the map to the other: restart the stroke.
    if (state.globe.on && state.tool !== 'brush' && last && Math.abs(mouse.x - last.x) > state.W / 2) last = mouse;
    tools[state.tool].move?.(mouse, e);
  } else if (!pan) {
    const ed = edgeAt(e);
    canvas.style.cursor = ed ? edgeCursor(ed) : toolCursor();
  }
  if (!mouse) { requestRender(); return; }
  const t = TERRAIN_TYPES[cellAt(mouse.x, mouse.y)];
  status(`x ${Math.round(mouse.x)}  y ${Math.round(mouse.y)}  ·  ${t ? localName(t) : ''}`);
  requestRender();
});

function endPointer() {
  if (pan) { pan = null; setTool(state.tool); return; }
  if (resize) {
    const { t, r, b, l } = resize;
    resize = null;
    // Clamp to the maximum by trimming the dragged side.
    const cap = (a, c, size) => { const over = Math.max(0, size + a + c - MAX_SIZE); return a >= c ? [a - over, c] : [a, c - over]; };
    const [l2, r2] = cap(l, r, state.W), [t2, b2] = cap(t, b, state.H);
    expandMap(t2, r2, b2, l2, 0);
    requestRender();
    return;
  }
  if (dragging) { dragging = false; tools[state.tool].up?.(); }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { mouse = null; requestRender(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('dblclick', (e) => {
  if (state.tool !== 'select' && state.tool !== 'text') return;
  const hit = hitTest(toMap(e));
  if (hit?.kind === 'label') openLabelEditor(hit);
});

// ------------------------------------------------------- text editing on the map

const editor = document.createElement('textarea');
editor.className = 'label-editor';
editor.hidden = true;
editor.spellcheck = false;
$('#stage').appendChild(editor);
let editing = null; // text being edited directly on the map (hidden on the canvas meanwhile)

function openLabelEditor(o) {
  if (editing) closeLabelEditor(true);
  select(o);
  editing = o;
  markObject(o);
  editor.value = o.text;
  editor.hidden = false;
  positionEditor();
  editor.focus();
  editor.select();
}

// Enter confirms (Shift+Enter breaks line), Esc cancels, clicking outside confirms.
function closeLabelEditor(commit) {
  const o = editing;
  if (!o) return;
  editing = null;
  editor.hidden = true;
  const text = editor.value;
  if (commit && text !== o.text) {
    pushHistory();
    if (text.trim()) {
      o.text = text;
    } else {
      state.objects = state.objects.filter((x) => x !== o);
      setSelection([]);
    }
    scheduleAutosave();
  }
  markObject(o);
  syncControls();
}

// Curved text being edited: the (straight) textarea gets the typing but stays invisible; here we draw
// the text on the curve, with the selection and caret in the right places.
// Text being edited as it appears on screen: anchor (x, y) in screen px and J (map px -> screen px).
// On the flat map J is just the zoom; on the planet it is the local surface frame (globeFrame).
// o stays in map px (original size). null if the text is behind the planet.
function editView() {
  const o = { ...editing, text: editor.value };
  if (!state.globe.on) {
    const { x, y, z } = state.view;
    return { o, x: o.x * z + x, y: o.y * z + y, J: [z, 0, 0, z] };
  }
  const f = globeFrame(editing, globeView());
  return f && { o, ...f };
}

function drawCurvedEditing() {
  const ev = editView();
  if (!ev) return;
  const { o, J } = ev, dpr = window.devicePixelRatio || 1;
  const s0 = editor.selectionStart, s1 = editor.selectionEnd;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(ev.x, ev.y);
  ctx.transform(...J, 0, 0);
  const lineW = 2 / Math.hypot(J[2], J[3]); // caret ~2 screen px wide
  ctx.save();
  ctx.rotate((o.rot * Math.PI) / 180);
  let idx = 0; // position in the whole text (each '\n' counts too)
  for (const { line, edges, at } of labelLayout(ctx, o)) {
    for (let i = 0; i <= line.length; i++, idx++) {
      const sel = i < line.length && idx >= s0 && idx < s1, caret = s0 === s1 && idx === s0;
      if (!sel && !caret) continue;
      const p = at(sel ? (edges[i] + edges[i + 1]) / 2 : edges[i]);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ang);
      if (sel) {
        ctx.fillStyle = 'rgba(201, 164, 92, 0.45)';
        ctx.fillRect(-(edges[i + 1] - edges[i]) / 2, -o.size * 0.55, edges[i + 1] - edges[i], o.size * 1.1);
      } else {
        ctx.fillStyle = o.color;
        ctx.fillRect(-lineW / 2, -o.size * 0.55, lineW, o.size * 1.1);
      }
      ctx.restore();
    }
  }
  ctx.restore();
  drawLabel(ctx, { ...o, x: 0, y: 0 }, PALETTES[state.palette]);
  ctx.restore();
}

// Click on a curved text being edited: caret at the nearest letter edge, measured along the curve.
function curvedCaretAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect(), ev = editView();
  if (!ev) return editor.selectionStart;
  const o = ev.o, [ja, jb, jc, jd] = ev.J, det = ja * jd - jb * jc;
  // screen -> map px around the anchor (inverse of J), then undo the text rotation
  const sx = clientX - r.left - ev.x, sy = clientY - r.top - ev.y;
  const dx = (jd * sx - jc * sy) / det, dy = (-jb * sx + ja * sy) / det, a = (-o.rot * Math.PI) / 180;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  let best = 0, bestD = Infinity, idx = 0;
  for (const { line, edges, at } of labelLayout(ctx, o)) {
    for (let i = 0; i <= line.length; i++, idx++) {
      const q = at(edges[i]), d = Math.hypot(q.x - lx, q.y - ly);
      if (d < bestD) { bestD = d; best = idx; }
    }
  }
  return best;
}

function positionEditor() {
  if (!editing) return;
  editor.classList.toggle('curved', !!editing.curve);
  const ev = editView();
  editor.style.visibility = ev ? '' : 'hidden'; // planet rotated and the text went to the back side
  if (!ev) return;
  // The box is sized to the text in map px, centered on the anchor, and matrix J takes it
  // to the screen (zoom on the flat map; surface tilt and squashing on the planet).
  const { o, x, y, J } = ev;
  const b = labelBox(ctx, { ...o, x: 0, y: 0, text: editor.value || ' ' });
  const k = Math.hypot(J[2], J[3]) || 1, pad = 6 / k, extra = o.size * 0.6;
  Object.assign(editor.style, {
    left: `${x + b.x - pad - extra / 2}px`,
    top: `${y + b.y - pad}px`,
    width: `${b.w + 2 * pad + extra}px`,
    height: `${b.h + 2 * pad}px`,
    padding: `${pad}px`,
    borderWidth: `${1 / k}px`,
    font: `${o.size}px "${o.font}", serif`,
    letterSpacing: `${o.spacing}px`,
    color: o.color,
    transform: `matrix(${J.join(',')},0,0) rotate(${o.rot}deg)`,
  });
}

editor.addEventListener('input', () => { positionEditor(); requestRender(); });
document.addEventListener('selectionchange', () => { if (editing?.curve) requestRender(); });
editor.addEventListener('mousedown', (e) => {
  if (!editing?.curve || e.button !== 0) return;
  e.preventDefault(); // the textarea would place the caret by the (invisible) straight text
  const i = curvedCaretAt(e.clientX, e.clientY);
  editor.setSelectionRange(i, i);
  requestRender();
});
editor.addEventListener('blur', () => closeLabelEditor(true));
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeLabelEditor(false); }
  else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeLabelEditor(true); }
});

// Planet zoom aimed at the mouse: picks the screen center (lon0, lat0) that brings point p (which
// was under the mouse before the zoom) back under the mouse. Exact solution: the planet rotates
// first around the vertical axis (lon0) and then the horizontal one (lat0), and each rotation preserves a
// length, which gives at most two solutions; keeps the one closest to the current view. No solution
// (e.g. zooming out with the mouse near the edge: p would have to leave the sphere), the zoom stays centered.
function zoomGlobeAt(e, p) {
  const g = state.globe, v = globeView(), { W, H } = state, PI = Math.PI;
  const qx = (e.offsetX - v.cx) / v.R, qy = -(e.offsetY - v.cy) / v.R, w2 = 1 - qx * qx - qy * qy;
  if (w2 < 0) return;
  const w = Math.sqrt(w2), lon = (p.x / W - 0.5) * 2 * PI, lat = (0.5 - p.y / H) * PI;
  const X = Math.cos(lat) * Math.sin(lon), Y = Math.sin(lat), Z = Math.cos(lat) * Math.cos(lon);
  const h2 = X * X + Z * Z - qx * qx;
  if (h2 < 0) return;
  const wrap = (a) => a - Math.round(a / (2 * PI)) * 2 * PI;
  let best = null;
  for (const z1 of [Math.sqrt(h2), -Math.sqrt(h2)]) {
    const lon0 = wrap(Math.atan2(z1, qx) - Math.atan2(Z, X)), lat0 = wrap(Math.atan2(w, qy) - Math.atan2(z1, Y));
    if (Math.abs(lat0) > PI / 2) continue; // the planet doesn't flip upside down
    const cost = Math.abs(wrap(lon0 - g.lon0)) + Math.abs(lat0 - g.lat0);
    if (!best || cost < best.cost) best = { lon0, lat0, cost };
  }
  // Too big a rotation in one wheel step (mouse right at the edge or near the pole) is disorienting:
  // for that step the zoom stays centered.
  if (!best || best.cost > 1) return;
  g.lon0 += wrap(best.lon0 - g.lon0); // no 2π jumps in the stored value
  g.lat0 = best.lat0;
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey && resizeTool(e.deltaY < 0 ? 1.1 : 1 / 1.1)) return;
  if (state.globe.on) {
    // With Shift, Chrome/Brave/Edge deliver the wheel as horizontal scroll (deltaX).
    const dy = e.deltaY || (e.shiftKey ? e.deltaX : 0);
    const g = state.globe, before = toMap(e); // map point under the mouse (null: off the planet)
    g.zoom = Math.min(20, Math.max(0.3, g.zoom * Math.exp(-dy * 0.0015)));
    // Centered zoom; with Shift, zooming in rotates the planet toward the point under the mouse. Zooming out is
    // always centered (otherwise, zooming out with the mouse in the same place undid the rotation).
    if (e.shiftKey && before && dy < 0) zoomGlobeAt(e, before);
    updateZoomLabel();
    requestRender();
    return;
  }
  const v = state.view;
  const z = Math.min(8, Math.max(0.05, v.z * Math.exp(-e.deltaY * 0.0015)));
  v.x = e.offsetX - (e.offsetX - v.x) * (z / v.z);
  v.y = e.offsetY - (e.offsetY - v.y) * (z / v.z);
  v.z = z;
  updateZoomLabel();
  requestRender();
}, { passive: false });

function deleteSelected() {
  const sel = new Set(state.selection);
  if (!sel.size) return;
  pushHistory();
  sel.forEach(markObject);
  state.objects = state.objects.filter((o) => !sel.has(o));
  setSelection([]);
  scheduleAutosave();
}

// Creates offset copies and selects only the copies. Returns the copies.
function pasteObjects(list) {
  if (!list.length) return list;
  pushHistory();
  const copies = list.map((o) => ({ ...o, x: o.x + PASTE_OFFSET, y: o.y + PASTE_OFFSET }));
  state.objects.push(...copies);
  copies.forEach(markObject);
  setSelection(copies);
  scheduleAutosave();
  return copies;
}

const PASTE_OFFSET = 30;
let clipboard = [];

function duplicateSelected() {
  pasteObjects(state.selection);
}

function copySelected() {
  if (!state.selection.length) return;
  clipboard = state.selection.map((o) => ({ ...o }));
  status(tr('msg_copied', { n: clipboard.length }));
}

// Each paste is offset from the previous one, so pasting several times doesn't stack.
function pasteClipboard() {
  clipboard = pasteObjects(clipboard).map((o) => ({ ...o }));
}

// Ctrl+wheel: brush size, or engraving size (radius, if scattering).
function resizeTool(f) {
  const s = state.engraving;
  if (state.tool === 'brush') state.brush.size = Math.min(300, Math.max(4, Math.round(state.brush.size * f)));
  else if (state.tool === 'engraving' && s.scatter) s.radius = Math.min(300, Math.max(0, Math.round(Math.max(5, s.radius) * f / 5) * 5));
  else if (state.tool === 'engraving') s.scale = Math.min(4, Math.max(0.2, +(s.scale * f).toFixed(2)));
  else return false;
  syncControls();
  requestRender();
  return true;
}

const KEY_TOOLS = { b: 'brush', s: 'engraving', t: 'text', v: 'select', e: 'expand' };

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 's') { e.preventDefault(); if (!$('#dlg-save').open) $('#dlg-save').showModal(); return; }
  if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); return; }
  if (mod && k === 'c') { e.preventDefault(); copySelected(); return; }
  if (mod && k === 'v') { e.preventDefault(); pasteClipboard(); return; }
  if (mod) return;
  if (e.key === ' ') { e.preventDefault(); if (!spaceDown) { spaceDown = true; canvas.style.cursor = 'grab'; } return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return; }
  if (KEY_TOOLS[k]) setTool(KEY_TOOLS[k]);
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') { spaceDown = false; setTool(state.tool); }
});

// ------------------------------------------------------------------ controls

const syncers = [];

// Binds a control to a property. get/set read and write the state.
function bind(id, get, set, fmt = (v) => v) {
  const el = $(id);
  const out = el.closest('label')?.querySelector('output');
  const num = out && el.type === 'range' ? numberField(el, out, get, set, fmt) : null;
  const show = (v) => { if (num) num.value = fmt(v); else if (out) out.textContent = fmt(v); };
  const isCheck = el.type === 'checkbox';
  const sync = () => {
    const v = get();
    if (v === undefined) return;
    if (isCheck) el.checked = v; else el.value = v;
    show(v);
  };
  el.addEventListener('input', () => {
    const v = isCheck ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
    set(v);
    show(v);
  });
  syncers.push(sync);
  return el;
}

// Replaces the number next to the slider with an editable field: you can type the exact value
// (e.g. rotation 0). Accepts the displayed format ("150%", "0°", "48px", "2×"); fmt(1) gives the scale
// ("100%" -> the stored value is the typed one / 100). Stays between the slider min and max.
function numberField(el, out, get, set, fmt) {
  const num = document.createElement('input');
  num.type = 'text';
  num.className = 'num';
  num.inputMode = 'decimal';
  num.spellcheck = false;
  num.setAttribute('aria-label', el.closest('label').querySelector('span')?.textContent || '');
  el.closest('label').htmlFor = el.id; // the label still points to the slider
  out.replaceWith(num);
  const k = parseFloat(fmt(1)) || 1;
  const restore = () => { const v = get(); if (v !== undefined) num.value = fmt(v); };
  num.addEventListener('focus', () => num.select());
  num.addEventListener('change', () => {
    const typed = parseFloat(num.value.replace(',', '.').replace(/[^0-9.+-]/g, ''));
    if (!Number.isFinite(typed)) { restore(); return; }
    const v = Math.min(+el.max, Math.max(+el.min, typed / k));
    set(v);
    el.value = v;
    num.value = fmt(v);
    el.dispatchEvent(new Event('change')); // closes the undo step and saves, as when releasing the slider
  });
  num.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') num.blur();
    else if (e.key === 'Escape') { restore(); num.blur(); }
  });
  return num;
}

function syncControls() {
  syncers.forEach((s) => s());
  $('#scatter-opts').hidden = !state.engraving.scatter;
  $('#brush-opts').hidden = state.brush.mode === 'bucket';
  $('#fill-hint').hidden = state.brush.mode !== 'bucket';
}

const pct = (v) => `${Math.round(v * 100)}%`;
const px = (v) => `${v}px`;
const deg = (v) => `${v}°`;

function setupControls() {
  // Tools and panel
  document.querySelectorAll('#tools button').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#lib-search').addEventListener('input', filterLibrary);
  $('#variants details').addEventListener('toggle', (e) => {
    if (e.target.open) collapsedCats.delete(VARIANTS_FOLD); else collapsedCats.add(VARIANTS_FOLD);
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedCats])); } catch { /* no localStorage */ }
  });
  $('#user-assets-add').addEventListener('click', () => $('#user-assets-file').click());
  $('#user-assets-file').addEventListener('change', async (e) => {
    await addUserAssets([...e.target.files]);
    e.target.value = '';
  });

  bind('#brush-mode', () => state.brush.mode, (v) => { state.brush.mode = v; syncControls(); setTool(state.tool); });
  bind('#brush-size', () => state.brush.size, (v) => { state.brush.size = v; }, px);
  bind('#brush-rough', () => state.brush.rough, (v) => { state.brush.rough = v; }, pct);
  bind('#brush-rough-size', () => state.brush.roughSize, (v) => { state.brush.roughSize = v; }, (v) => `${v}×`);
  bind('#brush-only-land', () => state.brush.onlyLand, (v) => { state.brush.onlyLand = v; });

  bind('#engraving-scale', () => state.engraving.scale, (v) => { state.engraving.scale = v; }, pct);
  bind('#engraving-vary', () => state.engraving.vary, (v) => { state.engraving.vary = v; }, pct);
  bind('#engraving-flip', () => state.engraving.randomFlip, (v) => { state.engraving.randomFlip = v; });
  bind('#engraving-scatter', () => state.engraving.scatter, (v) => { state.engraving.scatter = v; $('#scatter-opts').hidden = !v; });
  bind('#engraving-radius', () => state.engraving.radius, (v) => { state.engraving.radius = v; }, px);
  bind('#engraving-density', () => state.engraving.density, (v) => { state.engraving.density = v; }, (v) => `${v}×`);
  bind('#engraving-only-land', () => state.engraving.onlyLand, (v) => { state.engraving.onlyLand = v; });

  document.querySelectorAll('.font-select').forEach((sel) => {
    sel.innerHTML = FONTS.map((f) => `<option value="${f}" style="font-family:'${f}'">${f}</option>`).join('');
  });
  bind('#label-text', () => state.label.text, (v) => { state.label.text = v; });
  bind('#label-font', () => state.label.font, (v) => { state.label.font = v; });
  bind('#label-size', () => state.label.size, (v) => { state.label.size = v; }, px);
  bind('#label-spacing', () => state.label.spacing, (v) => { state.label.spacing = v; }, px);
  bind('#label-curve', () => state.label.curve, (v) => { state.label.curve = v; }, pct);
  bind('#label-color', () => state.label.color, (v) => { state.label.color = v; });

  // Selected object properties
  // Works for one object or several at once (see sharedSize).
  const selProp = (id, key, fmt, def) => { // def: value for old objects that lack the field
    const targets = () => (state.selected ? [state.selected] : sharedSize() ? state.selection : []);
    const el = bind(id, () => {
      const t = targets();
      return t.length ? t[0][key] ?? def : undefined;
    }, (v) => {
      const t = targets();
      if (!t.length) return;
      beginEdit();
      for (const o of t) {
        markObject(o);
        o[key] = v;
        markObject(o);
      }
    }, fmt);
    el.addEventListener('change', () => { editSession = null; scheduleAutosave(); });
  };
  selProp('#sel-scale', 'scale', pct);
  selProp('#sel-rot', 'rot', deg);
  selProp('#sel-flip', 'flip');
  selProp('#sel-text', 'text');
  selProp('#sel-font', 'font');
  selProp('#sel-size', 'size', px);
  selProp('#sel-spacing', 'spacing', px);
  selProp('#sel-label-rot', 'rot', deg);
  selProp('#sel-curve', 'curve', pct, 0);
  selProp('#sel-color', 'color');
  // Text erased from the panel: remove the object when editing ends (same as editing on the map).
  // Keep the object on 'input' because clicking the map can change the selection before 'change'.
  let panelLabel = null;
  $('#sel-text').addEventListener('input', () => { panelLabel = state.selected; });
  $('#sel-text').addEventListener('change', () => {
    const o = panelLabel;
    panelLabel = null;
    if (!o || o.text.trim() || !state.objects.includes(o)) return;
    markObject(o);
    state.objects = state.objects.filter((x) => x !== o);
    setSelection(state.selection.filter((x) => x !== o));
    scheduleAutosave();
  });
  $('#sel-delete').addEventListener('click', deleteSelected);
  $('#sel-duplicate').addEventListener('click', duplicateSelected);

  // Style
  fillPalettes();
  bind('#style-palette', () => state.palette, (v) => setPalette(v));
  const styleProp = (id, key, fmt, reshade = true) => bind(id, () => state.style[key], (v) => {
    state.style[key] = v;
    if (reshade) styleDirty = true;
    texFull = true;
    compAll = true; // paper and vignette change the whole map
    requestRender();
    scheduleAutosave();
  }, fmt);
  styleProp('#style-waves', 'waves');
  styleProp('#style-wave-spacing', 'waveSpacing');
  styleProp('#style-wave-strength', 'waveStrength', pct);
  styleProp('#style-depth', 'depth');
  styleProp('#style-outline', 'outline');
  styleProp('#style-grain', 'grain', pct, false);
  styleProp('#style-vignette', 'vignette', pct, false);
  bind('#style-shadows', () => state.style.shadows, (v) => { state.style.shadows = v; objectsDirty = true; scheduleAutosave(); });

  // Reference
  $('#ref-load').addEventListener('click', () => $('#ref-file').click());
  $('#ref-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      state.ref.img = img;
      state.ref.visible = true;
      $('#ref-opts').hidden = false;
      syncControls();
      requestRender();
      const ia = img.naturalWidth / img.naturalHeight, ma = state.W / state.H;
      if (Math.abs(ia - ma) > 0.02) status(tr('msg_ratio_tip'));
    };
    img.src = URL.createObjectURL(f);
    e.target.value = '';
  });
  bind('#ref-visible', () => state.ref.visible, (v) => { state.ref.visible = v; requestRender(); });
  bind('#ref-opacity', () => state.ref.opacity, (v) => { state.ref.opacity = v; requestRender(); }, pct);
  $('#ref-remove').addEventListener('click', () => { state.ref.img = null; $('#ref-opts').hidden = true; requestRender(); });
  $('#ref-convert').addEventListener('click', () => {
    if (!confirm(tr('confirm_convert'))) return;
    convertReference();
  });

  // Top bar
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-fit').addEventListener('click', fitView);
  $('#btn-planet').addEventListener('click', () => setGlobe(!state.globe.on));
  $('#btn-tour').addEventListener('click', () => startTour({ setTool }));
  $('#btn-save').addEventListener('click', () => $('#dlg-save').showModal());
  $('#btn-export').addEventListener('click', exportPNG);
  $('#btn-open').addEventListener('click', () => $('#dlg-open').showModal());
  const onChoice = (id, actions) => $(id).addEventListener('close', (e) => {
    const v = e.target.returnValue;
    e.target.returnValue = '';
    actions[v]?.();
  });
  const { nextcloud, gdrive, onedrive } = services;
  const clouds = { cloud: () => openCloud(nextcloud), gdrive: () => openCloud(gdrive), onedrive: () => openCloud(onedrive) };
  onChoice('#dlg-save', { local: saveProject, ...clouds });
  onChoice('#dlg-open', { local: () => $('#file-open').click(), ...clouds });
  $('#file-open').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      await loadProject(JSON.parse(await f.text()));
      status(tr('msg_opened', { name: f.name }));
    } catch (err) {
      alert(tr('alert_open_failed', { msg: err.message }));
    }
  });

  openCloud = setupCloud({ loadProject, serializeAsync, status });

  const dlg = $('#dlg-new');
  $('#btn-new').addEventListener('click', () => dlg.showModal());
  $('#new-preset').addEventListener('change', (e) => {
    const custom = e.target.value === 'custom';
    $('#new-custom').hidden = !custom;
    if (!custom) {
      const [w, h] = e.target.value.split('x');
      $('#new-w').value = w;
      $('#new-h').value = h;
    }
  });
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return;
    const even = (v) => Math.min(4096, Math.max(400, Math.round(+v / CELL) * CELL));
    newMap(even($('#new-w').value), even($('#new-h').value), $('#new-fill').value);
  });
}

let openCloud; // openCloud(service): opens the cloud dialog (see ui/cloud-dialog.js)
let editSession = null; // the selection being adjusted from the panel: one undo step per adjustment
function beginEdit() {
  if (editSession !== state.selection) {
    pushHistory();
    editSession = state.selection;
  }
}

// Several objects selected, all of the same type and size: the panel lets you change
// the size of all of them together. Returns the size field ('scale' for engravings, 'size' for texts).
function sharedSize() {
  const list = state.selection;
  if (list.length < 2) return null;
  const kind = list[0].kind, key = kind === 'label' ? 'size' : 'scale';
  return list.every((o) => o.kind === kind && o[key] === list[0][key]) ? key : null;
}

function select(o) {
  setSelection(o ? [o] : []);
}

function setSelection(list) {
  state.selection = list;
  const o = list.length === 1 ? list[0] : null;
  state.selected = o;
  editSession = null;
  $('#sel-empty').hidden = list.length > 0;
  $('#sel-multi').hidden = list.length < 2;
  $('#sel-multi').textContent = tr('selection_multi', { n: list.length });
  const shared = sharedSize(); // several of the same size: only the size control shows
  $('#sel-engraving').hidden = o ? o.kind !== 'engraving' : shared !== 'scale';
  $('#sel-label').hidden = o ? o.kind !== 'label' : shared !== 'size';
  $('#sel-engraving').classList.toggle('only-size', !o);
  $('#sel-label').classList.toggle('only-size', !o);
  $('#sel-actions').hidden = !list.length;
  syncControls();
  requestRender();
}

function boxOf(o) {
  return o.kind === 'label' ? labelBox(ctx, o) : engravingBox(o);
}

// Objects whose box touches the rectangle (touching the edge is enough).
function objectsInBox(r) {
  return state.objects.filter((o) => {
    const b = boxOf(o);
    return b.x <= r.x1 && b.x + b.w >= r.x0 && b.y <= r.y1 && b.y + b.h >= r.y0;
  });
}

// Planet: objects (on the visible side) whose screen box touches screen rectangle r.
function objectsInScreenBox(r) {
  const v = globeView();
  return state.objects.filter((o) => {
    const g = onGlobe(o, v), b = g && boxOf(g);
    return b && b.x <= r.x1 && b.x + b.w >= r.x0 && b.y <= r.y1 && b.y + b.h >= r.y0;
  });
}

const screenRect = (b) => ({ x0: Math.min(b.sx0, b.sx1), y0: Math.min(b.sy0, b.sy1), x1: Math.max(b.sx0, b.sx1), y1: Math.max(b.sy0, b.sy1) });

function normRect(b) {
  return { x0: Math.min(b.x0, b.x1), y0: Math.min(b.y0, b.y1), x1: Math.max(b.x0, b.x1), y1: Math.max(b.y0, b.y1) };
}

function fillPalettes() {
  $('#style-palette').innerHTML = Object.entries(PALETTES).map(([k, p]) => `<option value="${k}">${localName(p)}</option>`).join('');
  $('#style-palette').value = state.palette;
}

// Switches language without reloading: static HTML texts + parts built by code.
let loadedCategories = [];
function setupLanguage() {
  const sel = $('#language');
  sel.innerHTML = Object.entries(LANGUAGES).map(([k, name]) => `<option value="${k}">${name}</option>`).join('');
  sel.value = lang;
  sel.addEventListener('change', () => {
    const oldExample = tr('example_text');
    setLang(sel.value);
    if (state.label.text === oldExample) state.label.text = tr('example_text');
    fillPalettes();
    buildSwatches();
    buildLibrary(loadedCategories);
    buildVariants();
    setSelection(state.selection);
    syncControls();
    requestRender();
  });
  applyLanguage();
}

function buildSwatches() {
  const pal = PALETTES[state.palette];
  const box = $('#terrain-types');
  box.innerHTML = '';
  for (const t of TERRAIN_TYPES) {
    const b = document.createElement('button');
    b.className = 'swatch' + (t.id === state.brush.type ? ' active' : '');
    b.innerHTML = `<i style="background:rgb(${swatchColor(pal, t.id).join(',')})"></i>${localName(t)}`;
    b.addEventListener('click', () => { state.brush.type = t.id; buildSwatches(); });
    box.appendChild(b);
  }
}

// Pack folders hidden in the library (preference for this browser only).
const HIDDEN_PACKS_KEY = 'the-cartographer:hidden-packs';
let hiddenPacks = new Set();
try { hiddenPacks = new Set(JSON.parse(localStorage.getItem(HIDDEN_PACKS_KEY)) || []); } catch { /* no localStorage */ }
let packsOpen = false;
const packOf = (item) => (item.file || item.files[0]).split('/')[0];

function buildPackFilter(categories) {
  const packs = new Map(); // folder -> names of the packs in it
  for (const cat of categories) for (const it of cat.items) {
    if (!packs.has(packOf(it))) packs.set(packOf(it), new Set());
    if (it.pack) packs.get(packOf(it)).add(it.pack);
  }
  const det = document.createElement('details');
  det.className = 'packs';
  det.open = packsOpen;
  det.addEventListener('toggle', () => { packsOpen = det.open; });
  const sum = document.createElement('summary');
  const shown = [...packs.keys()].filter((k) => !hiddenPacks.has(k)).length;
  sum.textContent = tr('packs_filter', { n: shown, total: packs.size });
  det.append(sum);
  for (const [folder, names] of packs) {
    const l = document.createElement('label');
    l.className = 'check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !hiddenPacks.has(folder);
    cb.addEventListener('change', () => {
      if (cb.checked) hiddenPacks.delete(folder); else hiddenPacks.add(folder);
      try { localStorage.setItem(HIDDEN_PACKS_KEY, JSON.stringify([...hiddenPacks])); } catch { /* no localStorage */ }
      buildLibrary(categories);
    });
    l.append(cb, ` ${names.size === 1 ? [...names][0] : folder}`);
    l.title = [`assets/${folder}/`, ...names].join('\n');
    det.append(l);
  }
  return det;
}

// Search ignoring case and accents ("arvore" finds "Árvore")
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Categories collapsed by the user (remembered in the browser)
const COLLAPSED_KEY = 'the-cartographer:collapsed-categories';
const VARIANTS_FOLD = '__variants'; // the Variant block, kept in the same set as the categories
let collapsedCats = new Set();
try { collapsedCats = new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY)) || []); } catch { /* no localStorage */ }

function filterLibrary() {
  const q = fold($('#lib-search').value.trim());
  let found = 0;
  $('#library').querySelectorAll('details.cat').forEach((det) => {
    let n = 0;
    det.querySelectorAll('.grid button').forEach((b) => { b.hidden = !!q && !b.dataset.search.includes(q); n += !b.hidden; });
    det.hidden = !n; // hide the category with no results
    det.querySelector('small').textContent = n;
    det.open = !!q || !collapsedCats.has(det.dataset.cat); // when searching, show everything found
    found += n;
  });
  $('#lib-empty').hidden = found > 0 || !q;
}

// ------------------------------------------- own engravings (this browser only)

// "My assets" category: always at the end of the library (hidden while empty).
const userCategory = { name: 'My assets', name_pt: 'Meus assets', items: [] };
const USER_MAX_BYTES = 10 * 1024 * 1024;
const USER_TYPES = ['image/png', 'image/webp', 'image/jpeg', 'image/svg+xml'];

async function loadUserAssets() {
  const recs = await userAssetsAll();
  recs.sort((a, b) => a.added - b.added);
  userCategory.items = recs.map((r) => registerUserAsset(r, () => { objectsDirty = true; }));
}

// Checks the file opens as an image before storing it.
function decodes(blob) {
  return new Promise((ok) => {
    const img = new Image(), url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); ok(img.naturalWidth > 0); };
    img.onerror = () => { URL.revokeObjectURL(url); ok(false); };
    img.src = url;
  });
}

async function addUserAssets(files) {
  let added = 0, last = null;
  const rejected = [];
  for (const f of files) {
    if (!USER_TYPES.includes(f.type) || f.size > USER_MAX_BYTES || !(await decodes(f))) {
      rejected.push(f.name);
      continue;
    }
    const rec = { id: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'imagem', blob: f, added: Date.now() };
    try {
      await userAssetPut(rec);
    } catch {
      status(tr('user_asset_save_failed'));
      break;
    }
    userCategory.items.push(registerUserAsset(rec, () => { objectsDirty = true; }));
    added++;
    last = rec.id;
  }
  const bad = rejected.length ? tr('user_asset_invalid', { name: rejected.join('", "') }) : '';
  if (!added) { if (bad) status(bad); return; }
  hiddenPacks.delete(packOf(userCategory.items[0])); // the new ones show even if the pack was hidden
  collapsedCats.delete(userCategory.name);
  state.engraving.asset = last; // already selected for placing
  state.engraving.variant = -1;
  nextVariant = randomVariant();
  buildLibrary(loadedCategories);
  buildVariants();
  setTool('engraving');
  status(`${tr('user_asset_added', { n: added })} ${bad}`.trim());
}

async function deleteUserAsset(item) {
  if (!confirm(tr('user_asset_confirm_delete', { name: item.name }))) return;
  try { await userAssetDelete(item.id); } catch { status(tr('user_asset_save_failed')); return; }
  unregisterUserAsset(item.id);
  userCategory.items = userCategory.items.filter((it) => it !== item);
  if (state.engraving.asset === item.id) state.engraving.asset = loadedCategories[0]?.items[0]?.id;
  objectsDirty = true; // already placed ones become the missing-engraving rectangle
  buildLibrary(loadedCategories);
  buildVariants();
}

function buildLibrary(categories) {
  const lib = $('#library');
  lib.innerHTML = '';
  $('#packs').replaceChildren(buildPackFilter(categories));
  for (const cat of categories) {
    const items = cat.items.filter((it) => !hiddenPacks.has(packOf(it)));
    if (!items.length) continue;
    const det = document.createElement('details');
    det.className = 'cat';
    det.dataset.cat = cat.name;
    const sum = document.createElement('summary');
    const h = document.createElement('h3');
    h.textContent = localName(cat);
    sum.append(h, document.createElement('small'));
    // Only a click counts as the user's choice (opening during search is not saved)
    sum.addEventListener('click', (e) => {
      e.preventDefault();
      if ($('#lib-search').value.trim()) return;
      if (collapsedCats.has(cat.name)) collapsedCats.delete(cat.name); else collapsedCats.add(cat.name);
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedCats])); } catch { /* no localStorage */ }
      det.open = !collapsedCats.has(cat.name);
    });
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const item of items) {
      const b = document.createElement('button');
      b.title = item.files ? tr('variants_tip', { name: localName(item), n: item.files.length })
        : item.user ? tr('user_asset_tip', { name: item.name }) : localName(item);
      if (item.user) b.addEventListener('contextmenu', (e) => { e.preventDefault(); deleteUserAsset(item); });
      b.dataset.asset = item.id;
      b.dataset.search = fold([item.name, item.name_pt, item.tags, cat.name, cat.name_pt].filter(Boolean).join(' '));
      if (item.id === state.engraving.asset) b.classList.add('active');
      b.append(thumb(assets.get(item.id)));
      b.addEventListener('click', () => {
        if (state.engraving.asset !== item.id) state.engraving.variant = -1;
        state.engraving.asset = item.id;
        nextVariant = randomVariant();
        buildVariants();
        lib.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        setTool('engraving');
      });
      grid.appendChild(b);
    }
    det.append(sum, grid);
    lib.append(det);
  }
  filterLibrary();
}

function setPalette(name) {
  if (!PALETTES[name]) return;
  state.palette = name;
  state.terrain.palette = PALETTES[name];
  makeGrain(); // the old texture stays until the new one is ready
  styleDirty = true;
  objectsDirty = true;
  buildSwatches();
  scheduleAutosave();
}

let statusTimer = null;
function status(msg) {
  const el = $('#status');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

// ------------------------------------------------------------------ map ops

// noise = false: noise textures still empty; grain = false: the paper was already requested
// (loadProject does both in the workers, in parallel).
function createTerrain(noise = true, grain = true) {
  const t = new Terrain(state.W / CELL, state.H / CELL, state.seed, noise);
  t.palette = PALETTES[state.palette];
  t.style = state.style;
  t.wrapX = state.globe.on;
  if (state.globe.on && noise) t.enableSphere();
  state.terrain = t;
  objLayer.width = state.W;
  objLayer.height = state.H;
  if (grain) {
    makeGrain();
    holdForGrain(); // new size or map: the screen waits for the texture instead of showing the map without it
  }
  compAll = true;
}

function generateContinent() {
  const t = state.terrain;
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      const nx = x / t.w - 0.5, ny = y / t.h - 0.5;
      const e = fbm(x * 0.006, y * 0.006, 5, state.seed + 50) + 0.42 - Math.hypot(nx * 1.15, ny * 1.3) * 1.25;
      let type = e > 0.5 ? 1 : 0;
      if (type && y < t.h * 0.26 + fbm(x * 0.02, 0, 3, state.seed + 60) * t.h * 0.08) type = 6;
      else if (type && fbm(x * 0.012, y * 0.012, 3, state.seed + 70) > 0.62) type = 3;
      t.grid[y * t.w + x] = type;
    }
  }
}

function newMap(W, H, fill) {
  state.W = W;
  state.H = H;
  state.seed = (Math.random() * 1e9) | 0;
  state.objects = [];
  createTerrain();
  if (fill === 'land') state.terrain.grid.fill(1);
  else if (fill === 'continent') generateContinent();
  state.terrain.updateAll();
  undoStack = [];
  redoStack = [];
  updateHistoryButtons();
  select(null);
  objectsDirty = true;
  fitView();
  scheduleAutosave();
}

const MAX_SIZE = 8000;

// Grows the map outward (values in px, multiples of CELL), keeping terrain and objects.
function expandMap(top, right, bottom, left, fill) {
  if (!(top || right || bottom || left)) return;
  pushHistory();
  const old = state.terrain;
  state.W += left + right;
  state.H += top + bottom;
  createTerrain();
  const t = state.terrain, dx = left / CELL, dy = top / CELL;
  t.grid.fill(fill);
  for (let y = 0; y < old.h; y++) t.grid.set(old.grid.subarray(y * old.w, (y + 1) * old.w), (y + dy) * t.w + dx);
  t.updateAll();
  for (const o of state.objects) { o.x += left; o.y += top; }
  objectsDirty = true;
  state.view.x -= left * state.view.z; // the drawing stays still on screen
  state.view.y -= top * state.view.z;
  scheduleAutosave();
  status(tr('msg_map_size', { w: state.W, h: state.H }));
}

function addDemoObjects() {
  const t = state.terrain;
  const landCells = (pred) => {
    const out = [];
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * state.W, y = Math.random() * state.H;
      if (pred(cellAt(x, y)) && pred(cellAt(x, y - 40)) && t.distWater[Math.floor(y / CELL) * t.w + Math.floor(x / CELL)] > 8) out.push({ x, y });
    }
    return out;
  };
  const snow = landCells((c) => c === 6), forest = landCells((c) => c === 3), grass = landCells((c) => c === 1);
  // List of ids: uses the first one that exists (packs may have been removed from manifest.json).
  const add = (ids, p, scale = 1) => {
    const asset = [].concat(ids).find((id) => assets.get(id));
    const a = asset && assets.get(asset);
    if (!p || !a) return;
    const o = { kind: 'engraving', asset, x: Math.round(p.x), y: Math.round(p.y), scale, rot: 0, flip: Math.random() < 0.5 };
    if (a.imgs.length > 1) o.variant = Math.floor(Math.random() * a.imgs.length);
    if (a.color === 'sample') o.ground = cellAt(p.x, p.y);
    state.objects.push(o);
  };
  snow.slice(0, 14).forEach((p) => add(Math.random() < 0.6 ? ['os-big-mountain', '1688-mountain', 'gen-mountain'] : ['os-mountain', '1688-hill', 'gen-mountain'], p, 0.9 + Math.random() * 0.4));
  forest.slice(0, 60).forEach((p) => add(Math.random() < 0.5 ? ['os-oak', '1688-tree', 'ta-oak'] : ['os-pine', '1688-tree', 'ta-pine'], p, 0.8 + Math.random() * 0.4));
  add(['os-iso-capital', '1688-city', 'ta-city'], grass[0]);
  add(['os-iso-town', '1688-town', 'ta-house'], grass[1]);
  add(['os-iso-city', '1688-city', 'ta-arabian-city'], grass[2]);
  if (grass[0]) state.objects.push({ kind: 'label', text: tr('example_text'), font: FONTS[0], size: 56, color: '#3b2a1a', spacing: 6, rot: 0, x: Math.round(grass[0].x), y: Math.round(grass[0].y + 50) });
  add(['ta-compass', 'comigo-compass'], { x: state.W - 170, y: state.H - 170 });
  objectsDirty = true;
}

// Detects water, land and snow from the reference image colors.
function convertReference() {
  const img = state.ref.img;
  if (!img) return;
  pushHistory();
  const t = state.terrain;
  const c = document.createElement('canvas');
  c.width = t.w;
  c.height = t.h;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(80,110,130)';
  g.fillRect(0, 0, t.w, t.h);
  const f = fitRect(img, t.w, t.h);
  g.drawImage(img, f.x, f.y, f.w, f.h);
  const d = g.getImageData(0, 0, t.w, t.h).data;
  let types = new Uint8Array(t.w * t.h);
  for (let i = 0; i < types.length; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx ? (mx - mn) / mx : 0;
    let type;
    if (mx > 200 && sat < 0.14) type = 6;
    else if (b >= gg - 4 && b >= r) type = 0;
    else if (r > gg + 8 && r > 150) type = 4;
    else if (gg < 110 && r < 110) type = 3;
    else type = 1;
    types[i] = type;
  }
  // Majority filter to clean up noise (wave lines, icons etc.)
  const counts = new Uint8Array(TERRAIN_TYPES.length);
  for (let pass = 0; pass < 2; pass++) {
    const out = new Uint8Array(types.length);
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        counts.fill(0);
        for (let dy = -2; dy <= 2; dy++) {
          const yy = Math.min(t.h - 1, Math.max(0, y + dy));
          for (let dx = -2; dx <= 2; dx++) {
            const xx = Math.min(t.w - 1, Math.max(0, x + dx));
            counts[types[yy * t.w + xx]]++;
          }
        }
        let best = 0;
        for (let k = 1; k < counts.length; k++) if (counts[k] > counts[best]) best = k;
        out[y * t.w + x] = best;
      }
    }
    types = out;
  }
  t.grid.set(types);
  t.updateAll();
  state.ref.visible = false;
  syncControls();
  requestRender();
  scheduleAutosave();
  status(tr('msg_terrain_converted'));
}

// ------------------------------------------------------------ save / export

// Last encoded terrain: the PNG is only redone if the grid changed since then. Encoding a large
// map takes seconds and froze the autosave after every edit (even object-only ones) and on
// page reload/close. Comparing the grid with the stored copy takes milliseconds.
let gridCache = null; // { w, grid (copy), url }
function sameGrid(a, b) {
  if (a.length !== b.length) return false;
  const n4 = a.length >> 2, a32 = new Uint32Array(a.buffer, a.byteOffset, n4), b32 = new Uint32Array(b.buffer, b.byteOffset, n4);
  for (let i = 0; i < n4; i++) if (a32[i] !== b32[i]) return false;
  for (let i = n4 * 4; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function encodedTerrain() {
  const t = state.terrain;
  if (gridCache && gridCache.w === t.w && sameGrid(gridCache.grid, t.grid)) return gridCache.url;
  const url = encodeGrid(t);
  gridCache = { w: t.w, grid: t.grid.slice(), url };
  return url;
}

// Same, but encoding in a worker (js/workers/encode-worker.js) so the screen doesn't freeze. The grid is
// copied at request time; if it changes meanwhile, the next autosave encodes again.
let encodeWorker = null, encodeJob = 0;
function encodedTerrainAsync() {
  const t = state.terrain;
  if (gridCache && gridCache.w === t.w && sameGrid(gridCache.grid, t.grid)) return Promise.resolve(gridCache.url);
  const grid = t.grid.slice(), { w, h } = t, id = ++encodeJob;
  return new Promise((resolve) => {
    try {
      encodeWorker ||= new Worker(new URL('./workers/encode-worker.js', import.meta.url), { type: 'module' });
    } catch { resolve(encodedTerrain()); return; } // no worker: encode right here
    const onMsg = ({ data: m }) => {
      if (m.id !== id) return;
      encodeWorker.removeEventListener('message', onMsg);
      if (m.error) { resolve(encodedTerrain()); return; } // e.g. browser without OffscreenCanvas
      gridCache = { w, grid, url: m.url };
      resolve(m.url);
    };
    encodeWorker.addEventListener('message', onMsg);
    const copy = grid.slice(); // the copy goes to the worker (transferred); grid stays in the cache
    encodeWorker.postMessage({ id, w, h, grid: copy.buffer }, [copy.buffer]);
  });
}

function serialize(terrain = encodedTerrain()) {
  return {
    app: 'the-cartographer',
    version: 2,
    width: state.W,
    height: state.H,
    seed: state.seed,
    palette: state.palette,
    style: state.style,
    terrain,
    objects: state.objects,
  };
}
const serializeAsync = async () => serialize(await encodedTerrainAsync());

// Distances stored in the cache as the integer square (up to MAXD² = 2304, fits in 2 bytes):
// the distance is always min(√n, MAXD) with integer n, so converting back gives exactly the same number.
function packDist(d) {
  const n = new Uint16Array(d.length);
  for (let i = 0; i < d.length; i++) n[i] = Math.round(d[i] * d[i]);
  return n;
}
function unpackDist(n, d) {
  for (let i = 0; i < d.length; i++) d[i] = Math.min(Math.sqrt(n[i]), MAXD);
}

// Stores the terrain computed on open (js/storage/cache.js) a few seconds later, so as not to delay the
// map showing up, and only if nothing changed since opening (otherwise the data won't match the PNG).
function saveTerrainCacheLater(t, png, look, dist, shade) {
  setTimeout(() => {
    const same = state.terrain === t && gridCache?.url === png && sameGrid(gridCache.grid, t.grid) &&
      state.globe.on === look.wrap && state.palette === look.palette && JSON.stringify(state.style) === look.style;
    if (!same) return;
    if (dist) cachePut('dist', { w: t.w, h: t.h, wrap: look.wrap, png, land: packDist(t.distLand), water: packDist(t.distWater) });
    if (shade) cachePut('shade', { w: t.w, h: t.h, png, ...look, rgba: t.img.data });
  }, 3000);
}

async function loadProject(p) {
  if (p.app !== 'the-cartographer' || p.version !== 2) throw new Error(tr('error_not_project'));
  // File checked before touching the current map: a bad file left a broken map on
  // screen, and the next autosave overwrote the last good map.
  const okSize = (v) => Number.isInteger(v) && v >= CELL && v <= MAX_SIZE && v % CELL === 0;
  if (!okSize(p.width) || !okSize(p.height) || typeof p.terrain !== 'string') throw new Error(tr('error_not_project'));
  const w = p.width / CELL, h = p.height / CELL, seed = Number(p.seed) || 0, png = p.terrain, wrap = state.globe.on;
  // Terrain noise starts in the workers right away, in parallel with decoding and the cache read
  // (queued first: the shading waits for it). Nothing is drawn until everything is ready.
  const noiseParts = splitOnPool({ type: 'noise', w, seed }, h);
  // Terrain already computed at the last open (js/storage/cache.js): each part is only used if everything
  // it depends on matches (same terrain PNG, size, planet, and for the painting, palette and style).
  const [grid, cDist, cShade] = await Promise.all([decodeGrid(png, w, h), cacheGet('dist'), cacheGet('shade')]);
  state.W = p.width;
  state.H = p.height;
  state.seed = seed;
  state.palette = PALETTES[p.palette] ? p.palette : 'colored';
  state.style = { ...DEFAULT_STYLE, ...p.style };
  const look = { seed, wrap, palette: state.palette, style: JSON.stringify(state.style), colors: JSON.stringify(PALETTES[state.palette]) };
  makeGrain();
  let terrainDone;
  holdForGrain(new Promise((ok) => { terrainDone = ok; }));
  try {
    const hitDist = cDist?.png === png && cDist.w === w && cDist.h === h && cDist.wrap === wrap;
    const hitShade = cShade?.png === png && cShade.w === w && cShade.h === h && Object.keys(look).every((k) => cShade[k] === look[k]);
    createTerrain(false, false); // no noise and no paper: already being computed above
    const t = state.terrain;
    const noise = noiseParts
      .then((parts) => {
        for (const m of parts) {
          t.texFine.set(m.fine, m.from * t.w);
          t.texCoarse.set(m.coarse, m.from * t.w);
        }
      })
      .catch(() => t.fillNoise()); // no workers: compute right here
    t.grid.set(grid);
    gridCache = { w: t.w, grid: t.grid.slice(), url: png }; // the PNG came ready in the file
    if (hitDist) {
      unpackDist(cDist.land, t.distLand);
      unpackDist(cDist.water, t.distWater);
    } else t.distances({ x0: 0, y0: 0, x1: t.w, y1: t.h });
    await noise; // needed even with the painting cached: later edits repaint with it
    if (hitShade) {
      t.img.data.set(cShade.rgba);
      t.ctx.putImageData(t.img, 0, 0);
    } else t.shadeAll();
    if (state.globe.on) t.enableSphere(); // depends on the noise and the flat map painting
    if (!hitDist || !hitShade) saveTerrainCacheLater(t, png, look, !hitDist, !hitShade);
  } finally {
    terrainDone();
  }
  state.objects = Array.isArray(p.objects) ? p.objects : [];
  undoStack = [];
  redoStack = [];
  updateHistoryButtons();
  select(null);
  buildSwatches();
  syncControls();
  objectsDirty = true;
  fitView();
  scheduleAutosave(); // the opened map becomes the "last map" when reopening the site
}

// autosaveSeq counts autosave requests; savedSeq is the last one that reached localStorage.
let autosaveTimer = null, autosaveSeq = 0, savedSeq = 0;
function writeAutosave(project, seq) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
    savedSeq = Math.max(savedSeq, seq);
  } catch {
    status(tr('msg_autosave_failed'));
  }
}
// Synchronous: only for when the page is closing (can't wait for the worker).
function autosaveNow() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  writeAutosave(serialize(), autosaveSeq);
}
function scheduleAutosave() {
  const seq = ++autosaveSeq;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    // Saving the project takes tens of ms: never in the middle of a stroke.
    if (dragging || terrainQueue.length) { scheduleAutosave(); return; }
    autosaveTimer = null;
    const project = await serializeAsync(); // terrain encoded in the worker, without freezing the screen
    if (seq >= savedSeq) writeAutosave(project, seq);
  }, 1500);
}
// Closing the tab with changes not yet saved (pending timer or encoding in the worker).
window.addEventListener('pagehide', () => { if (savedSeq < autosaveSeq) autosaveNow(); });

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}


async function saveProject() {
  status(tr('msg_saving'));
  download(new Blob([JSON.stringify(await serializeAsync())], { type: 'application/json' }), 'map.the-cartographer.json');
  status(tr('msg_saved'));
}

async function exportPNG() {
  status(tr('msg_generating'));
  await document.fonts.ready;
  await grainReady; // paper texture still being computed in the background
  const scale = +$('#export-scale').value;
  const objs = document.createElement('canvas');
  objs.width = state.W * scale;
  objs.height = state.H * scale;
  redrawObjects(objs, scale);
  const out = document.createElement('canvas');
  out.width = state.W * scale;
  out.height = state.H * scale;
  const c = out.getContext('2d');
  c.scale(scale, scale);
  drawMap(c, objs);
  out.toBlob((b) => { download(b, 'map.png'); status(tr('msg_exported')); }, 'image/png');
}

// --------------------------------------------------------------------- start

// Tool settings (brush, engraving, text) are saved in the browser.
const SETTINGS_KEY = 'the-cartographer:config';

function loadSettings() {
  try {
    const c = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!c) return;
    Object.assign(state.brush, c.brush);
    Object.assign(state.engraving, c.engraving);
    Object.assign(state.label, c.label);
    if (tools[c.tool]) state.tool = c.tool;
  } catch { /* invalid settings: use the default */ }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ brush: state.brush, engraving: state.engraving, label: state.label, tool: state.tool }));
  } catch { /* no localStorage */ }
}
// Saves on close or tab switch, which catches every change without saving on every click.
window.addEventListener('pagehide', saveSettings);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveSettings(); });

async function init() {
  setupLanguage();
  loadSettings();
  new ResizeObserver(resizeCanvas).observe(canvas);
  resizeCanvas();
  setupControls();

  let categories = [];
  try {
    categories = await loadAssets(() => { objectsDirty = true; });
  } catch (err) {
    status(tr('msg_manifest_error', { msg: err.message }));
  }
  await loadUserAssets();
  categories = loadedCategories = [...categories, userCategory];
  buildLibrary(categories);
  buildVariants();
  nextVariant = randomVariant();

  FONTS.forEach((f) => document.fonts.load(`20px "${f}"`).then(() => { objectsDirty = true; }).catch(() => {}));

  let restored = false;
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) {
      await loadProject(JSON.parse(saved));
      restored = true;
    }
  } catch (err) {
    console.warn('Autosave ignored:', err);
  }
  if (!restored) {
    newMap(2000, 1500, 'continent');
    addDemoObjects();
  }

  buildSwatches();
  setTool(state.tool);
  syncControls();
  fitView();
  requestAnimationFrame(frame);
  if (!tourDone()) setTimeout(() => startTour({ setTool }), 800); // first visit: the tutorial opens by itself
}

init();
