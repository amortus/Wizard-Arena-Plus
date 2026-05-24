# Madness Arena

Multiplayer Vampire-Survivors-style roguelike. Top-down auto-attack arena with friendly fire, NPC monster waves, XP gems, powerup picks on level-up, arena bosses, elite variants, and environmental hazards.

## Stack

- **Next.js 15** + **Phaser 3** — frontend / game rendering
- **PartyKit** (Cloudflare Durable Objects) — authoritative websocket game server, 50 Hz tick loop
- **TypeScript** end-to-end with shared `/shared` types between client and server
- **PixelLab** — sprite generation (characters, enemies, gems, projectiles)

## Run locally

```bash
npm install
npm run dev
```

Boots both servers concurrently:
- Next.js on http://localhost:3000
- PartyKit on http://localhost:1999

Open the URL, pick a name + character + tint, hit **Enter Arena**. To test multiplayer open another tab/browser and join the same room name. Up to 4 players per room.

## How to play

- **WASD** to move
- Weapons fire automatically toward the nearest target (NPC or other player)
- Touch enemies = take damage
- Pick up XP gems (vacuumed in once close enough)
- Level up → pick 1 of 3 powerups
- **Friendly fire is on.** Killing another player makes them drop their gems.
- Die = game over for that run. Click **Respawn** to start fresh at level 1.

## Characters

12 playable wizards, each with a starting weapon and unique element:

| Character          | Starting Weapon | Element   |
|--------------------|-----------------|-----------|
| Blue Wizard        | Arcane Orb      | Arcane    |
| Fire Wizard        | Fireball        | Fire      |
| Salamander Wizard  | Fireball        | Fire      |
| Lightning Wizard   | Lightning Bolt  | Lightning |
| Earth Wizard       | Rock Throw      | Earth     |
| Forest Wizard      | Leaf Cutter     | Forest    |
| Shadow Wizard      | Shadow Bolt     | Shadow    |
| Mouse Apprentice   | Arcane Orb      | Arcane    |
| Frog Wizard        | Leaf Cutter     | Forest    |
| Old Man Wizard     | Arcane Orb      | Arcane    |
| Owl Wizard         | Lightning Bolt  | Lightning |
| Cat Wizard         | Shadow Bolt     | Shadow    |

Each character has individual `speedMul` and `hpMul` modifiers defined in `shared/constants.ts → CHARACTER_BASES`.

## Weapons

Eight weapon types, each with its own damage, cooldown, range, and projectile speed (see `WEAPON_DEFS` in `shared/constants.ts`):

`rock_throw` · `arcane_orb` · `leaf_cutter` · `fireball` · `lightning_bolt` · `shadow_bolt` · `orbital_spark` · `aura_shield`

## Powerup system

On each level-up you choose 1 of 3 randomly rolled options. The pool guarantees at least one new weapon unlock if any are available.

**Stat upgrades** (always available unless capped): damage, mega damage, crit chance, move speed, cooldown reduction, fast hands, max HP, regeneration, vampiric drain, pickup range, extended range, piercing, frost aura, lucky gems, bigger heart, glass cannon, time shield, bloodbath, soul harvest, trail of fire, time stop, and more.

**Active abilities** (level-gated, one each): Lightning Strike, Meteor Shower, Frost Nova, Holy Smite, Black Hole, Phoenix Rebirth, Chain Reaction, Missile Barrage, Earthquake, Spirit Wolves.

**Projectile modifiers**: +1/+2 projectiles, bigger hits, splash damage.

**Weapon unlocks**: add any of the 8 weapons as a second/third/etc. slot.

**Tier-2 upgrades**: once you have a base (e.g. Frost Nova, Trail of Fire, Lightning Strike, Aura Shield), further upgrades can widen, quicken, or strengthen it.

## Enemy system

- **Normal NPCs** — wave-based spawns scaling with wave number; up to 80 simultaneous enemies
- **Elite / Veteran variants** — appear in later waves; higher HP, damage, and speed
- **Arena bosses** — a roster of 8 unique bosses, each with distinct AI and behavior, cycling through as the game progresses; at most one alive per room at a time
- **Environmental hazards** — arena obstacles that interact with players and enemies

## Waves

Waves last ~18 seconds with a 1-second break between them. Wave size starts at 32 and grows by 10 per wave. Enemies spawn from 1–4 edge anchors depending on wave number.

## File layout

```
app/                 Next.js routes
  layout.tsx
  page.tsx           Menu + Game wrapper
  leaderboard/       All-time top-100 leaderboard page
  globals.css

components/
  Game.tsx           Phaser host + HUD + level-up modal

game/
  scene.ts           Phaser scene: input, render, interpolation, socket

party/
  index.ts           PartyKit server: tick loop, NPCs, bosses, hazards, projectiles, collisions

shared/              Imported by both client and server
  constants.ts       All tunable game numbers
  types.ts           Wire protocol types
  powerups.ts        Powerup definitions and roll logic
  leaderboard.ts     Leaderboard types

public/
  sprites/           PixelLab-generated sprites (4 directions per entity)
  portraits/         Character portrait images for the lobby
```

## Tweaking the game

Most numbers live in `shared/constants.ts`:

- `TICK_RATE` — server tick rate (default 50 Hz)
- `ARENA_WIDTH / ARENA_HEIGHT` — arena size (default 3200×3200)
- `PLAYER_SPEED`, `PLAYER_BASE_HP`, `PLAYER_MAX_PER_ROOM` — player tuning
- `NPC_*` — enemy base stats and behavior
- `WAVE_*` — wave size, duration, growth
- `WEAPON_DEFS` — damage, cooldown, range, projectile speed per weapon
- `CHARACTER_BASES` — per-character stat multipliers and starting weapon
- `LEVEL_DAMAGE_MUL / LEVEL_DAMAGE_CAP_LEVELS` — level-scaling curve

Add powerups in `shared/powerups.ts`. Boss behavior lives in `party/index.ts`.

## Deploying

**PartyKit server:**
```bash
npm run deploy:party
```
Prompts you to log in via Cloudflare on first run. Returns a URL like `wizard-arena-plus.YOUR_USER.partykit.dev`.

**Next.js frontend:** push to a Vercel project. Set `NEXT_PUBLIC_PARTYKIT_HOST` to the PartyKit URL above (update the `PARTY_HOST` const in `game/scene.ts`).

## Adding sprites

Characters use 4 rotation frames: `south`, `north`, `east`, `west`. Drop new ones into `public/sprites/{name}_{dir}.png`. The Phaser scene generates colored-circle fallbacks for any missing sprite so the game runs without art.
