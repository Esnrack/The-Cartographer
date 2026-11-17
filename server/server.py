#!/usr/bin/env python3
"""Local server for The Cartographer: files from public/ + a restricted proxy for Nextcloud.

Used by start.sh and, in Docker, as the "proxy" service behind nginx. Each user
types their own Nextcloud address on the site; it arrives in the X-Nextcloud-Server header.
So a typed address cannot become a gateway to other places:
- HTTPS on port 443 only, no user/password in the URL;
- the name is resolved here and every IP must be public (no localhost, internal
  network, cloud metadata), and the connection goes to the already checked IP (no DNS rebinding);
- redirects are not followed; response capped at 20 MB;
- only login (Login Flow v2), .json files in the Mapas folder and app password revocation
  pass (ALLOWED; in Docker nginx forwards all of /nextcloud/ here); the browser never treats the response as a page.
The site stores no password: each user signs in with their own Nextcloud account.

Also generates /js/storage/cloud-config.js with the Google Drive and OneDrive IDs read from the environment
(GOOGLE_CLIENT_ID, ONEDRIVE_CLIENT_ID; start.sh and docker-compose read them from .env), so they
are not committed to the repository. They are not secrets: the browser needs to receive them.

Environment variables: PORT (default 8080), GOOGLE_CLIENT_ID, ONEDRIVE_CLIENT_ID.
"""
import http.client
import ipaddress
import json
import os
import re
import socket
import ssl
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, unquote, urlsplit

PORT = int(os.environ.get('PORT', '8080'))
MAX_BYTES = 20 * 1024 * 1024
ALLOWED = [
    ({'POST'}, re.compile(r'^/nextcloud/(index\.php/)?login/v2(/poll)?$')),
    ({'GET', 'PUT', 'PROPFIND', 'MKCOL'}, re.compile(r'^/nextcloud/remote\.php/dav/files/[^/]+/Mapas(/[^/]+\.json)?/?$')),
    ({'DELETE'}, re.compile(r'^/nextcloud/ocs/v2\.php/core/apppassword$')),
]
FORWARD_HEADERS = ('Authorization', 'Content-Type', 'Depth', 'OCS-APIRequest', 'Accept')
SAFE_TYPES = ('application/json', 'application/xml', 'text/xml')
# https://host.example.com[/subpath] (the subpath is for Nextcloud installed under /nextcloud etc.)
SERVER_RE = re.compile(r'^https://([a-z0-9-]+(?:\.[a-z0-9-]+)+)((?:/[a-z0-9_~-][a-z0-9._~-]*)*)/?$', re.I)


CLIENT_ID_RE = re.compile(r'^[A-Za-z0-9._-]{1,200}$')


def cloud_config():
    """Contents of /js/storage/cloud-config.js. An ID with an odd character becomes empty (it goes inside JS)."""
    ids = {k: os.environ.get(k, '').strip() for k in ('GOOGLE_CLIENT_ID', 'ONEDRIVE_CLIENT_ID')}
    return ''.join(f'export const {k} = {json.dumps(v if CLIENT_ID_RE.match(v) else "")};\n' for k, v in ids.items())


def allowed(method, path):
    """Is the request (method and already decoded path) on the list of what may go to Nextcloud?"""
    parts = path.split('/')
    return '..' not in parts and '.' not in parts and any(method in methods and rule.match(path) for methods, rule in ALLOWED)


def nextcloud_target(server):
    """(name, subfolder, ip) of the typed Nextcloud, or None if the address is not allowed."""
    m = SERVER_RE.match(server or '')
    if not m:
        return None
    host, prefix = m[1].lower(), m[2]
    try:
        ips = {a[4][0] for a in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
    except OSError:
        return None
    for ip in ips:
        addr = ipaddress.ip_address(ip.split('%')[0])
        addr = getattr(addr, 'ipv4_mapped', None) or addr
        if not addr.is_global or addr.is_multicast:
            return None
    return host, prefix, sorted(ips, key=lambda i: ':' in i)[0]  # IPv4 first: Docker without IPv6 used to fail


class PinnedHTTPS(http.client.HTTPSConnection):
    """HTTPS that connects to the already checked IP but validates the certificate by name."""
    def __init__(self, host, ip):
        super().__init__(host, 443, timeout=30)
        self.ip, self.ctx = ip, ssl.create_default_context()

    def connect(self):
        self.sock = self.ctx.wrap_socket(socket.create_connection((self.ip, 443), self.timeout), server_hostname=self.host)


class Handler(SimpleHTTPRequestHandler):
    def proxy(self):
        path = unquote(urlsplit(self.path).path)
        if not allowed(self.command, path):
            return self.send_error(403)
        target = nextcloud_target(self.headers.get('X-Nextcloud-Server'))
        if not target:
            return self.send_error(400, 'Endereço do Nextcloud inválido ou não permitido')
        host, prefix, ip = target
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            return self.send_error(400)
        if not 0 <= length <= MAX_BYTES:  # negative: read(-1) would read without limit
            return self.send_error(413)
        body = self.rfile.read(length) if length else None
        headers = {h: self.headers[h] for h in FORWARD_HEADERS if self.headers.get(h)}
        conn = PinnedHTTPS(host, ip)
        try:
            conn.request(self.command, prefix + quote(path[len('/nextcloud'):]), body=body, headers=headers)
            response = conn.getresponse()
            data = response.read(MAX_BYTES + 1)
        except (OSError, http.client.HTTPException) as e:
            return self.send_error(502, f'Nextcloud inacessível: {e}')
        finally:
            conn.close()
        if len(data) > MAX_BYTES:
            return self.send_error(502, 'Resposta grande demais')
        ctype = response.headers.get('Content-Type', '')
        self.send_response(response.status)
        self.send_header('Content-Type', ctype if ctype.split(';')[0].strip() in SAFE_TYPES else 'application/octet-stream')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; sandbox")
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith('/nextcloud/'):
            return self.proxy()
        if urlsplit(self.path).path == '/js/storage/cloud-config.js':
            data = cloud_config().encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        return super().do_GET()

    def do_HEAD(self):
        if self.path.startswith('/nextcloud/'):
            return self.send_error(403)
        return super().do_HEAD()

    do_POST = do_PUT = do_PROPFIND = do_MKCOL = do_DELETE = proxy


if __name__ == '__main__':
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public')
    print(f'Abra http://localhost:{PORT} no navegador (Ctrl+C para parar).')
    ThreadingHTTPServer(('', PORT), partial(Handler, directory=root)).serve_forever()
