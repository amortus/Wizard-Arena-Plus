#!/bin/bash
# Downloads static rotations + running-4-frames animations (4 cardinal dirs only)
# for all wizards + monsters. Saves as {slug}_{dir}.png and {slug}_walk_{dir}_{frame}.png
set -uo pipefail
API_KEY="0833a3e2-1f8b-4f0f-be56-afc2bb43e69a"
SPRITES_DIR="/Users/joemurfin/Documents/survivors-online/public/sprites"
mkdir -p "$SPRITES_DIR"

# slug:character_id  pairs
ENTRIES=(
  # Wizards (player characters)
  "earth_wizard:1f09a42b-6b55-414a-a942-1823bc49e025"
  "lightning_wizard:a7d19e9d-6769-4617-a7ba-adbd9d94cf71"
  "shadow_wizard:5d79e375-9361-4c12-9904-a51933edf445"
  "forest_wizard:29573541-31c3-4152-9188-5e494eb6307a"
  "fire_wizard:45c850a8-8205-423a-b3f5-bd591cdbd946"
  "salamander_wizard:8da069a7-27b5-4cdf-84c1-844fda34e358"
  "mouse_apprentice:31d3500a-cc13-4c0a-a0ef-3cd24ed9815c"
  "blue_wizard:50da0240-1395-41dd-b4fa-0038765354ae"
  # Monsters (NPCs)
  "treant:ab37ad36-cf93-426c-9cad-05f161ccd7f1"
  "skeleton:3c42d50d-481e-4f6f-8738-ff856e1f7596"
  "skeleton_knight:3296f4fc-392d-4bd1-9244-c30b41fd087a"
  "stalker_skeleton:db192db4-a634-4a38-ae20-8a18f853acd8"
  "zombie_v2:ee2fba20-e3c6-4e3d-8f11-71d7ab77873b"
  "bloated_zombie:08030980-56aa-4aff-b530-8dcfc811c4ed"
  "goblin:b4cd08bb-25a2-4ffe-bb03-3edd6573fcaa"
  "goblin_brute:c15a8d94-7ee1-4caf-b440-1151106fcc26"
  "goblin_scratcher:65f94303-c246-408f-b299-ea0ef2821597"
  "feral_goblin:7342e3be-a039-47f6-be69-e4bb3f0fb01e"
  "fat_goblin:3c4bc936-5c00-416a-bad7-ee577f43877a"
)

DIRS=("south" "north" "east" "west")

for entry in "${ENTRIES[@]}"; do
  slug="${entry%%:*}"
  cid="${entry##*:}"
  echo "[$(date +%H:%M:%S)] === $slug ($cid) ==="

  json=$(curl -fsS --max-time 30 -H "Authorization: Bearer $API_KEY" \
    "https://api.pixellab.ai/v2/characters/$cid" 2>/dev/null || true)
  if [ -z "$json" ]; then
    echo "  fetch failed, skipping"
    continue
  fi

  # extract rotation URLs + animation frame URLs
  printf '%s' "$json" > /tmp/char.json
  python3 - "$slug" "$SPRITES_DIR" /tmp/char.json <<'PY'
import json, sys, subprocess
slug, out_dir, jpath = sys.argv[1], sys.argv[2], sys.argv[3]
with open(jpath) as f:
    d = json.load(f)
WANT_DIRS = {"south", "north", "east", "west"}

# Static rotations
rot = d.get("rotation_urls", {})
for direction, url in rot.items():
    if direction in WANT_DIRS and url:
        path = f"{out_dir}/{slug}_{direction}.png"
        r = subprocess.run(["curl", "-fsS", "--max-time", "30", "-o", path, url])
        if r.returncode == 0:
            print(f"  static {direction}")

# Walking frames — match any anim type containing walk/run; merge across groups, prefer larger counts
frames = {}
PREF = ["running", "walking", "walk", "run"]
def score(atype: str) -> int:
    a = atype.lower()
    if "scary" in a or "sad" in a: return 5  # monster style walks
    if "running" in a or "walking" in a: return 6
    if "walk" in a or "run" in a: return 4
    return 0
candidates = []
for a in d.get("animations", []):
    s = score(a.get("animation_type", ""))
    if s > 0:
        candidates.append((s, a))
candidates.sort(key=lambda x: -x[0])
for _, a in candidates:
    for dr in a.get("directions", []):
        if dr["direction"] in WANT_DIRS and dr.get("frames") and dr["direction"] not in frames:
            frames[dr["direction"]] = dr["frames"][:8]  # cap at 8
for direction, urls in frames.items():
    for i, url in enumerate(urls):
        path = f"{out_dir}/{slug}_walk_{direction}_{i}.png"
        subprocess.run(["curl", "-fsS", "--max-time", "30", "-o", path, url])
print(f"  walk frames: {sorted(frames.keys())} ({sum(len(v) for v in frames.values())} files)")
PY
done
echo "[$(date +%H:%M:%S)] all done"
