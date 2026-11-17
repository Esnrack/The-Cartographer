// Maps on OneDrive (personal and work/school accounts), straight from the page via Microsoft Graph.
// Files.ReadWrite.AppFolder scope: the site only sees its own folder (Apps/<app name>), nothing else.
// Login in Microsoft's pop-up with code + PKCE (no secret on the site); the token lasts ~1 h.
import { t } from '../i18n.js';
import { ONEDRIVE_CLIENT_ID } from './cloud-config.js';
import { authorize, pkce, redirectUri, tokenStore } from './oauth.js';

export const name = 'OneDrive';
export const configured = () => !!ONEDRIVE_CLIENT_ID;
const store = tokenStore('the-cartographer:onedrive');
const LOGIN = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0/me';
const SCOPE = 'Files.ReadWrite.AppFolder User.Read';

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
  const { verifier, challenge } = await pkce();
  const url = new URL(`${LOGIN}/authorize`);
  for (const [k, v] of Object.entries({ client_id: ONEDRIVE_CLIENT_ID, response_type: 'code', response_mode: 'fragment',
    scope: SCOPE, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' })) url.searchParams.set(k, v);
  const p = await authorize(url);
  const r = await fetch(`${LOGIN}/token`, {
    method: 'POST',
    body: new URLSearchParams({ client_id: ONEDRIVE_CLIENT_ID, grant_type: 'authorization_code', code: p.get('code'),
      redirect_uri: redirectUri(), code_verifier: verifier, scope: SCOPE }),
  });
  const tok = await r.json();
  if (!r.ok || !tok.access_token) throw new Error(tok.error_description || t('oauth_failed', { p: name, s: r.status }));
  store.set({ token: tok.access_token, exp: Date.now() + Number(tok.expires_in || 3600) * 1000, user: name });
  try {
    const me = await (await api(`${GRAPH}?$select=userPrincipalName,mail`)).json();
    store.set({ ...store.get(), user: me.mail || me.userPrincipalName || name });
  } catch { /* without the e-mail, just show "OneDrive" */ }
  return currentUser();
}

// Microsoft has no way to revoke a token from the browser: forget it here and it expires on its own (~1 h).
export async function disconnect() {
  store.clear();
}

// Maps (.json) in the app folder, newest first.
export async function listMaps() {
  const r = await api(`${GRAPH}/drive/special/approot/children?$select=id,name,lastModifiedDateTime&$top=500`);
  return ((await r.json()).value || [])
    .filter((f) => f.name.toLowerCase().endsWith('.json'))
    .map((f) => ({ id: f.id, name: f.name, data: new Date(f.lastModifiedDateTime) }))
    .sort((a, b) => b.data - a.data);
}

export async function openMap(m) {
  return (await api(`${GRAPH}/drive/items/${encodeURIComponent(m.id)}/content`)).json();
}

// shortcut: Graph simple upload accepts up to 4 MB; a bigger map needs a chunked upload (createUploadSession).
export async function saveMap(fileName, project) {
  await api(`${GRAPH}/drive/special/approot:/${encodeURIComponent(fileName)}:/content`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project),
  });
}
