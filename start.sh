#!/bin/sh
# Runs The Cartographer locally without Docker (needs Python 3).
PORT="${PORT:-8080}"
cd "$(dirname "$0")" || exit 1
python3 scripts/add-images.py  # registers new images from public/assets
# Google Drive/OneDrive IDs (and other local settings) live in .env, outside git
if [ -f .env ]; then set -a; . ./.env; set +a; fi
export PORT
exec python3 server/server.py  # files from public/ + restricted proxy for Nextcloud
