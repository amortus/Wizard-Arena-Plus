#!/bin/bash
# Retry-queue the wolf character creation until slots are free.
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"

while true; do
  res=$(curl -sS --max-time 30 -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -d '{"description":"grey wolf with bared white fangs, glowing yellow eyes, pointed ears, fluffy fur, ferocious beast, simple stylized pixel art game enemy","name":"Wolf 3","size":40,"n_directions":8,"view":"high top-down","detail":"low detail","shading":"basic shading"}' \
    "https://api.pixellab.ai/v2/create-character" 2>&1 || true)
  code=$(printf '%s' "$res" | tail -n1 | sed 's/.*__HTTP_CODE__://')
  if [ "$code" = "200" ] || [ "$code" = "201" ] || [ "$code" = "202" ]; then
    body=$(printf '%s' "$res" | sed '$d')
    cid=$(printf '%s' "$body" | python3 -c 'import json, sys; d=json.load(sys.stdin); print(d.get("id") or d.get("character_id") or "")')
    if [ -n "$cid" ]; then
      echo "[$(date +%H:%M:%S)] WOLF QUEUED $cid"
      echo "$cid" > /tmp/wolf_id.txt
      exit 0
    fi
  fi
  echo "[$(date +%H:%M:%S)] queue retry — code=$code"
  sleep 30
done
