#!/bin/bash
# Polls until slot available, then queues zombie walking-4-frames animation.
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
CID="806f6722-9132-4759-badc-06edeb5a6fbc"

while true; do
  resp=$(curl -sS --max-time 30 -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -d "{\"character_id\":\"$CID\",\"template_animation_id\":\"walking-4-frames\",\"mode\":\"template\"}" \
    "https://api.pixellab.ai/v2/animate-character" 2>&1 || true)
  code=$(printf '%s' "$resp" | tail -n1 | sed 's/.*__HTTP_CODE__://')
  body=$(printf '%s' "$resp" | sed '$d')
  echo "[$(date +%H:%M:%S)] queue zombie: HTTP $code"
  if [ "$code" = "200" ] || [ "$code" = "201" ] || [ "$code" = "202" ]; then
    echo "queued OK"
    printf '%s\n' "$body" | head -10
    exit 0
  fi
  printf '%s\n' "$body" | head -3
  sleep 30
done
