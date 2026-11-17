// Step-by-step tutorial: a card with the current step and a spotlight on the button or panel it
// talks about. Skippable at any time (button or Esc); shown once on the first visit and again
// from the Tutorial button. Texts live in i18n.js (tour_*).
import { t } from '../i18n.js';

const DONE_KEY = 'the-cartographer:tour-done';

// target: CSS selector to highlight (null = card centered); tool: tool to activate first so its panel shows.
const STEPS = [
  { key: 'welcome', target: null },
  { key: 'new', target: '#btn-new' },
  { key: 'brush', target: '[data-tool="brush"]', tool: 'brush' },
  { key: 'terrain', target: '#terrain-types', tool: 'brush' },
  { key: 'brush_opts', target: '#brush-opts', tool: 'brush' },
  { key: 'engraving', target: '[data-tool="engraving"]', tool: 'engraving' },
  { key: 'library', target: '#library', tool: 'engraving' },
  { key: 'own', target: '#user-assets-add', tool: 'engraving' },
  { key: 'text', target: '[data-tool="text"]', tool: 'text' },
  { key: 'select', target: '[data-tool="select"]', tool: 'select' },
  { key: 'style', target: '.fold:has([data-i18n="map_style"])', tool: 'select' },
  { key: 'planet', target: '#btn-planet' },
  { key: 'save', target: '#btn-save' },
  { key: 'export', target: '#btn-export' },
  { key: 'done', target: '#btn-tour' },
];

export const tourDone = () => {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return true; } // no storage: don't nag
};

let running = null; // { stop } while the tour is open

export function startTour({ setTool }) {
  if (running) return;
  const spot = Object.assign(document.createElement('div'), { className: 'tour-spot' });
  const card = Object.assign(document.createElement('div'), { className: 'tour-card' });
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.innerHTML = `<p class="tour-count"></p><h2></h2><p class="tour-body"></p>
    <div class="row end"><button type="button" class="tour-skip"></button><span class="tour-gap"></span>
    <button type="button" class="tour-prev"></button><button type="button" class="tour-next primary"></button></div>`;
  card.querySelector('h2').id = 'tour-title';
  card.setAttribute('aria-labelledby', 'tour-title');
  document.body.append(spot, card);
  let i = 0;

  const place = () => {
    const s = STEPS[i], el = s.target && document.querySelector(s.target);
    const b = el && el.offsetParent !== null ? el.getBoundingClientRect() : null; // hidden target: centered card
    const vw = innerWidth, vh = innerHeight, cw = card.offsetWidth, ch = card.offsetHeight, m = 12;
    // only the visible part of the target (the engraving library is taller than the screen)
    const r = b && { left: b.left, right: b.right, top: Math.max(b.top, 6), bottom: Math.min(b.bottom, vh - 6) };
    if (r) { r.width = r.right - r.left; r.height = r.bottom - r.top; }
    spot.hidden = !r;
    if (r) {
      Object.assign(spot.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
      // card beside the target: right if there is room, else left, else below; always inside the screen
      let x = r.right + m + 6, y = r.top;
      if (x + cw > vw - m) x = r.left - cw - m - 6;
      if (x < m) { x = Math.min(Math.max(m, r.left), vw - cw - m); y = r.bottom + m + 6; }
      if (y + ch > vh - m) y = Math.max(m, r.top - ch - m - 6);
      if (y + ch > vh - m) y = vh - ch - m;
      Object.assign(card.style, { left: `${Math.max(m, x)}px`, top: `${Math.max(m, y)}px` });
    } else {
      Object.assign(card.style, { left: `${(vw - cw) / 2}px`, top: `${(vh - ch) / 2}px` });
    }
  };

  const show = (k) => {
    i = Math.max(0, Math.min(STEPS.length - 1, k));
    const s = STEPS[i];
    if (s.tool) setTool(s.tool);
    card.querySelector('.tour-count').textContent = t('tour_count', { n: i + 1, total: STEPS.length });
    card.querySelector('h2').textContent = t(`tour_${s.key}_title`);
    card.querySelector('.tour-body').innerHTML = t(`tour_${s.key}_body`);
    card.querySelector('.tour-prev').textContent = t('tour_prev');
    card.querySelector('.tour-prev').hidden = i === 0;
    card.querySelector('.tour-next').textContent = i === STEPS.length - 1 ? t('tour_finish') : t('tour_next');
    card.querySelector('.tour-skip').textContent = t('tour_skip');
    card.querySelector('.tour-skip').hidden = i === STEPS.length - 1;
    document.querySelector(s.target || 'body')?.scrollIntoView?.({ block: 'nearest' }); // panel items may be scrolled away
    requestAnimationFrame(place);
    card.querySelector('.tour-next').focus();
  };

  const stop = () => {
    try { localStorage.setItem(DONE_KEY, '1'); } catch { /* no storage */ }
    removeEventListener('resize', place);
    removeEventListener('keydown', onKey, true);
    spot.remove();
    card.remove();
    running = null;
  };

  const onKey = (e) => {
    if (e.key === 'Escape') stop();
    else if (e.key === 'ArrowRight') show(i + 1);
    else if (e.key === 'ArrowLeft') show(i - 1);
    else return;
    e.preventDefault();
    e.stopPropagation(); // the editor's shortcuts stay quiet while the tour is open
  };

  card.querySelector('.tour-next').addEventListener('click', () => (i === STEPS.length - 1 ? stop() : show(i + 1)));
  card.querySelector('.tour-prev').addEventListener('click', () => show(i - 1));
  card.querySelector('.tour-skip').addEventListener('click', stop);
  addEventListener('resize', place);
  addEventListener('keydown', onKey, true);
  running = { stop };
  show(0);
}
