#!/bin/bash
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"
WOLF_ID="d042fbe8-913d-4ee2-96e9-c41892960927"

is_complete() {
  curl -sS -I -o /dev/null --max-time 15 -w "%{http_code}" \
    "https://backblaze.pixellab.ai/file/pixellab-characters/990f8b96-6443-4879-aa56-64c3e8e3c9a2/$1/rotations/south.png" 2>/dev/null
}
queue_anim() {
  curl -sS --max-time 30 -X POST \
    -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -d "{\"character_id\":\"$1\",\"template_animation_id\":\"walking-4-frames\",\"mode\":\"template\",\"directions\":[\"south\",\"north\",\"east\",\"west\"]}" \
    "https://api.pixellab.ai/v2/animate-character" 2>&1 | tail -n1
}
walk_dirs() {
  curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$1" 2>/dev/null | python3 -c "
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
  curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$1" 2>/dev/null > /tmp/wolf.json
  python3 - "$SPRITES_DIR" /tmp/wolf.json <<'PY'
import json, sys, subprocess
out_dir, jpath = sys.argv[1], sys.argv[2]
with open(jpath) as f: d = json.load(f)
WANT = {"south","north","east","west"}
frames = {}
for a in d.get("animations", []):
    atype = (a.get("animation_type") or "").lower()
    if "walk" not in atype and "run" not in atype: continue
    for dr in a.get("directions", []):
        if dr["direction"] in WANT and dr.get("frames") and len(dr["frames"]) >= 4 and dr["direction"] not in frames:
            frames[dr["direction"]] = dr["frames"][:8]
for direction, urls in frames.items():
    for i, url in enumerate(urls):
        if not url: continue
        path = f"{out_dir}/werewolf_walk_{direction}_{i}.png"
        subprocess.run(["curl","-fsS","--max-time","30","-o",path,url])
PY
}

STATIC_DONE=0
ANIM_QUEUED=0

# Phase 1: wait for char gen
while [ "$STATIC_DONE" = "0" ]; do
  code=$(is_complete "$WOLF_ID")
  if [ "$code" = "200" ]; then
    for d in south north east west; do
      curl -fsS --max-time 30 -o "$SPRITES_DIR/werewolf_${d}.png" \
        "https://backblaze.pixellab.ai/file/pixellab-characters/990f8b96-6443-4879-aa56-64c3e8e3c9a2/$WOLF_ID/rotations/$d.png"
    done
    echo "[$(date +%H:%M:%S)] wolf static OK"
    STATIC_DONE=1
  else
    sleep 25
  fi
done

# Phase 2: queue anim (retry until success)
while [ "$ANIM_QUEUED" = "0" ]; do
  res=$(queue_anim "$WOLF_ID")
  if [[ "$res" == *"200"* ]] || [[ "$res" == *"201"* ]]; then
    echo "[$(date +%H:%M:%S)] wolf anim queued"
    ANIM_QUEUED=1
  else
    sleep 25
  fi
done

# Phase 3: wait for at least 2 cardinal walk dirs (ship partial), download
while true; do
  n=$(walk_dirs "$WOLF_ID")
  if [ "$n" -ge "2" ]; then
    dl_walk "$WOLF_ID"
    echo "[$(date +%H:%M:%S)] wolf walk frames downloaded ($n cardinal dirs)"
    if [ "$n" -ge "4" ]; then
      echo "[$(date +%H:%M:%S)] WOLF FULLY DONE"
      exit 0
    fi
    # if we've shipped at least 2, continue polling for any stragglers but exit after 2 more attempts
    sleep 60
    n2=$(walk_dirs "$WOLF_ID")
    if [ "$n2" -gt "$n" ]; then dl_walk "$WOLF_ID"; fi
    if [ "$n2" -ge "4" ]; then exit 0; fi
    # accept partial and exit
    exit 0
  fi
  sleep 25
done
