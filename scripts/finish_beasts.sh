#!/bin/bash
# Wait for wolf char gen + queue its anim. Also waits for spider/wraith walk frames.
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"

WOLF_ID="0ee345e5-9264-4f7a-a5d8-91fa60410404"
SPIDER_ID="e4cd2054-b32d-4c94-b896-043becd207ad"
WRAITH_ID="5340e2f6-7785-4977-b1e3-7d1d1c4b6b9a"

WOLF_STATIC=0
WOLF_ANIM_QUEUED=0
WOLF_WALK=0
SPIDER_WALK=0
WRAITH_WALK=0

is_complete() {
  curl -sS -I -o /dev/null --max-time 15 -w "%{http_code}" \
    "https://backblaze.pixellab.ai/file/pixellab-characters/990f8b96-6443-4879-aa56-64c3e8e3c9a2/$1/rotations/south.png" 2>/dev/null
}

dl_static_one() {
  local slug="$1" cid="$2" d="$3"
  curl -fsS --max-time 30 -o "$SPRITES_DIR/${slug}_${d}.png" \
    "https://backblaze.pixellab.ai/file/pixellab-characters/990f8b96-6443-4879-aa56-64c3e8e3c9a2/${cid}/rotations/${d}.png" 2>/dev/null
}

queue_anim() {
  local cid="$1"
  curl -sS --max-time 30 -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -d "{\"character_id\":\"$cid\",\"template_animation_id\":\"walking-4-frames\",\"mode\":\"template\",\"directions\":[\"south\",\"north\",\"east\",\"west\"]}" \
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

dl_walk_frames() {
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

  # Wolf: char → static → anim → walk frames
  if [ "$WOLF_STATIC" = "0" ]; then
    code=$(is_complete "$WOLF_ID")
    if [ "$code" = "200" ]; then
      for d in south north east west; do dl_static_one wolf "$WOLF_ID" "$d"; done
      echo "[$(date +%H:%M:%S)] wolf static OK"
      WOLF_STATIC=1
    else remaining=$((remaining+1)); fi
  fi
  if [ "$WOLF_STATIC" = "1" ] && [ "$WOLF_ANIM_QUEUED" = "0" ]; then
    res=$(queue_anim "$WOLF_ID")
    if [[ "$res" == *"200"* ]] || [[ "$res" == *"201"* ]]; then
      WOLF_ANIM_QUEUED=1
      echo "[$(date +%H:%M:%S)] wolf anim queued"
    else remaining=$((remaining+1)); fi
  fi
  if [ "$WOLF_ANIM_QUEUED" = "1" ] && [ "$WOLF_WALK" = "0" ]; then
    n=$(walk_dirs "$WOLF_ID")
    if [ "$n" -ge "4" ]; then
      saved=$(dl_walk_frames wolf "$WOLF_ID")
      echo "[$(date +%H:%M:%S)] wolf walk: $saved files"; WOLF_WALK=1
    else remaining=$((remaining+1)); fi
  fi

  # Spider walk frames
  if [ "$SPIDER_WALK" = "0" ]; then
    n=$(walk_dirs "$SPIDER_ID")
    if [ "$n" -ge "4" ]; then
      saved=$(dl_walk_frames spider "$SPIDER_ID")
      echo "[$(date +%H:%M:%S)] spider walk: $saved files"; SPIDER_WALK=1
    else remaining=$((remaining+1)); fi
  fi

  # Wraith walk frames
  if [ "$WRAITH_WALK" = "0" ]; then
    n=$(walk_dirs "$WRAITH_ID")
    if [ "$n" -ge "4" ]; then
      saved=$(dl_walk_frames wraith "$WRAITH_ID")
      echo "[$(date +%H:%M:%S)] wraith walk: $saved files"; WRAITH_WALK=1
    else remaining=$((remaining+1)); fi
  fi

  if [ "$remaining" = "0" ]; then echo "[$(date +%H:%M:%S)] ALL DONE"; exit 0; fi
  sleep 25
done
