#!/bin/bash
# Add 4 more monster types: slime, crawling_skeleton, ghoul, zombie_b
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"
mkdir -p "$SPRITES_DIR"

NEW_ENTRIES=(
  "slime:ba30502b-f326-4c63-b40a-9b6942e78059"
  "crawling_skeleton:36ebad76-55b5-443b-aa9f-5df26cfd8da0"
  "ghoul:35682319-efb3-4da1-ae09-9646ed257eeb"
  "zombie_b:5354b049-bddb-43b1-b43b-40e047a34692"
)

for entry in "${NEW_ENTRIES[@]}"; do
  slug="${entry%%:*}"
  cid="${entry##*:}"
  echo "[$(date +%H:%M:%S)] === $slug ==="
  json=$(curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null || true)
  if [ -z "$json" ]; then echo "  fetch FAIL"; continue; fi
  printf '%s' "$json" > /tmp/char.json
  python3 - "$slug" "$SPRITES_DIR" /tmp/char.json <<'PY'
import json, sys, subprocess
slug, out_dir, jpath = sys.argv[1], sys.argv[2], sys.argv[3]
with open(jpath) as f:
    d = json.load(f)
WANT = {"south", "north", "east", "west"}
# static rotations
rot = d.get("rotation_urls", {})
for direction, url in rot.items():
    if direction in WANT and url:
        path = f"{out_dir}/{slug}_{direction}.png"
        subprocess.run(["curl", "-fsS", "--max-time", "30", "-o", path, url])
# walking frames - prefer scary-walk / sad-walk / running / walking
frames = {}
score = lambda a: 6 if "running" in a or "walking" in a else (5 if "scary" in a or "sad" in a else (4 if "walk" in a or "run" in a else 0))
candidates = sorted(
    [a for a in d.get("animations", []) if score(a.get("animation_type", "")) > 0],
    key=lambda a: -score(a.get("animation_type", "")),
)
for a in candidates:
    for dr in a.get("directions", []):
        if dr["direction"] in WANT and dr.get("frames") and dr["direction"] not in frames:
            frames[dr["direction"]] = dr["frames"][:8]
total = 0
for direction, urls in frames.items():
    for i, url in enumerate(urls):
        path = f"{out_dir}/{slug}_walk_{direction}_{i}.png"
        if subprocess.run(["curl", "-fsS", "--max-time", "30", "-o", path, url]).returncode == 0:
            total += 1
print(f"  static {len(rot)} | walk {total} files across {sorted(frames.keys())}")
PY
done
echo "done"
