// Selection outlines and selection box, drawn in screen px (flat map and planet).

// Selection outline, in screen px: light 2 px dashes, each with a dark border only around
// itself, and empty gaps (the map shows between dashes). The border ensures contrast on
// light and dark backgrounds. Dashes are computed per side and always start and end with a
// dash at the corner: when zooming the dashes just stretch a little instead of "crawling" along the edge.
// polys: list of polygons [[x, y], ...] in screen px.
const DASH = 7, GAP = 6, SEL_EDGE = 1; // dash, gap and dark border thickness (px)
export function strokeSelection(c, polys, color) {
  const dpr = window.devicePixelRatio || 1;
  c.save();
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sides = [];
  for (const pts of polys) {
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round((L + GAP) / (DASH + GAP))), k = L / (n * DASH + (n - 1) * GAP);
      sides.push({ a, b, dash: n > 1 ? [DASH * k, GAP * k] : [] });
    });
  }
  // 1st pass: dark border (wider, with square caps to also cover the dash ends)
  // 2nd pass: the light dash, same pattern, on top.
  for (const [width, cap, style] of [[2 + 2 * SEL_EDGE, 'square', 'rgba(20, 16, 12, 0.7)'], [2, 'butt', color]]) {
    c.lineWidth = width;
    c.lineCap = cap;
    c.strokeStyle = style;
    for (const { a, b, dash } of sides) {
      // square cap grows width/2 on each side: shorten the border dash so it extends only SEL_EDGE
      c.setLineDash(dash.length && cap === 'square' ? [dash[0] - (width - 2 * SEL_EDGE), dash[1] + (width - 2 * SEL_EDGE)] : dash);
      c.lineDashOffset = cap === 'square' && dash.length ? -(width / 2 - SEL_EDGE) : 0;
      c.beginPath();
      c.moveTo(...a);
      c.lineTo(...b);
      c.stroke();
    }
  }
  c.restore();
}
// Selection box being dragged, in screen px: gold fill and gold border over
// a dark border (the old thin translucent line vanished on parchment and grass).
// path(c) traces the shape; closed = can be filled (on the planet, only if fully visible).
export function drawSelectBox(c, path, closed = true) {
  const dpr = window.devicePixelRatio || 1;
  c.save();
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.setLineDash([]);
  c.lineJoin = 'round';
  c.beginPath();
  path(c);
  if (closed) {
    c.fillStyle = 'rgba(232, 195, 114, 0.22)';
    c.fill();
  }
  c.strokeStyle = 'rgba(20, 16, 12, 0.65)';
  c.lineWidth = 4;
  c.stroke();
  c.strokeStyle = '#f0cf8a';
  c.lineWidth = 2;
  c.stroke();
  c.restore();
}

export const SEL_COLOR = '#f4ead2', SEL_HINT = '#e8c372'; // selected / will be selected when the box is released
