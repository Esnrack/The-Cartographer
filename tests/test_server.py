"""Addresses and paths the Nextcloud proxy must refuse. Run: python3 tests/test_server.py"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'server'))
import server  # noqa: E402
from server import allowed, cloud_config, is_nextcloud, nextcloud_target as alvo  # noqa: E402

for ruim in ['http://1.1.1.1', 'https://127.0.0.1', 'https://localhost', 'https://10.0.0.5', 'https://192.168.1.10',
             'https://169.254.169.254', 'https://1.1.1.1:8443', 'https://user:pw@1.1.1.1', 'https://1.1.1.1/../x',
             'https://1.1.1.1?x', 'https://[::1]', 'https://0.0.0.0', 'https://localtest.me', '', None]:
    assert alvo(ruim) is None, ruim
assert alvo('https://1.1.1.1') == ('1.1.1.1', '', '1.1.1.1')
assert alvo('https://1.1.1.1/nextcloud/')[1] == '/nextcloud'

MAPAS = '/nextcloud/remote.php/dav/files/ana/Mapas'
for metodo, caminho in [('POST', '/nextcloud/index.php/login/v2'), ('POST', '/nextcloud/login/v2/poll'),
                        ('PROPFIND', MAPAS + '/'), ('MKCOL', MAPAS), ('GET', MAPAS + '/mapa.json'), ('PUT', MAPAS + '/meu mapa.json'),
                        ('DELETE', '/nextcloud/ocs/v2.php/core/apppassword')]:
    assert allowed(metodo, caminho), (metodo, caminho)
for metodo, caminho in [('DELETE', MAPAS + '/mapa.json'), ('GET', MAPAS + '/foto.png'), ('GET', '/nextcloud/remote.php/dav/files/ana/Fotos/a.json'),
                        ('GET', MAPAS + '/../Fotos/a.json'), ('GET', MAPAS + '/sub/a.json'), ('GET', '/nextcloud/status.php'),
                        ('GET', '/nextcloud/index.php/login/v2'), ('PUT', MAPAS + '/./a.json'), ('MOVE', MAPAS + '/a.json')]:
    assert not allowed(metodo, caminho), (metodo, caminho)

# IDs from .env become cloud-config.js; an ID with quotes or ';' (JS injection) becomes empty
os.environ.update(GOOGLE_CLIENT_ID='123-abc.apps.googleusercontent.com', ONEDRIVE_CLIENT_ID="x'; alert(1); '")
cfg = cloud_config()
assert 'export const GOOGLE_CLIENT_ID = "123-abc.apps.googleusercontent.com";' in cfg, cfg
assert 'export const ONEDRIVE_CLIENT_ID = "";' in cfg, cfg

# Only targets that answer status.php like a Nextcloud are proxied (no open relay); answers are cached
calls = []
NC = {'installed': True, 'maintenance': False, 'version': '30.0.1.2', 'versionstring': '30.0.1', 'productname': 'MinhaNuvem'}
replies = {'nc.example': NC, 'site.example': None, 'fake.example': {'installed': True}, 'html.example': None}
server.fetch_status = lambda host, prefix, ip: (calls.append(host), replies[host])[1]
assert is_nextcloud('nc.example', '', '1.1.1.1')            # rebranded Nextcloud still counts
assert not is_nextcloud('site.example', '', '1.1.1.1')      # ordinary site (status.php missing)
assert not is_nextcloud('fake.example', '', '1.1.1.1')      # only part of the fields
assert is_nextcloud('nc.example', '', '1.1.1.1') and calls.count('nc.example') == 1  # second time comes from the cache
print('ok')
