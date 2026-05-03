#!/bin/bash
# Polls PixelLab v2 API for character walking animations and downloads frames
# into public/sprites/ with naming: {name}_walk_{direction}_{frame}.png
set -uo pipefail

API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"
TMPJSON=$(mktemp)
trap 'rm -f "$TMPJSON"' EXIT
mkdir -p "$SPRITES_DIR"

NAMES=("knight" "mage" "rogue" "zombie")
IDS=(
  "532755ee-39c8-4a89-8394-155e22b2a272"
  "56161a7b-fcfb-4097-8361-359757daabd9"
  "76db7eb1-29f9-48ac-801f-862941a58e03"
  "806f6722-9132-4759-badc-06edeb5a6fbc"
)
DONE=("0" "0" "0" "0")

while true; do
  remaining=0
  for i in 0 1 2 3; do
    if [ "${DONE[$i]}" = "1" ]; then
      continue
    fi
    name="${NAMES[$i]}"
    cid="${IDS[$i]}"

    if ! curl -fsS --max-time 30 \
      -H "Authorization: Bearer $API_KEY" \
      "https://api.pixellab.ai/v2/characters/$cid" -o "$TMPJSON" 2>/dev/null; then
      remaining=$((remaining+1))
      continue
    fi

    if urls=$(python3 - "$TMPJSON" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
anims = [a for a in data.get("animations", []) if a.get("animation_type") == "walking-4-frames"]
if not anims:
    sys.exit(1)
dirs = anims[0].get("directions", [])
have = {d["direction"] for d in dirs if d.get("frames") and len(d["frames"]) >= 4}
if not {"south","north","east","west"} <= have:
    sys.exit(1)
for d in dirs:
    for j, url in enumerate(d["frames"]):
        print(f"{d['direction']} {j} {url}")
PY
    ); then
      saved=0
      while read -r dir frame url; do
        [ -z "$url" ] && continue
        out="$SPRITES_DIR/${name}_walk_${dir}_${frame}.png"
        if curl -fsS --max-time 30 -o "$out" "$url"; then
          saved=$((saved+1))
        fi
      done <<< "$urls"
      echo "[$(date +%H:%M:%S)] saved $saved frames for $name"
      DONE[$i]="1"
    else
      remaining=$((remaining+1))
    fi
  done
  if [ "$remaining" = "0" ]; then
    echo "[$(date +%H:%M:%S)] all character walking animations downloaded"
    exit 0
  fi
  sleep 20
done
