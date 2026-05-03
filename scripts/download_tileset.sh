#!/bin/bash
# Polls PixelLab tileset until ready, then extracts a single 32x32 floor tile
# and saves to public/sprites/floor.png
set -uo pipefail

TILESET_ID="e61ebcde-812b-4e22-9bce-5130baca1fa1"
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
mkdir -p "$SPRITES_DIR"

while true; do
  json=$(curl -fsS --max-time 30 \
    -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/topdown-tilesets/$TILESET_ID" 2>/dev/null || true)
  if [ -z "$json" ]; then
    sleep 20; continue
  fi
  status=$(printf '%s' "$json" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("status",""))')
  if [ "$status" = "completed" ]; then
    img_url=$(printf '%s' "$json" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print(d.get("png_url") or d.get("tileset_png_url") or d.get("image_url") or "")
')
    if [ -n "$img_url" ]; then
      echo "[$(date +%H:%M:%S)] downloading tileset png from $img_url"
      curl -fsS -o "$TMPDIR/tileset.png" "$img_url"
      # Wang tilesets are usually a 4x4 grid of 32x32 tiles. Tile (3,3) bottom-right is "all upper" = solid floor.
      # But we'll just take tile (0,0) of the "upper" terrain section. With transition_size=0 it's all solid stone.
      python3 - "$TMPDIR/tileset.png" "$SPRITES_DIR/floor.png" <<'PY'
import sys
from PIL import Image
src = Image.open(sys.argv[1]).convert("RGBA")
w, h = src.size
print(f"tileset size: {w}x{h}")
# Wang 16-tile sets are typically arranged 4x4. Pick a tile that's all-one-terrain.
# The "all upper" tile is at corner index 15 (bottom-right of grid) for most layouts.
tile = 32
cols = max(1, w // tile)
rows = max(1, h // tile)
# Try a few reasonable offsets and pick a solid one
candidates = [(cols-1, rows-1), (0,0), (cols-1, 0), (0, rows-1)]
chosen = candidates[0]
for cx, cy in candidates:
    crop = src.crop((cx*tile, cy*tile, (cx+1)*tile, (cy+1)*tile))
    if crop.size == (tile, tile):
        chosen = (cx, cy); break
cx, cy = chosen
crop = src.crop((cx*tile, cy*tile, (cx+1)*tile, (cy+1)*tile))
crop.save(sys.argv[2])
print(f"saved {crop.size} from tile ({cx},{cy}) -> {sys.argv[2]}")
PY
      echo "[$(date +%H:%M:%S)] floor tile saved"
      exit 0
    else
      echo "[$(date +%H:%M:%S)] no png_url found in tileset response"
      printf '%s' "$json" | python3 -m json.tool | head -40
      exit 1
    fi
  elif [ "$status" = "failed" ]; then
    echo "[$(date +%H:%M:%S)] tileset failed"
    exit 1
  fi
  sleep 20
done
