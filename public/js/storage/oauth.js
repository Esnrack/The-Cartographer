// OAuth login in a pop-up, no libraries: the provider redirects the pop-up to oauth.html, which
// passes the response to this tab (BroadcastChannel, same origin) and closes. The random "state"
// ensures the response belongs to this request.
import { t } from '../i18n.js';

export const redirectUri = () => new URL('oauth.html', location.href).href;

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

// PKCE: random verifier and its challenge (SHA-256), to exchange the code without a secret.
export async function pkce() {
  const verifier = rand(48);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(hash) };
}

// Opens url (already with client_id, scope etc.) and resolves with the params returned to oauth.html.
export function authorize(url) {
  const state = rand(16);
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', redirectUri());
  const popup = window.open(url.href, 'oauth', 'popup,width=520,height=680');
  if (!popup) return Promise.reject(new Error(t('oauth_popup_blocked')));
  return new Promise((resolve, reject) => {
    const ch = new BroadcastChannel('the-cartographer-oauth');
    const done = (fn, v) => { clearTimeout(timer); ch.close(); fn(v); };
    ch.onmessage = ({ data }) => {
      const p = new URLSearchParams(data);
      if (p.get('state') !== state) return; // response to another request
      if (p.get('error')) done(reject, new Error(p.get('error_description') || p.get('error')));
      else done(resolve, p);
    };
    // No popup.closed check: Google/Microsoft login pages cut the link to this tab
    // (COOP) and popup.closed would say "closed" right away. No response in 5 min = gave up.
    const timer = setTimeout(() => done(reject, new Error(t('nc_timeout'))), 5 * 60 * 1000);
  });
}

// Token stored in this browser: { token, exp (ms), user }. Expired counts as disconnected.
export function tokenStore(key) {
  const get = () => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v?.token && v.exp > Date.now() + 30000 ? v : null;
    } catch { return null; }
  };
  return {
    get,
    set: (v) => localStorage.setItem(key, JSON.stringify(v)),
    clear: () => localStorage.removeItem(key),
  };
}
