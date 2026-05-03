#!/bin/bash
# Polls the 5 new monsters: when char done, queues walking-4-frames and downloads frames.
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"

MON=(
  "spider:e4cd2054-b32d-4c94-b896-043becd207ad"
  "imp:16d9e44d-d445-4c11-99df-573e644d765d"
  "wraith:5340e2f6-7785-4977-b1e3-7d1d1c4b6b9a"
  "bat:f9d63691-b227-4d15-b967-1fee287aa9c5"
  "mimic:b476a434-8c12-4f3b-b364-02686458bab1"
)
# Spider/Imp/Wraith already have statics — start them at state 1 (waiting for walk anims).
STATE=("1" "1" "1" "0" "0")

is_complete() {
  local cid="$1"
  curl -sS -I -o /dev/null --max-time 15 -w "%{http_code}" \
    "https://backblaze.pixellab.ai/file/pixellab-characters/990f8b96-6443-4879-aa56-64c3e8e3c9a2/${cid}/rotations/south.png" 2>/dev/null
}

dl_static() {
  local slug="$1" cid="$2"
  for d in south north east west; do
    curl -fsS --max-time 30 -o "$SPRITES_DIR/${slug}_${d}.png" \
      "https://backblaze.pixellab.ai/file/pixellab-characters/990f8b96-6443-4879-aa56-64c3e8e3c9a2/${cid}/rotations/${d}.png" 2>/dev/null
  done
}

queue_anim() {
  local cid="$1"
  curl -sS --max-time 30 -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"character_id\":\"$cid\",\"template_animation_id\":\"walking-4-frames\",\"mode\":\"template\",\"directions\":[\"south\",\"north\",\"east\",\"west\"]}" \
    "https://api.pixellab.ai/v2/animate-character" -o /dev/null
}

walk_dirs() {
  local cid="$1"
  curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    have = set()
    for a in d.get('animations', []):
        atype = (a.get('animation_type') or '').lower()
        if 'walk' not in atype and 'run' not in atype: continue
        for dr in a.get('directions', []):
            if dr.get('direction') in ('south','north','east','west') and dr.get('frames') and len(dr['frames']) >= 4:
                have.add(dr['direction'])
    print(len(have))
except: print(0)
"
}

dl_walk() {
  local slug="$1" cid="$2"
  curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null > /tmp/char.json
  python3 - "$slug" "$SPRITES_DIR" /tmp/char.json <<'PY'
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
}

while true; do
  remaining=0
  for i in 0 1 2 3 4; do
    [ "${STATE[$i]}" = "2" ] && continue
    entry="${MON[$i]}"
    slug="${entry%%:*}"
    cid="${entry##*:}"

    if [ "${STATE[$i]}" = "0" ]; then
      code=$(is_complete "$cid")
      if [ "$code" = "200" ]; then
        echo "[$(date +%H:%M:%S)] $slug char done — dl static + queueing anim"
        dl_static "$slug" "$cid"
        queue_anim "$cid"
        STATE[$i]="1"
      else
        remaining=$((remaining+1))
      fi
    fi

    if [ "${STATE[$i]}" = "1" ]; then
      n=$(walk_dirs "$cid")
      if [ "$n" -ge "4" ]; then
        saved=$(dl_walk "$slug" "$cid")
        echo "[$(date +%H:%M:%S)] $slug walk frames: $saved files"
        STATE[$i]="2"
      else
        remaining=$((remaining+1))
      fi
    fi
  done
  if [ "$remaining" = "0" ]; then echo "[$(date +%H:%M:%S)] all 5 done"; exit 0; fi
  sleep 25
done
