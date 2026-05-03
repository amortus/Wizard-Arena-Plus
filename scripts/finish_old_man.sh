#!/bin/bash
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
CID="bbd1568e-5be2-4c2b-a92b-2465ac6e65c0"
SLUG="old_man_wizard"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"

while true; do
  json=$(curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$CID" 2>/dev/null || echo "")
  if [ -z "$json" ]; then sleep 15; continue; fi
  printf '%s' "$json" > /tmp/oldman.json
  ready=$(python3 -c "
import json
with open('/tmp/oldman.json') as f: d = json.load(f)
have = set()
for a in d.get('animations', []):
    atype = (a.get('animation_type') or '').lower()
    if 'walk' not in atype and 'run' not in atype: continue
    for dr in a.get('directions', []):
        if dr.get('direction') in ('south','north','east','west') and dr.get('frames') and len(dr['frames']) >= 4:
            have.add(dr['direction'])
print('1' if have >= {'south','north','east','west'} else '0')
")
  if [ "$ready" = "1" ]; then
    python3 - "$SLUG" "$SPRITES_DIR" /tmp/oldman.json <<'PY'
import json, sys, subprocess
slug, out_dir, jpath = sys.argv[1], sys.argv[2], sys.argv[3]
with open(jpath) as f: d = json.load(f)
WANT = {"south","north","east","west"}
frames = {}
for a in d.get("animations", []):
    atype = (a.get("animation_type") or "").lower()
    if "walk" not in atype and "run" not in atype: continue
    for dr in a.get("directions", []):
        if dr["direction"] in WANT and dr.get("frames") and len(dr["frames"]) >= 4 and dr["direction"] not in frames:
            frames[dr["direction"]] = dr["frames"][:8]
total = 0
for direction, urls in frames.items():
    for i, url in enumerate(urls):
        if not url: continue
        path = f"{out_dir}/{slug}_walk_{direction}_{i}.png"
        if subprocess.run(["curl","-fsS","--max-time","30","-o",path,url]).returncode == 0:
            total += 1
print(total)
PY
    echo "[$(date +%H:%M:%S)] old_man walk frames downloaded"
    exit 0
  fi
  sleep 15
done
