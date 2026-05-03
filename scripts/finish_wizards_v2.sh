#!/bin/bash
# Wait until char generation status is "completed", THEN download statics and queue anims.
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"

WIZ=(
  "old_man_wizard:bbd1568e-5be2-4c2b-a92b-2465ac6e65c0"
)

# 0=char not ready 1=static dl'd + anim queued 2=walk frames done
STATE=("0" "0" "0")

is_char_completed() {
  local cid="$1"
  # Actually fetch the south rotation file — 200 = uploaded (done), 404 = still generating
  local code
  code=$(curl -sS -I -o /dev/null --max-time 15 -w "%{http_code}" \
    "https://backblaze.pixellab.ai/file/pixellab-characters/990f8b96-6443-4879-aa56-64c3e8e3c9a2/${cid}/rotations/south.png" 2>/dev/null)
  if [ "$code" = "200" ]; then echo "1"; else echo "0"; fi
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
    -w "\n__HTTP_CODE__:%{http_code}" \
    -d "{\"character_id\":\"$cid\",\"template_animation_id\":\"walking-4-frames\",\"mode\":\"template\",\"directions\":[\"south\",\"north\",\"east\",\"west\"]}" \
    "https://api.pixellab.ai/v2/animate-character" 2>&1 | tail -n1
}

walk_status() {
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
with open(jpath) as f:
    d = json.load(f)
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
  for i in 0 1 2; do
    [ "${STATE[$i]}" = "2" ] && continue
    entry="${WIZ[$i]}"
    slug="${entry%%:*}"
    cid="${entry##*:}"

    if [ "${STATE[$i]}" = "0" ]; then
      done=$(is_char_completed "$cid")
      if [ "$done" = "1" ]; then
        echo "[$(date +%H:%M:%S)] $slug char completed — downloading statics + queueing anim"
        dl_static "$slug" "$cid"
        result=$(queue_anim "$cid")
        echo "  queue result: $result"
        STATE[$i]="1"
      else
        remaining=$((remaining+1))
      fi
    fi

    if [ "${STATE[$i]}" = "1" ]; then
      have=$(walk_status "$cid")
      if [ "$have" -ge "4" ]; then
        n=$(dl_walk "$slug" "$cid")
        echo "[$(date +%H:%M:%S)] $slug walk frames: $n files"
        STATE[$i]="2"
      else
        remaining=$((remaining+1))
      fi
    fi
  done

  if [ "$remaining" = "0" ]; then
    echo "[$(date +%H:%M:%S)] ALL DONE"
    exit 0
  fi
  sleep 25
done
