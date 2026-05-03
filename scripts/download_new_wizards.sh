#!/bin/bash
# Polls 3 new wizards: when char gen completes, downloads static rotations,
# queues walking-4-frames animation for cardinal dirs, then downloads frames.
# Also waits on the amethyst gem and overwrites gem_green.png.
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"

WIZ_NAMES=("old_man_wizard" "owl_wizard" "cat_wizard")
WIZ_IDS=(
  "8f52c168-9e7c-4e9a-86a9-e5e7419a36de"
  "beb50100-6f72-428b-9d0a-f6fd74df6aef"
  "1cbb77e2-aec7-4a8c-9a9f-f853256a1bec"
)
WIZ_STATIC_DONE=("0" "0" "0")
WIZ_ANIM_QUEUED=("0" "0" "0")
WIZ_ANIM_DONE=("0" "0" "0")

GEM_ID="c36f180b-30d0-4ea9-89e5-cfab3a7488c2"
GEM_DONE="0"

queue_walking_anim() {
  local cid="$1"
  curl -sS --max-time 30 -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"character_id\":\"$cid\",\"template_animation_id\":\"walking-4-frames\",\"mode\":\"template\",\"directions\":[\"south\",\"north\",\"east\",\"west\"]}" \
    "https://api.pixellab.ai/v2/animate-character" >/dev/null 2>&1 || true
}

download_static() {
  local slug="$1" cid="$2"
  local json
  json=$(curl -fsS -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null || true)
  [ -z "$json" ] && return 1
  printf '%s' "$json" > /tmp/char.json
  python3 - "$slug" "$SPRITES_DIR" /tmp/char.json <<'PY'
import json, sys, subprocess
slug, out_dir, jpath = sys.argv[1], sys.argv[2], sys.argv[3]
with open(jpath) as f:
    d = json.load(f)
WANT = {"south", "north", "east", "west"}
rot = d.get("rotation_urls", {}) or {}
for direction, url in rot.items():
    if direction in WANT and url:
        path = f"{out_dir}/{slug}_{direction}.png"
        subprocess.run(["curl", "-fsS", "--max-time", "30", "-o", path, url])
PY
}

download_walk() {
  local slug="$1" cid="$2"
  local json
  json=$(curl -fsS -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null || true)
  [ -z "$json" ] && return 1
  printf '%s' "$json" > /tmp/char.json
  local count
  count=$(python3 - "$slug" "$SPRITES_DIR" /tmp/char.json <<'PY'
import json, sys, subprocess
slug, out_dir, jpath = sys.argv[1], sys.argv[2], sys.argv[3]
with open(jpath) as f:
    d = json.load(f)
WANT = {"south", "north", "east", "west"}
frames = {}
for a in d.get("animations", []):
    atype = (a.get("animation_type") or "").lower()
    if "walk" not in atype and "run" not in atype:
        continue
    for dr in a.get("directions", []):
        if dr["direction"] in WANT and dr.get("frames") and dr["direction"] not in frames:
            frames[dr["direction"]] = dr["frames"][:8]
total = 0
for direction, urls in frames.items():
    for i, url in enumerate(urls):
        path = f"{out_dir}/{slug}_walk_{direction}_{i}.png"
        if subprocess.run(["curl", "-fsS", "--max-time", "30", "-o", path, url]).returncode == 0:
            total += 1
print(total)
print("DIRS_DONE", len(frames), file=sys.stderr)
PY
)
  echo "$count"
}

while true; do
  remaining=0

  for i in 0 1 2; do
    name="${WIZ_NAMES[$i]}"
    cid="${WIZ_IDS[$i]}"

    if [ "${WIZ_STATIC_DONE[$i]}" = "0" ]; then
      json=$(curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
        "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null || true)
      if [ -n "$json" ]; then
        has_rot=$(printf '%s' "$json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    rot = d.get("rotation_urls", {}) or {}
    print("1" if rot.get("south") else "0")
except: print("0")
')
        if [ "$has_rot" = "1" ]; then
          download_static "$name" "$cid"
          echo "[$(date +%H:%M:%S)] $name static rotations saved"
          WIZ_STATIC_DONE[$i]="1"
        else
          remaining=$((remaining+1))
        fi
      else
        remaining=$((remaining+1))
      fi
    fi

    if [ "${WIZ_STATIC_DONE[$i]}" = "1" ] && [ "${WIZ_ANIM_QUEUED[$i]}" = "0" ]; then
      echo "[$(date +%H:%M:%S)] queueing $name walking-4-frames..."
      queue_walking_anim "$cid"
      WIZ_ANIM_QUEUED[$i]="1"
      remaining=$((remaining+1))
    fi

    if [ "${WIZ_ANIM_QUEUED[$i]}" = "1" ] && [ "${WIZ_ANIM_DONE[$i]}" = "0" ]; then
      json=$(curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
        "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null || true)
      if [ -n "$json" ]; then
        complete_dirs=$(printf '%s' "$json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    have = set()
    for a in d.get("animations", []):
        atype = (a.get("animation_type") or "").lower()
        if "walk" not in atype and "run" not in atype: continue
        for dr in a.get("directions", []):
            if dr["direction"] in {"south","north","east","west"} and dr.get("frames") and len(dr["frames"]) >= 4:
                have.add(dr["direction"])
    print(len(have))
except: print(0)
')
        if [ "$complete_dirs" -ge "4" ]; then
          n=$(download_walk "$name" "$cid")
          echo "[$(date +%H:%M:%S)] $name walk frames saved ($n files)"
          WIZ_ANIM_DONE[$i]="1"
        else
          remaining=$((remaining+1))
        fi
      else
        remaining=$((remaining+1))
      fi
    fi
  done

  if [ "$GEM_DONE" = "0" ]; then
    json=$(curl -fsS -H "Authorization: Bearer $API_KEY" "https://api.pixellab.ai/v2/objects/$GEM_ID" 2>/dev/null || true)
    if [ -n "$json" ]; then
      url=$(printf '%s' "$json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    if d.get("status") == "completed":
        for v in (d.get("storage_urls") or {}).values():
            if v: print(v); sys.exit(0)
except: pass
')
      if [ -n "$url" ]; then
        # overwrite gem_green.png with the new amethyst (different hue from grass)
        curl -fsS -o "$SPRITES_DIR/gem_green.png" "$url" && echo "[$(date +%H:%M:%S)] amethyst gem saved as gem_green.png"
        GEM_DONE="1"
      else
        remaining=$((remaining+1))
      fi
    else
      remaining=$((remaining+1))
    fi
  fi

  if [ "$remaining" = "0" ]; then
    echo "[$(date +%H:%M:%S)] all assets ready"
    exit 0
  fi
  sleep 20
done
