// Maps on Nextcloud via WebDAV, always through the site's own /nextcloud/ proxy
// (Nextcloud does not allow CORS; the proxy only lets through login, the Mapas folder and logout).
// The user types their own Nextcloud address; it goes in the X-Nextcloud-Server header
// and the proxy (server.py) only connects to public HTTPS addresses.
// Login uses Login Flow v2: the user signs in on their own Nextcloud page and it generates an
// app password just for this browser. Without a Nextcloud account nothing is saved.

import { t } from '../i18n.js';

export const name = 'Nextcloud';
export const configured = () => true;
const BASE = 'nextcloud';
const FOLDER = 'Mapas';
const KEY = 'the-cartographer:nextcloud';
const SERVER_KEY = 'the-cartographer:nextcloud-server'; // last typed address

// Credentials always stored with the server that issued them: the password only goes to it.
function credentials() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    return c?.server && c.loginName && c.appPassword ? c : null;
  } catch { return null; }
}

export const currentUser = () => credentials()?.loginName || null;
export const currentServer = () => credentials()?.server || localStorage.getItem(SERVER_KEY) || '';

// "https://nuvem.exemplo.com/" -> "https://nuvem.exemplo.com"; '' if it is not a plain HTTPS address.
export function normalizeServer(text) {
  let u;
  if (!/^https:\/\//i.test(text.trim())) return ''; // https:// is required
  try { u = new URL(text.trim()); } catch { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || !u.hostname.includes('.')) return '';
  return u.origin + u.pathname.replace(/\/+$/, '');
}

function basicAuth(c) {
  const bytes = new TextEncoder().encode(`${c.loginName}:${c.appPassword}`);
  return 'Basic ' + btoa(String.fromCharCode(...bytes));
}

const folderUrl = () => `${BASE}/remote.php/dav/files/${encodeURIComponent(credentials().loginName)}/${FOLDER}/`;

async function request(method, url, opts = {}) {
  const c = credentials();
  if (!c) throw new Error(t('nc_not_connected'));
  const r = await fetch(url, { ...opts, method, headers: { ...opts.headers, Authorization: basicAuth(c), 'X-Nextcloud-Server': c.server } });
  if (r.status === 401) {
    localStorage.removeItem(KEY);
    throw new Error(t('nc_expired'));
  }
  if (r.status === 403) throw new Error(t('nc_denied'));
  return r;
}

// Opens the Nextcloud login in a new tab and waits for the user to authorize.
export async function connect(typed) {
  const server = normalizeServer(typed);
  if (!server) throw new Error(t('nc_bad_server'));
  localStorage.setItem(SERVER_KEY, server);
  const via = { 'X-Nextcloud-Server': server };
  const tab = window.open('', '_blank'); // opened right on click, so the pop-up blocker does not stop it
  if (tab) tab.opener = null; // the server's page must not touch this tab
  try {
    const r = await fetch(`${BASE}/index.php/login/v2`, { method: 'POST', headers: via });
    if (r.status === 501 || r.status === 405) throw new Error(t('nc_no_proxy'));
    if (r.status === 400) throw new Error(t('nc_bad_server'));
    if (r.status === 502 || r.status === 503) throw new Error(t('nc_unreachable'));
    if (!r.ok) throw new Error(t('nc_unavailable', { s: r.status }));
    const { poll, login } = await r.json();
    // Only open the login if it is an HTTPS page on the typed server itself
    // (a malicious server could send a "javascript:" URL or another site).
    const loginUrl = new URL(login, server);
    if (loginUrl.protocol !== 'https:' || loginUrl.origin !== new URL(server).origin || typeof poll?.token !== 'string') {
      throw new Error(t('nc_bad_server'));
    }
    if (tab) tab.location = loginUrl.href; else window.open(loginUrl.href, '_blank', 'noopener');
    const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((ok) => setTimeout(ok, 2000));
      const p = await fetch(`${BASE}/index.php/login/v2/poll`, { method: 'POST', headers: via, body: new URLSearchParams({ token: poll.token }) });
      if (p.ok) {
        const { loginName, appPassword } = await p.json();
        if (typeof loginName !== 'string' || typeof appPassword !== 'string') throw new Error(t('nc_bad_server'));
        localStorage.setItem(KEY, JSON.stringify({ server, loginName, appPassword }));
        try { tab?.close(); } catch { /* the tab may already be closed */ }
        return loginName;
      }
      if (tab && tab.closed) throw new Error(t('nc_cancelled'));
    }
    throw new Error(t('nc_timeout'));
  } catch (err) {
    try { tab?.close(); } catch { /* ignore */ }
    throw err;
  }
}

// Revokes the app password on Nextcloud (it leaves the sessions list) and forgets the credentials.
export async function disconnect() {
  try {
    await request('DELETE', `${BASE}/ocs/v2.php/core/apppassword`, { headers: { 'OCS-APIRequest': 'true' } });
  } catch { /* even if it fails, forget locally */ }
  localStorage.removeItem(KEY);
}

// Maps (.json) in the Mapas folder, newest first.
export async function listMaps() {
  const r = await request('PROPFIND', folderUrl(), { headers: { Depth: '1' } });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(t('nc_list_failed', { s: r.status }));
  const xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
  const davText = (el, tag) => el.getElementsByTagNameNS('DAV:', tag)[0]?.textContent;
  return [...xml.getElementsByTagNameNS('DAV:', 'response')]
    .map((el) => {
      const mod = davText(el, 'getlastmodified');
      return { name: decodeURIComponent(davText(el, 'href').replace(/\/$/, '').split('/').pop()), data: mod ? new Date(mod) : null };
    })
    .filter((f) => f.name.toLowerCase().endsWith('.json'))
    .sort((a, b) => (b.data || 0) - (a.data || 0));
}

export async function openMap(m) {
  const r = await request('GET', folderUrl() + encodeURIComponent(m.name));
  if (!r.ok) throw new Error(t('nc_open_failed', { name: m.name, s: r.status }));
  return r.json();
}

export async function saveMap(name, project) {
  await request('MKCOL', folderUrl()); // creates the Mapas folder if missing (405 = already exists)
  const r = await request('PUT', folderUrl() + encodeURIComponent(name), {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!r.ok) throw new Error(t('nc_save_failed', { name, s: r.status }));
}

// File name the proxy accepts: no slashes and ending in .json.
export function validFileName(name) {
  const n = name.trim().replace(/[\\/]/g, '-');
  if (!n) return '';
  return n.toLowerCase().endsWith('.json') ? n : `${n}.json`;
}
