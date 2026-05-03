#!/bin/bash
# Polls and finishes the 3 new wizards: queues animations as slots free,
# downloads static rotations + walk frames, plus the amethyst gem.
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"

WIZ=(
  "old_man_wizard:a0f93e60-4796-4039-a479-d1f6dd50a1f4"
  "owl_wizard:2aa7838e-3b82-47b2-ada4-41f9e100547b"
  "cat_wizard:abb28897-c2a5-4824-a995-fc7d01f40268"
)
GEM_ID="c36f180b-30d0-4ea9-89e5-cfab3a7488c2"

dl_static() {
  local slug="$1" cid="$2"
  for d in south north east west; do
    local out="$SPRITES_DIR/${slug}_${d}.png"
    [ -s "$out" ] && continue
    curl -fsS --max-time 30 -o "$out" \
      "https://backblaze.pixellab.ai/file/pixellab-characters/990f8b96-6443-4879-aa56-64c3e8e3c9a2/${cid}/rotations/${d}.png" >/dev/null 2>&1 || true
  done
}

dl_walk() {
  local slug="$1" cid="$2"
  local json
  json=$(curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null || echo "")
  [ -z "$json" ] && return
  printf '%s' "$json" > /tmp/char.json
  python3 - "$slug" "$SPRITES_DIR" /tmp/char.json <<'PY'
import json, sys, subprocess
slug, out_dir, jpath = sys.argv[1], sys.argv[2], sys.argv[3]
with open(jpath) as f:
    d = json.load(f)
WANT = {"south", "north", "east", "west"}
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
        if subprocess.run(["curl", "-fsS", "--max-time", "30", "-o", path, url]).returncode == 0:
            total += 1
print(total)
PY
}

queue_anim() {
  local cid="$1"
  curl -sS --max-time 30 -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"character_id\":\"$cid\",\"template_animation_id\":\"walking-4-frames\",\"mode\":\"template\",\"directions\":[\"south\",\"north\",\"east\",\"west\"]}" \
    "https://api.pixellab.ai/v2/animate-character" 2>/dev/null
}

# Track per-wizard state: 0 = char not ready, 1 = char ready (static dl'd) + anim queued, 2 = walk frames downloaded
declare_state() {
  WIZ_STATE=("0" "0" "0")
}
declare_state

while true; do
  remaining=0

  for i in 0 1 2; do
    entry="${WIZ[$i]}"
    slug="${entry%%:*}"
    cid="${entry##*:}"
    [ "${WIZ_STATE[$i]}" = "2" ] && continue

    json=$(curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
      "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null || echo "")
    [ -z "$json" ] && { remaining=$((remaining+1)); continue; }

    state=$(printf '%s' "$json" | python3 -c '
import json, sys
d = json.load(sys.stdin)
rot = d.get("rotation_urls", {}) or {}
have_rot = all(rot.get(k) for k in ("south","north","east","west"))
walk_dirs = set()
for a in d.get("animations", []):
    if "walk" not in (a.get("animation_type") or "").lower() and "run" not in (a.get("animation_type") or "").lower():
        continue
    for dr in a.get("directions", []):
        if dr.get("direction") in ("south","north","east","west") and dr.get("frames") and len(dr["frames"]) >= 4:
            walk_dirs.add(dr["direction"])
walk_done = walk_dirs >= {"south","north","east","west"}
anim_count = len(d.get("animations", []))
print(f"{int(have_rot)} {int(walk_done)} {anim_count}")
')
    have_rot=$(echo "$state" | awk "{print \$1}")
    walk_done=$(echo "$state" | awk "{print \$2}")
    anim_count=$(echo "$state" | awk "{print \$3}")

    if [ "${WIZ_STATE[$i]}" = "0" ] && [ "$have_rot" = "1" ]; then
      dl_static "$slug" "$cid"
      WIZ_STATE[$i]="1"
      echo "[$(date +%H:%M:%S)] $slug static ready"
    fi

    if [ "${WIZ_STATE[$i]}" = "1" ]; then
      if [ "$walk_done" = "1" ]; then
        n=$(dl_walk "$slug" "$cid")
        echo "[$(date +%H:%M:%S)] $slug walk frames downloaded ($n files)"
        WIZ_STATE[$i]="2"
      else
        # Queue if no anim has started yet
        if [ "$anim_count" = "0" ]; then
          echo "[$(date +%H:%M:%S)] retrying queue anim for $slug"
          queue_anim "$cid" >/dev/null
        fi
        remaining=$((remaining+1))
      fi
    elif [ "${WIZ_STATE[$i]}" = "0" ]; then
      remaining=$((remaining+1))
    fi
  done

  # Amethyst gem
  if [ ! -s "$SPRITES_DIR/gem_green_new.flag" ]; then
    json=$(curl -fsS -H "Authorization: Bearer $API_KEY" "https://api.pixellab.ai/v2/objects/$GEM_ID" 2>/dev/null || echo "")
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
        curl -fsS -o "$SPRITES_DIR/gem_green.png" "$url" && touch "$SPRITES_DIR/gem_green_new.flag" && \
          echo "[$(date +%H:%M:%S)] amethyst gem replaced gem_green.png"
      else
        remaining=$((remaining+1))
      fi
    else
      remaining=$((remaining+1))
    fi
  fi

  if [ "$remaining" = "0" ]; then
    echo "[$(date +%H:%M:%S)] ALL DONE"
    exit 0
  fi
  sleep 25
done
