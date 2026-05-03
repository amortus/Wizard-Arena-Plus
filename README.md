# Survivors Online

Multiplayer Vampire-Survivors-style roguelike. Top-down auto-attack arena with friendly fire, NPC monsters, XP gems, and powerup picks on level-up.

## Stack

- **Next.js 15** + **Phaser 3** — frontend / game rendering
- **PartyKit** (Cloudflare Durable Objects) — authoritative websocket game server
- **TypeScript** end-to-end with shared `/shared` types between client & server
- **PixelLab** — sprite generation (characters, enemies, gems)

## Run locally

```bash
npm install
npm run dev
```

This boots both servers concurrently:
- Next.js on http://localhost:3000
- PartyKit on http://localhost:1999

Open the URL, pick a name + character + tint, hit "Enter Arena". To test multiplayer, open another tab/browser and join the same room name.

## How to play

- **WASD** to move
- Weapons fire automatically toward nearest target (NPC or other player)
- Touch enemies = take damage
- Pick up XP gems (vacuumed in once close enough)
- Level up → pick 1 of 3 powerups
- **Friendly fire is on.** Killing another player makes them drop their gems.
- Die = roguelike game over for that life. Click Respawn to start fresh at level 1.

## Characters

| Name   | Weapon       | Stats                |
|--------|--------------|----------------------|
| Knight | Sword        | +20% HP, base speed  |
| Mage   | Magic Orb    | -15% HP, long range  |
| Rogue  | Twin Daggers | +15% speed, fast atk |

## Powerups

`+25% damage`, `+15% move speed`, `-15% cooldown`, `+25 max HP & full heal`, `+50% pickup range`, plus weapon-add powerups (gain a second/third weapon).

## File layout

```
app/             Next.js routes
  layout.tsx     Root layout
  page.tsx       Menu + Game wrapper
  globals.css

components/
  Game.tsx       Phaser host + HUD + level-up modal

game/
  scene.ts       Phaser scene: input, render, interpolation, socket

party/
  index.ts       PartyKit server: tick loop, NPCs, projectiles, collisions

shared/          (imported by both client and server)
  constants.ts   tunable game numbers
  types.ts       wire protocol types
  powerups.ts    powerup definitions

public/sprites/  PixelLab-generated sprites (4 directions per character)
```

## Tweaking the game

Most numbers are in `shared/constants.ts`:
- `TICK_RATE` — server tick rate (default 20Hz)
- `ARENA_WIDTH/HEIGHT` — arena size
- `PLAYER_SPEED`, `PLAYER_BASE_HP`, `NPC_*`, `GEM_*` — gameplay tuning
- `WEAPON_DEFS` — damage, cooldown, range, projectile speed per weapon
- `CHARACTER_BASES` — per-character stat multipliers and starting weapon

Add powerups in `shared/powerups.ts`.

## Deploying

**PartyKit server:** `npm run deploy:party` (will prompt you to log in via Cloudflare email link the first time). It returns a URL like `survivors-online.YOUR_USER.partykit.dev`.

**Next.js frontend:** push to a Vercel project. Set `NEXT_PUBLIC_PARTYKIT_HOST` to the PartyKit URL above, then update `game/scene.ts` to use it (replace the `PARTY_HOST` const).

## Adding sprites

PixelLab characters use 4 rotations: `south`, `north`, `east`, `west`. Drop new ones into `public/sprites/{name}_{dir}.png` and they'll auto-load. The Phaser scene generates colored-circle fallbacks for any missing sprite, so the game runs even without art.
