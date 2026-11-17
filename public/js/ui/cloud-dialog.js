// Cloud dialog (Save/Open on Nextcloud, Google Drive and OneDrive): the three modules in
// storage/ share the same interface (name, configured, currentUser, connect, disconnect,
// listMaps, openMap, saveMap), so a single dialog serves all three.
import { t as tr } from '../i18n.js';
import * as nextcloud from '../storage/nextcloud.js';
import * as gdrive from '../storage/gdrive.js';
import * as onedrive from '../storage/onedrive.js';

export const services = { nextcloud, gdrive, onedrive };
const $ = (s) => document.querySelector(s);

let cloudFileName = ''; // cloud file last opened/saved (suggested name when saving)

// Wires up the dialog and returns openCloud(service). What it needs from the editor comes in as parameters.
export function setupCloud({ loadProject, serializeAsync, status }) {
  const dlg = $('#dlg-cloud');
  let cloud = nextcloud;
  const setBusy = (busy) => dlg.querySelectorAll('button[type=button]').forEach((b) => { b.disabled = busy; });
  const showError = (err) => { refresh(false); $('#cloud-status').textContent = err.message; };
  dlg.addEventListener('close', () => setBusy(false)); // closing the dialog releases a login that was left waiting

  async function refresh(listMaps = true) {
    const user = cloud.currentUser(), nc = cloud === nextcloud;
    $('#cloud-disconnected').hidden = !!user;
    $('#cloud-connected').hidden = !user;
    $('#cloud-disconnect').hidden = !user;
    if (nc) $('#cloud-server').value ||= cloud.currentServer().replace(/^https:\/\//, ''); // the https:// stays fixed outside the field
    if (!user) return;
    $('#cloud-status').textContent = tr('cloud_connected_as', { u: user, s: nc ? new URL(cloud.currentServer()).host : cloud.name });
    $('#cloud-name').value ||= cloudFileName || 'map.json';
    if (!listMaps) return;
    const list = $('#cloud-list');
    list.textContent = tr('cloud_loading');
    try {
      const maps = await cloud.listMaps();
      list.textContent = maps.length ? '' : tr('cloud_empty');
      for (const m of maps) {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<span></span><small></small>';
        b.firstChild.textContent = m.name;
        b.lastChild.textContent = m.data ? m.data.toLocaleString() : '';
        b.title = tr('cloud_open_tip');
        b.addEventListener('click', async () => {
          setBusy(true);
          try {
            await loadProject(await cloud.openMap(m));
            cloudFileName = m.name;
            $('#cloud-name').value = m.name;
            dlg.close();
            status(tr('cloud_opened', { name: m.name, p: cloud.name }));
          } catch (err) { showError(err); } finally { setBusy(false); }
        });
        list.appendChild(b);
      }
    } catch (err) { showError(err); }
  }

  const openCloud = (service) => {
    cloud = service;
    const nc = cloud === nextcloud;
    $('#cloud-title').textContent = cloud.name;
    $('#cloud-server-field').hidden = !nc;
    $('#cloud-login-hint').innerHTML = nc ? tr('cloud_login_hint') : tr('oauth_login_hint', { p: cloud.name });
    $('#cloud-save').textContent = tr('cloud_save', { p: cloud.name });
    $('#cloud-status').textContent = cloud.configured() ? tr('cloud_not_connected') : tr('oauth_not_configured', { p: cloud.name });
    $('#cloud-connect').disabled = !cloud.configured();
    $('#cloud-list').textContent = '';
    dlg.showModal();
    refresh();
  };
  $('#cloud-connect').addEventListener('click', async () => {
    setBusy(true);
    $('#cloud-status').textContent = tr('cloud_waiting');
    const server = 'https://' + $('#cloud-server').value.trim().replace(/^https:\/\//i, '');
    try { await cloud.connect(server); await refresh(); } catch (err) { showError(err); } finally { setBusy(false); }
  });
  $('#cloud-disconnect').addEventListener('click', async () => {
    setBusy(true);
    await cloud.disconnect();
    setBusy(false);
    $('#cloud-status').textContent = tr('cloud_disconnected', { p: cloud.name });
    refresh(false);
  });
  $('#cloud-save').addEventListener('click', async () => {
    const name = nextcloud.validFileName($('#cloud-name').value);
    if (!name) return;
    setBusy(true);
    try {
      await cloud.saveMap(name, await serializeAsync());
      cloudFileName = name;
      $('#cloud-name').value = name;
      await refresh();
      $('#cloud-status').textContent = tr('cloud_saved', { name, p: cloud.name });
    } catch (err) { showError(err); } finally { setBusy(false); }
  });
  return openCloud;
}
