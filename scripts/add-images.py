#!/usr/bin/env python3
"""Registers in public/assets/manifest.json the new images found in public/assets.

Each image not yet in the manifest becomes an engraving in its folder's category
(a folder already used by another category goes into it; otherwise a new category is created).
Then just reload the page. Run again whenever you add images.
"""
import json
import re
import unicodedata
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / 'public' / 'assets'
MANIFEST = ASSETS / 'manifest.json'
EXTS = {'.png', '.svg', '.webp', '.jpg', '.jpeg'}

m = json.loads(MANIFEST.read_text(encoding='utf-8'))
cats = m['categories']
used = {f for c in cats for i in c['items'] for f in i.get('files', [i.get('file')])}
ids = {i['id'] for c in cats for i in c['items']}
# folder -> category that already has items from it
folder_category = {}
for c in cats:
    for i in c['items']:
        folder_category.setdefault(str(Path(i.get('file') or i['files'][0]).parent), c)

added = 0
for f in sorted(ASSETS.rglob('*')):
    rel = f.relative_to(ASSETS).as_posix()
    if f.suffix.lower() not in EXTS or rel in used:
        continue
    folder = str(Path(rel).parent)
    cat = folder_category.get(folder)
    if not cat:
        cat = {'name': folder.replace('/', ' / ').replace('-', ' ').capitalize(), 'items': []}
        cats.append(cat)
        folder_category[folder] = cat
    ascii_name = unicodedata.normalize('NFKD', f.stem).encode('ascii', 'ignore').decode()
    base = re.sub(r'[^a-z0-9]+', '-', ascii_name.lower()).strip('-') or 'engraving'
    iid, n = base, 2
    while iid in ids:
        iid, n = f'{base}-{n}', n + 1
    ids.add(iid)
    cat['items'].append({'id': iid, 'name': f.stem.replace('_', ' '), 'file': rel, 'width': 60})
    print(f'+ {rel}  ->  {cat["name"]}')
    added += 1

if added:
    MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{added} imagem(ns) nova(s) adicionada(s) ao manifest.json.')
