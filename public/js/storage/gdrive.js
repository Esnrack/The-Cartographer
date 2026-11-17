// Maps on Google Drive, straight from the page (Google's API allows CORS; it skips the server).
// drive.file scope: the site only sees the files and folder it created itself, nothing else in Drive.
// Login in Google's pop-up (token flow); the token lasts ~1 h, then it asks to connect again.
import { t } from '../i18n.js';
import { GOOGLE_CLIENT_ID } from './cloud-config.js';
import { authorize, tokenStore } from './oauth.js';

export const name = 'Google Drive';
export const configured = () => !!GOOGLE_CLIENT_ID;
const store = tokenStore('the-cartographer:gdrive');
const API = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'Mapas', FOLDER_TYPE = 'application/vnd.google-apps.folder';

export const currentUser = () => store.get()?.user || null;

async function api(url, opts = {}) {
  const s = store.get();
  if (!s) throw new Error(t('oauth_expired', { p: name }));
  const r = await fetch(url, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${s.token}` } });
  if (r.status === 401) { store.clear(); throw new Error(t('oauth_expired', { p: name })); }
  if (!r.ok) throw new Error(t('oauth_failed', { p: name, s: r.status }));
  return r;
}

export async function connect() {
  if (!configured()) throw new Error(t('oauth_not_configured', { p: name }));
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file');
  const p = await authorize(url);
  store.set({ token: p.get('access_token'), exp: Date.now() + Number(p.get('expires_in') || 3600) * 1000, user: name });
  try {
    const about = await (await api(`${API}/about?fields=user(emailAddress)`)).json();
    store.set({ ...store.get(), user: about.user?.emailAddress || name });
  } catch { /* without the e-mail, just show "Google Drive" */ }
  return currentUser();
}

export async function disconnect() {
  const s = store.get();
  store.clear();
  if (s) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.token)}`, { method: 'POST' }).catch(() => {});
}

const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); // text inside quotes in the Drive query
async function find(query) {
  const url = `${API}/files?q=${encodeURIComponent(`${query} and trashed=false`)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`;
  return (await (await api(url)).json()).files || [];
}

let folderId = null;
async function folder(create) {
  if (folderId) return folderId;
  const [f] = await find(`name='${FOLDER}' and mimeType='${FOLDER_TYPE}' and 'root' in parents`);
  if (f) return (folderId = f.id);
  if (!create) return null;
  const r = await api(`${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: FOLDER_TYPE }) });
  return (folderId = (await r.json()).id);
}

// Maps (.json) in the Mapas folder, newest first.
export async function listMaps() {
  const id = await folder(false);
  if (!id) return [];
  return (await find(`'${id}' in parents`))
    .filter((f) => f.name.toLowerCase().endsWith('.json'))
    .map((f) => ({ id: f.id, name: f.name, data: new Date(f.modifiedTime) }));
}

export async function openMap(m) {
  return (await api(`${API}/files/${encodeURIComponent(m.id)}?alt=media`)).json();
}

export async function saveMap(fileName, project) {
  const id = await folder(true);
  let [f] = await find(`name='${q(fileName)}' and '${id}' in parents`);
  if (!f) {
    const r = await api(`${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: fileName, parents: [id], mimeType: 'application/json' }) });
    f = await r.json();
  }
  await api(`${UPLOAD}/files/${encodeURIComponent(f.id)}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) });
}
