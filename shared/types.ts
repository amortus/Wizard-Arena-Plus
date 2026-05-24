import type { CharacterKind, MonsterKind, WeaponKind } from './constants';

export type HazardKind = 'fire_pool' | 'lightning_strike' | 'poison_cloud' | 'slow_zone' | 'smoke_zone';

export type PickupKind = 'health' | 'speed' | 'damage' | 'shield' | 'cooldown' | 'berserker' | 'annihilate';

export type PickupState = {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
};

export type HazardState = {
  id: string;
  kind: HazardKind;
  x: number;
  y: number;
  radius: number;
  warningUntilMs: number;
  activeUntilMs: number;
};

export type PlayerState = {
  id: string;
  name: string;
  character: CharacterKind;
  color: number; // legacy tint hex (kept for compat)
  hue: number;   // hue rotation in radians applied to the sprite (0 = original)
  country?: string; // ISO 2-letter code
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  alive: boolean;
  facing: 'south' | 'north' | 'east' | 'west';
  // multipliers from powerups
  damageMul: number;
  speedMul: number;
  pickupMul: number;
  cooldownMul: number;
  weapons: WeaponKind[];
  // Per-player wave info — each player has their own horde scaled to their level
  waveNumber: number;
  waveName: string;
  waveTimeLeftMs: number;
  invulnerableUntil: number;
  projectileBonus: number;
  bigHitMul: number;
  splashRadius: number;
  vampireFraction: number;
  regenPerSec: number;
  critChance: number;
  pierceCount: number;
  frostAuraDmg: number;
  frostAuraRadius: number;
  xpMul: number;
  projectileLifeMul: number;
  // Time Shield — periodic 5s damage immunity
  timeShieldEnabled: boolean;
  damageImmuneUntil: number;
  // Lightning Strike — periodic random AOE strike
  lightningStrikeEnabled: boolean;
  // Meteor Shower — periodic 3-meteor barrage
  meteorShowerEnabled: boolean;
  // Frost Nova — periodic ring of ice around player
  frostNovaEnabled: boolean;
  // Holy Smite — periodic high-damage single-target column
  holySmiteEnabled: boolean;
  // Black Hole — periodic vortex that pulls + damages
  blackHoleEnabled: boolean;
  // Phoenix Rebirth — once-per-life revive with fire AOE
  phoenixRebirthEnabled: boolean;
  phoenixUsed: boolean;
  // Chain Reaction — on kill, 25% chance to detonate the corpse (one-hop only)
  chainReactionEnabled: boolean;
  // Magic Missile Barrage — periodic 8 homing missiles
  missileBarrageEnabled: boolean;
  // Earthquake — periodic shockwave with damage + knockback
  earthquakeEnabled: boolean;
  // Spirit Wolves — autonomous companion summons. Starts at 1, can upgrade to max 3.
  spiritWolvesEnabled: boolean;
  spiritWolfCount: number;
  // Bloodbath — +30% damage when below 30% HP (capped multiplier, not stacking)
  bloodbathEnabled: boolean;
  // Soul Harvest — permanent damage stacks per kill, capped at +50%
  soulHarvestEnabled: boolean;
  soulHarvestStacks: number;
  // Trail of Fire — drops damaging fire patches behind player while moving
  trailOfFireEnabled: boolean;
  // Time Stop — freezes nearby foes for 2s every 25s
  timeStopEnabled: boolean;
  // ----- Tier-2 upgrades that build on already-applied powerups -----
  // Aura Shield — multiplier on the weapon's base range (default 1).
  auraShieldRangeMul: number;
  // Trail of Fire — extends breadcrumb lifetime (default 1).
  trailDurationMul: number;
  // Frost Nova — multiplier on burst radius (default 1).
  frostNovaRadiusMul: number;
  // Lightning Strike — multiplier on cooldown (lower = faster).
  lightningCooldownMul: number;
  pendingLevelUps: number;
  // Pickup buffs — epoch ms timestamps (0 = inactive)
  speedBoostUntil: number;
  damageBoostUntil: number;
  berserkerUntil: number;
};

export type NPCState = {
  id: string;
  kind: MonsterKind;
  x: number;
  y: number;
  hp: number;
};

export type GemState = {
  id: string;
  x: number;
  y: number;
  value: number;
};

export type ProjectileState = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  weapon: WeaponKind;
};

export type BossProjectileState = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  generation: number;
};

export type WolfState = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  state: 'orbit' | 'lunge' | 'cooldown';
};

export type Snapshot = {
  type: 'snapshot';
  t: number;
  wave: number;
  waveName: string;
  waveTimeLeftMs: number;
  players: PlayerState[];
  npcs: NPCState[];
  gems: GemState[];
  projectiles: ProjectileState[];
  wolves?: WolfState[];
  hazards?: HazardState[];
  pickups?: PickupState[];
  bossProjectiles?: BossProjectileState[];
};

export type LeaderboardEntry = {
  name: string;
  country?: string;
  character?: CharacterKind;
  level: number;
  wave: number;
  score: number;
  ts: number; // ms epoch
};

export type RoomInfo = {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  wave: number;
  waveName: string;
  hasPassword: boolean;
  createdAt: number;
};

export type ClientToServer =
  | { type: 'join'; name: string; character: CharacterKind; color: number; hue: number; country?: string; roomName?: string; roomPassword?: string }
  | { type: 'input'; dx: number; dy: number }
  | { type: 'pickPowerup'; choiceIdx: number }
  | { type: 'respawn' };

export type ServerToClient =
  | Snapshot
  | { type: 'welcome'; selfId: string; arenaWidth: number; arenaHeight: number }
  | {
      type: 'levelUp';
      playerId: string;
      level: number;
      choices: {
        id: string;
        name: string;
        description: string;
        icon: string;
        iconSprite?: string;
      }[];
    }
  | { type: 'died'; playerId: string }
  | { type: 'killed'; killerId: string; victimId: string }
  | { type: 'leaderboard'; entries: LeaderboardEntry[] }
  | { type: 'full' }
  | { type: 'effect'; effect: 'lightning'; x: number; y: number }
  | { type: 'effect'; effect: 'meteor'; x: number; y: number }
  | { type: 'effect'; effect: 'frostNova'; x: number; y: number; radius: number }
  | { type: 'effect'; effect: 'holySmite'; x: number; y: number }
  | { type: 'effect'; effect: 'blackHole'; x: number; y: number; durationMs: number }
  | { type: 'effect'; effect: 'chainExplosion'; x: number; y: number }
  | { type: 'effect'; effect: 'phoenixRevive'; x: number; y: number }
  | { type: 'effect'; effect: 'earthquake'; x: number; y: number; radius: number }
  | { type: 'effect'; effect: 'timeStop'; x: number; y: number; radius: number }
  | { type: 'bossAlert'; bossName: string }
  | { type: 'authError'; reason: string }
  | { type: 'nova' };
