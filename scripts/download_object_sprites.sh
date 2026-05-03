#!/bin/bash
# Polls PixelLab v2 API for queued projectile + gem objects, downloads each
# when ready to public/sprites/ with the texture key as filename.
# Also auto-queues the 2 remaining gems (gold + epic) when slots free up.
set -uo pipefail

API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"
mkdir -p "$SPRITES_DIR"

# parallel arrays — name : object_id (empty = needs queuing)
NAMES=(
  "proj_fire"
  "proj_lightning"
  "proj_earth"
  "proj_forest"
  "proj_arcane"
  "proj_shadow"
  "gem_blue"
  "gem_green"
  "gem_gold"
  "gem_epic"
)
IDS=(
  "9270f022-6c6b-44ad-95bd-43872e5ad3ab"
  "e04502eb-359f-40f9-9437-0e7f1184559a"
  "4712dd8e-3829-4fca-b6d0-e842937028c1"
  "b729b230-6c16-474b-bd91-73278e1ebcc1"
  "fa0d44a3-c1bb-43d7-80dc-2e28b5430bf8"
  "3bec62f0-f6d4-4d72-a322-a707dcfd853c"
  "17ac35a7-041d-47d1-8feb-312c5249f75b"
  "26e65a47-af7a-4e6b-be7c-332aea39c589"
  ""  # gem_gold to be queued
  ""  # gem_epic to be queued
)
QUEUE_DESC=(
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  "shining gold yellow gem, faceted crystal, simple pixel art XP gem"
  "rare magenta and pink star-shaped gem with sparkles, mythic XP crystal pixel art"
)
DONE=("0" "0" "0" "0" "0" "0" "0" "0" "0" "0")

queue_object() {
  local desc="$1"
  local body
  body=$(curl -sS --max-time 30 -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -d "{\"description\":\"$desc\",\"size\":32,\"directions\":1,\"n_frames\":1,\"view\":\"low top-down\",\"object_view\":\"top-down\"}" \
    "https://api.pixellab.ai/v2/objects" 2>&1 || true)
  local code=$(printf '%s' "$body" | tail -n1 | sed 's/.*__HTTP_CODE__://')
  local payload=$(printf '%s' "$body" | sed '$d')
  if [ "$code" = "200" ] || [ "$code" = "201" ] || [ "$code" = "202" ]; then
    printf '%s' "$payload" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("id") or d.get("object_id") or "")
except Exception:
    print("")
'
  else
    echo ""
  fi
}

while true; do
  remaining=0
  for i in 0 1 2 3 4 5 6 7 8 9; do
    [ "${DONE[$i]}" = "1" ] && continue
    name="${NAMES[$i]}"
    cid="${IDS[$i]}"
    desc="${QUEUE_DESC[$i]}"

    # Need to queue this one
    if [ -z "$cid" ]; then
      new_id=$(queue_object "$desc" || true)
      if [ -n "$new_id" ]; then
        IDS[$i]="$new_id"
        echo "[$(date +%H:%M:%S)] queued $name -> $new_id"
        cid="$new_id"
      else
        remaining=$((remaining+1))
        continue
      fi
    fi

    # Poll
    json=$(curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
      "https://api.pixellab.ai/v2/objects/$cid" 2>/dev/null || true)
    if [ -z "$json" ]; then
      remaining=$((remaining+1))
      continue
    fi
    status=$(printf '%s' "$json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("status",""))
except Exception:
    print("")
')
    if [ "$status" = "completed" ]; then
      url=$(printf '%s' "$json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    obj = d.get("object", d)
    # storage_urls is the primary place for object images
    storage = obj.get("storage_urls") or {}
    for v in storage.values():
        if v: print(v); sys.exit(0)
    rots = obj.get("rotation_urls", {}) or {}
    for v in rots.values():
        if v: print(v); sys.exit(0)
    frames = obj.get("frame_urls") or obj.get("frames") or []
    if frames:
        f = frames[0]
        print(f if isinstance(f, str) else (f.get("url","")))
        sys.exit(0)
    print("")
except Exception:
    print("")
')
      if [ -n "$url" ]; then
        out="$SPRITES_DIR/${name}.png"
        if curl -fsS --max-time 30 -o "$out" "$url"; then
          echo "[$(date +%H:%M:%S)] saved $name"
          DONE[$i]="1"
        else
          remaining=$((remaining+1))
        fi
      else
        remaining=$((remaining+1))
      fi
    else
      remaining=$((remaining+1))
    fi
  done
  if [ "$remaining" = "0" ]; then
    echo "[$(date +%H:%M:%S)] all 10 sprites downloaded"
    exit 0
  fi
  sleep 15
done
