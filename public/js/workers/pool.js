// Workers for heavy math (tasks-worker.js): each task is split into row bands,
// one per worker, and runs in parallel with the page.
const POOL_SIZE = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
let pool = null, taskId = 0;
// Runs msg over bands of [0, rows) (multiples of 64 rows). Resolves with the replies (with .from);
// rejects if there are no workers or any fails (the caller falls back to plan B).
export function splitOnPool(msg, rows) {
  return new Promise((resolve, reject) => {
    try {
      pool ||= Array.from({ length: POOL_SIZE }, () => new Worker(new URL('./tasks-worker.js', import.meta.url), { type: 'module' }));
    } catch (err) { reject(err); return; }
    const id = ++taskId, band = Math.ceil(rows / pool.length / 64) * 64, out = [];
    let pending = 0;
    const cleanup = () => pool.forEach((wk) => { wk.removeEventListener('message', onMsg); wk.removeEventListener('error', onErr); });
    const onErr = (err) => { cleanup(); reject(err); };
    const onMsg = ({ data: m }) => {
      if (m.id !== id) return;
      if (m.error) { onErr(new Error(m.error)); return; }
      out.push(m);
      if (--pending === 0) { cleanup(); resolve(out); }
    };
    pool.forEach((wk, k) => {
      const from = k * band, to = Math.min(rows, from + band);
      if (from >= to) return;
      pending++;
      wk.addEventListener('message', onMsg);
      wk.addEventListener('error', onErr);
      wk.postMessage({ ...msg, id, from, to });
    });
  });
}
