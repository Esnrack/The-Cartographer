# The Cartographer

**English** · [Português](README.pt-BR.md)

**Try it online: [cartographer.esnrack.com.br](https://cartographer.esnrack.com.br)**

A fantasy map editor in the browser, in the style of Inkarnate: you paint the land and the
program draws the coastal waves, sea depth, textures and aged paper on its own. No build step,
and it works offline except for the fonts, which come from Google Fonts.

## Running it

**With Docker** (locally or on a server):

```sh
docker compose up -d --build
# open http://localhost:8080
```

The site (`public/`) and the nginx config (`server/`) are mounted as volumes, so updates need no
rebuild and don't take the site down:

```sh
git pull                                                   # site files: served right away
docker compose exec the-cartographer nginx -s reload       # only if server/nginx.conf or security-headers.conf changed
docker compose restart proxy                               # only if server/server.py changed (Nextcloud pauses ~1 s)
```

`docker compose up -d --build` is only needed after changing the `Dockerfile` or `docker-compose.yml`.

**Without Docker** (needs Python 3):

```sh
./start.sh          # or: PORT=3000 ./start.sh
# open http://localhost:8080
```

Both only answer **on this computer** (`127.0.0.1`). To serve your network or the internet on purpose:
in `docker-compose.yml` change `"127.0.0.1:8080:80"` to `"8080:80"`; with `start.sh`, set `HOST=0.0.0.0`
(in `.env` or `HOST=0.0.0.0 ./start.sh`). Publish through Docker: nginx adds the security headers
(`server/security-headers.conf`) and rate-limits the Nextcloud proxy.

Opening `index.html` straight from the file manager **does not work**: on `file://` the browser
blocks JavaScript modules and reading `manifest.json`. Any static server works (nginx, Apache,
`npx serve public`…), but then the **Nextcloud** option doesn't: it needs the `server/server.py`
proxy, which runs in Docker and in `start.sh`.

## Tools

On the first visit a step-by-step **Tutorial** shows how to build a map (skip it at any time, or press `Esc`); the **Tutorial** button in the top bar opens it again.


| Tool | Key | Use |
|---|---|---|
| Brush | `B` | Paints terrain. **Bucket** mode (in the panel) fills a whole region. **Water** erases land. "Roughness" makes a jagged coastline. "Paint over land only" changes the type (e.g. grass → snow) without touching the coast. |
| Engraving | `S` | Places mountains, trees, cities… With "Scatter while dragging" you paint forests and mountain ranges. |
| Text | `T` | Names of kingdoms, seas and cities. Supports several lines. |
| Expand | `E` | Drag the handles on the edges to enlarge the map. |
| Select | `V` | Click, `Shift`+click or a box (dragging on empty space) to select. Move, resize, rotate, flip, duplicate (`Ctrl+D`), copy and paste (`Ctrl+C` / `Ctrl+V`) and delete (`Delete`). |

Pan the view: middle or right button, or hold `Space`. The mouse wheel zooms; `Ctrl`+wheel (or `[` / `]`) changes the brush or engraving size (the radius, when scattering).

`Ctrl+Z` / `Ctrl+Y` undo and redo, and `Ctrl+S` saves.

## Starting from a sketch

In **Reference image**, load a drawing or a map (even a photo of a paper sketch):

- **Show over the map**: trace over it with the brush.
- **Convert to terrain**: detects water (bluish tones), land (greens and yellows) and snow
  (white) by color. Then just touch up the details with the brush.

Create the map with the same aspect ratio as the image (e.g. 4:3) so it fills the whole map.

## Changing the images (engravings)

The engravings come from the packs listed in [Engraving credits](#engraving-credits). To add your own:

1. Put the image (PNG with a transparent background, or SVG) in `public/assets/…`.
2. Run `python3 scripts/add-images.py` (`start.sh` already does this on start) and reload the page. It registers every new image in the manifest, in its folder's category. To adjust the name, size etc., edit `public/assets/manifest.json`:

```json
{ "id": "oak", "name": "Oak", "name_pt": "Carvalho", "file": "vegetacao/carvalho.png", "width": 40 }
```

| Field | Meaning |
|---|---|
| `id` | Unique identifier, saved in the project. If you only swap the file and keep the `id`, existing maps start using the new image. |
| `name` | Name shown in the library (in English). Also applies to categories. |
| `name_pt` | Name in Portuguese (optional; without it, `name` is shown). Also applies to categories. |
| `file` | Path relative to `assets/`. |
| `width` | Default width on the map, in pixels. The height follows the image's aspect ratio. |
| `anchor` | `"base"` (default: the image "stands" on the clicked point) or `"center"` (bridges, ships, compass roses). |
| `tags` | Keywords for the library search, separated by spaces (e.g. `"arvore floresta tree"`). Accents and case don't matter. |
| `files` | Instead of `file`: a list of variants. Each placed engraving picks one at random (or pick a fixed one under **Variant**, in the engraving panel). |
| `color` | `"sample"`: the image's white takes the color of the terrain where the engraving is placed (as in Wonderdraft). |
| `colors` | `["#c1", "#c2", "#c3"]`: the red, green and blue parts of the image become these colors (Wonderdraft "custom colors" assets). |

You can create new categories freely. In SVGs, include `width` and `height` on the `<svg>` tag;
without them, some browsers don't know the image size.

**Style tip:** hand-drawn engravings, with a dark outline and shading on one side only, fit the
style best. There are free (CC0 or CC-BY) cartography asset packs on sites like itch.io and
OpenGameArt. Check each one's license.

## Engraving credits

| Folder | Pack | License | On the public site? |
|---|---|---|---|
| `assets/ta/` | [T.A.'s Mapmaking Kit](https://cartographyassets.com/assets/104264/ta-mapmaking-kit/) ([T.A. Maps](https://www.patreon.com/tamaps)) | own license; use on the site **authorized by the author** | yes, with visible credit (already on the page) |
| `assets/comigo/` | [Fantasy Icons Ink](https://comigo.itch.io/fantasy-icons-ink) (CoMiGo) | CC0 | yes |
| `assets/generated/` | generated by `scripts/generate-mountains.py` | free | yes |

CoMiGo ships its license file in the folder.

## Expanding the map

With the **Expand** tool (`E`), drag the golden handles on the map edges (as in Paint) to enlarge it in any direction and add new continents or islands. Terrain and objects already drawn stay where they are, the new area starts as water, and `Ctrl+Z` undoes it. Limit: 8000 px per side.

## Planet

**Planet** (top bar) shows the map as a globe, and you can paint and place engravings directly on it. The right or middle button rotates the planet, the wheel zooms at the center (with `Shift`, zooming in rotates the planet toward the point under the mouse) and **Fit to screen** returns to the normal size. The map is treated as an equirectangular projection: the width wraps all the way around the planet and the height goes from pole to pole, so use a **2:1** ratio (e.g. 4000 × 2000) so nothing gets stretched. Near the poles the brush paints a narrower area, as on any flat world map. Texts can be edited with a double click, as on the flat map, and **Export PNG** still produces the flat map.

## Saving and exporting

- **Save** and **Open** show the destinations: **On this device** downloads (or opens) a `map.the-cartographer.json` with terrain, engravings, texts and style; **Nextcloud**, **Google Drive** and **OneDrive** use the cloud (below).
- The browser also keeps the last map automatically (localStorage).
- **Export PNG** produces the final image at 1× or 2×. 2× makes engravings and texts sharper.

## Nextcloud

The **Nextcloud** option (in **Save** or **Open**) saves and opens maps in the `Mapas` folder of a Nextcloud account.
Each person types the address of their own Nextcloud (e.g. `https://cloud.example.com`); the browser
remembers the last one used. Nothing needs to be configured on the site's server.

- **Connect** opens Nextcloud's own login page in a new tab. After you authorize it, Nextcloud
  creates an app password for that browser only. The site never sees the account password and
  stores no credentials on the server: people without a Nextcloud account don't store anything.
- **Disconnect** revokes that app password. It also shows up (and can be revoked) in Nextcloud
  under Settings → Security → Devices & sessions.
- Since the address is typed by whoever uses the site, the proxy (`server.py`) only connects to
  HTTPS addresses on port 443 whose IP is public: no `localhost`, internal network or cloud metadata.
  It connects to the IP it checked, doesn't follow redirects, limits responses to 20 MB and never
  lets a response become a page in the browser. The site only opens the login page if it belongs to
  the typed address itself. `python3 tests/test_server.py` checks these blocks.
  A Nextcloud that is only on the local network (e.g. `192.168.…`) or on another port is not accepted.
- The proxy (`server.py`) only lets through the login, `.json` files up to 20 MB inside `Mapas`
  (list, open, save and create the folder) and the revocation. Deleting files or reaching any other
  Nextcloud folder through the site is blocked.
- To isolate it further, create a Nextcloud user just for the maps (with a small quota), connect the
  site with it, and then share the `Mapas` folder with your personal account.

## Google Drive and OneDrive

**Save** and **Open** also offer Google Drive and OneDrive. Login happens in a pop-up from the
service itself and the site talks directly to its API (nothing goes through the site's server). The
site only sees the maps it saved itself: on Drive, the `Mapas` folder (`drive.file` scope); on
OneDrive, the app's folder under `Apps/` (`Files.ReadWrite.AppFolder` scope). The connection lasts
about 1 hour; after that the site asks you to connect again.

Both services only accept registered sites. Register the site once and put the IDs in `.env`
(kept out of git; template in `.env.example`) as `GOOGLE_CLIENT_ID` and `ONEDRIVE_CLIENT_ID`.
`server/server.py` generates `js/storage/cloud-config.js` with them in `start.sh` and in Docker;
restart after changing `.env`. These IDs are not passwords: the browser has to receive them, so
anyone who opens the site can see them; `.env` only keeps them out of the repository. Without them,
the option still appears but says it isn't configured.
The redirect address is the site's address followed by `oauth.html`, e.g. `https://maps.example.com/oauth.html`
(for local testing: `http://localhost:8080/oauth.html`).

- **Google Drive** ([console.cloud.google.com](https://console.cloud.google.com/)): create a project,
  enable the **Google Drive API**, set up the OAuth consent screen and, under
  *Credentials → Create credentials → OAuth client ID*, choose **Web application**. In
  *Authorized JavaScript origins* put the site's origin (`https://maps.example.com`) and in
  *Authorized redirect URIs* the `oauth.html` address. Copy the *Client ID* to `GOOGLE_CLIENT_ID` in `.env`.
  While the app is in testing mode, only accounts listed under *Test users* can sign in.
- **OneDrive** ([entra.microsoft.com](https://entra.microsoft.com/) → *App registrations → New registration*):
  under *Supported account types* choose accounts in any organizational directory **and personal Microsoft accounts**;
  under *Redirect URI* choose the **Single-page application (SPA)** platform and put the `oauth.html` address.
  Copy the *Application (client) ID* to `ONEDRIVE_CLIENT_ID` in `.env`. Under *API permissions*, add
  `Files.ReadWrite.AppFolder` and `User.Read` (Microsoft Graph, delegated).
  Personal accounts can no longer register apps outside a directory: if Entra says so, create one
  first through a free Azure account.

## Languages

The interface is available in Portuguese and English (selector in the corner of the top bar; the
choice is saved in the browser). The texts live in `public/js/i18n.js`: in the HTML, each text has a
`data-i18n` tag with its key, and the code uses `t('key')`. To add a language, copy the `pt` block of
the dictionary and translate it. Names of engravings, categories, terrains and palettes use `name`
(English) and `name_pt` (Portuguese).

## Customizing the style

- Color palettes: `public/js/map/palettes.js`. Copy a block to create your own.
- Terrain types: `TERRAIN_TYPES`, in the same file. The `id` is the value saved in the project, so don't reuse an id with another meaning.
- Text fonts: the `FONTS` list in `public/js/main.js` and the Google Fonts link in `index.html`.

## Structure

```
public/                 the site (static files)
  index.html, oauth.html (Google Drive/OneDrive login return), css/, assets/
  js/main.js            editor: state, tools, history, drawing, open/save, autosave
  js/i18n.js            interface texts in Portuguese and English
  js/map/               the map itself
    terrain.js          terrain grid, brush, bucket, coast, waves and shading
    edt.js, noise.js    distance to the coast and noise (textures)
    palettes.js         colors and terrain types
    objects.js          drawing engravings and texts
    assets.js           engraving library (manifest.json and the user's own)
    globe.js            planet (WebGL) and screen <-> map conversion
    project.js          terrain <-> PNG inside the project file
  js/storage/           where maps are kept
    cache.js            IndexedDB: computed terrain and the user's engravings
    nextcloud.js, gdrive.js, onedrive.js   clouds (same interface)
    oauth.js            pop-up login for Google Drive and OneDrive
    cloud-config.js     app IDs (generated by the server from .env)
  js/workers/           heavy work off the page
    pool.js             splits a task into bands across several workers
    tasks-worker.js     terrain noise and paper texture
    encode-worker.js    terrain -> PNG for autosave and saving
  js/ui/
    cloud-dialog.js     cloud window (Save/Open)
    selection.js        selection outlines and selection box
    tour.js             step-by-step tutorial
server/
  server.py             local server (start.sh) and Nextcloud proxy (Docker)
  nginx.conf            nginx configuration in Docker (rate limit for the proxy)
  security-headers.conf CSP and other security headers added by nginx
scripts/
  add-images.py         registers new images from public/assets in manifest.json
  generate-mountains.py generates the mountains in assets/generated
tests/                  npm test runs both
  test_terrain_math.js  optimized terrain math vs. direct versions
  test_server.py        addresses and paths the proxy must refuse
Dockerfile, docker-compose.yml, start.sh, .env.example
```

## License

The source code is under the [MIT License](LICENSE). The engravings in `public/assets/ta/` (T.A. Maps,
used with permission) and `public/assets/comigo/` (CC0) keep their own licenses and are not covered by
it; see [Engraving credits](#engraving-credits) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
