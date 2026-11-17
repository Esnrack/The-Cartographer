// Data stored only in this browser (IndexedDB):
//  - 'terrain-cache': already computed terrain, to reopen the last map without redoing the math.
//    Each entry stores what identifies it (the reader checks it before use).
//  - 'user-assets': engravings the user added through the site ({ id, name, blob, added }).
// Failures (no IndexedDB, private mode, quota full) make the cache be ignored;
// the user's own engravings show the error to the user.

const DB = 'the-cartographer', STORE = 'terrain-cache', USER = 'user-assets';
let dbp = null;

function db() {
  dbp ||= new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      if (!d.objectStoreNames.contains(USER)) d.createObjectStore(USER, { keyPath: 'id' });
    };
    r.onsuccess = () => {
      // 'noise' (88 MB on a big map) was stored by an older version: recomputing is faster
      try { r.result.transaction(STORE, 'readwrite').objectStore(STORE).delete('noise'); } catch { /* ignore */ }
      ok(r.result);
    };
    r.onerror = () => fail(r.error);
  });
  return dbp;
}

// Resolves with req's result (or rejects) once the transaction finishes writing.
function run(store, mode, fn) {
  return db().then((d) => new Promise((ok, fail) => {
    const tx = d.transaction(store, mode), req = fn(tx.objectStore(store));
    tx.oncomplete = () => ok(req?.result);
    tx.onerror = tx.onabort = () => fail(tx.error);
  }));
}

export const cacheGet = (key) => run(STORE, 'readonly', (s) => s.get(key)).catch(() => undefined);
export const cachePut = (key, value) => run(STORE, 'readwrite', (s) => s.put(value, key)).catch(() => {});

export const userAssetsAll = () => run(USER, 'readonly', (s) => s.getAll()).catch(() => []);
export const userAssetPut = (rec) => run(USER, 'readwrite', (s) => s.put(rec));
export const userAssetDelete = (id) => run(USER, 'readwrite', (s) => s.delete(id));
