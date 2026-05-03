#!/bin/bash
# Polls 3 chibi wizards for running-4-frames completion, downloads to overwrite
# existing walking frames. Also retries cat queue until slot available.
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"

WIZ=(
  "old_man_wizard:bbd1568e-5be2-4c2b-a92b-2465ac6e65c0"
  "owl_wizard:ca7c80a0-0b61-4105-8b03-e2ab5b89b8f3"
  "cat_wizard:e0d45b7b-a8b1-4c16-a166-5768cc370855"
)
DONE=("0" "0" "0")
CAT_QUEUED="0"

queue_cat_running() {
  curl -sS --max-time 30 -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -d '{"character_id":"e0d45b7b-a8b1-4c16-a166-5768cc370855","template_animation_id":"running-4-frames","mode":"template","directions":["south","north","east","west"]}' \
    "https://api.pixellab.ai/v2/animate-character" 2>&1 | tail -n1
}

dl_running() {
  local slug="$1" cid="$2"
  curl -fsS -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null > /tmp/char.json
  python3 - "$slug" "$SPRITES_DIR" /tmp/char.json <<'PY'
import json, sys, subprocess
slug, out_dir, jpath = sys.argv[1], sys.argv[2], sys.argv[3]
with open(jpath) as f: d = json.load(f)
WANT = {"south","north","east","west"}
# Prefer running-4-frames over walking-4-frames
frames = {}
for a in d.get("animations", []):
    atype = (a.get("animation_type") or "").lower()
    if "running" not in atype: continue
    for dr in a.get("directions", []):
        if dr["direction"] in WANT and dr.get("frames") and len(dr["frames"]) >= 4 and dr["direction"] not in frames:
            frames[dr["direction"]] = dr["frames"][:8]
total = 0
for direction, urls in frames.items():
    for i, url in enumerate(urls):
        if not url: continue
        path = f"{out_dir}/{slug}_walk_{direction}_{i}.png"  # keep "walk" filename for code stability
        if subprocess.run(["curl","-fsS","--max-time","30","-o",path,url]).returncode == 0:
            total += 1
print(total)
PY
}

count_running_dirs() {
  local cid="$1"
  curl -fsS -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    have = set()
    for a in d.get('animations', []):
        if 'running' not in (a.get('animation_type') or '').lower(): continue
        for dr in a.get('directions', []):
            if dr.get('direction') in ('south','north','east','west') and dr.get('frames') and len(dr['frames']) >= 4:
                have.add(dr['direction'])
    print(len(have))
except: print(0)
"
}

while true; do
  remaining=0

  # Try to queue cat's running anim if we haven't yet
  if [ "$CAT_QUEUED" = "0" ]; then
    code=$(queue_cat_running)
    if [[ "$code" == *"200"* ]] || [[ "$code" == *"201"* ]]; then
      CAT_QUEUED="1"
      echo "[$(date +%H:%M:%S)] cat running queued"
    else
      remaining=$((remaining+1))
    fi
  fi

  for i in 0 1 2; do
    [ "${DONE[$i]}" = "1" ] && continue
    entry="${WIZ[$i]}"
    slug="${entry%%:*}"
    cid="${entry##*:}"
    n=$(count_running_dirs "$cid")
    if [ "$n" -ge "4" ]; then
      saved=$(dl_running "$slug" "$cid")
      echo "[$(date +%H:%M:%S)] $slug running frames downloaded ($saved files)"
      DONE[$i]="1"
    else
      remaining=$((remaining+1))
    fi
  done

  if [ "$remaining" = "0" ] && [ "$CAT_QUEUED" = "1" ]; then
    echo "[$(date +%H:%M:%S)] all running anims downloaded"
    exit 0
  fi
  sleep 20
done
