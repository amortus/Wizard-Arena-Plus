#!/bin/bash
# Polls the 3 remaining PixelLab objects and saves them when ready.
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"

NAMES=("proj_lightning" "gem_gold" "gem_epic")
IDS=(
  "e04502eb-359f-40f9-9437-0e7f1184559a"
  "23754218-565c-42bb-af42-85db3ba449a2"
  "5cda0d40-66ec-4513-9d6c-5369f98649ab"
)
DONE=("0" "0" "0")

while true; do
  remaining=0
  for i in 0 1 2; do
    [ "${DONE[$i]}" = "1" ] && continue
    name="${NAMES[$i]}"
    cid="${IDS[$i]}"
    json=$(curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
      "https://api.pixellab.ai/v2/objects/$cid" 2>/dev/null || true)
    if [ -z "$json" ]; then remaining=$((remaining+1)); continue; fi
    status=$(printf '%s' "$json" | python3 -c '
import json, sys
try: print(json.load(sys.stdin).get("status",""))
except: print("")
')
    if [ "$status" = "completed" ]; then
      url=$(printf '%s' "$json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    storage = d.get("storage_urls") or {}
    for v in storage.values():
        if v: print(v); sys.exit(0)
    print("")
except: print("")
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
    echo "[$(date +%H:%M:%S)] all done"
    exit 0
  fi
  sleep 10
done
