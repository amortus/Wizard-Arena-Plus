// ============================================================
// Wizard Survivor mode — data layer inspired by Vampire Survivors
// All VS-specific constants live here so party/index.ts and
// client code can import without touching existing systems.
// ============================================================

import type { WeaponKind, MonsterKind } from './constants';
import type { PlayerState } from './types';

// ── Timer ────────────────────────────────────────────────────
export const VS_TIMER_MS = 30 * 60 * 1000; // 30 minutes

// ── Slot limits ──────────────────────────────────────────────
export const VS_MAX_WEAPON_SLOTS  = 6;
export const VS_MAX_PASSIVE_SLOTS = 6;

// ── XP Curve (VS style: 5, 15, 25, 35 … +10 per level) ──────
export const VS_XP_FOR_LEVEL = (level: number): number =>
  5 + (level - 1) * 10;

// ── Chest pickup radius ──────────────────────────────────────
export const VS_CHEST_PICKUP_RADIUS = 28;
export const VS_CHEST_LIFETIME_MS   = 60_000; // chests expire after 60s

// ── Boss minutes (when bosses spawn during the 30-min run) ───
export const VS_BOSS_MINUTES = [2, 5, 10, 15, 20, 25] as const;

// Boss roster (cycling) — separate from Arena boss roster
export const VS_BOSS_ROSTER: MonsterKind[] = [
  'rat_king', 'bone_colossus', 'plague_lord',
  'wraith_lord', 'warchief', 'ancient_treant',
];

// ── Evolved weapon tints for Phaser rendering ────────────────
export const VS_EVOLVED_TINTS: Partial<Record<WeaponKind, number>> = {
  holy_bolt:    0xFFD700, // golden
  storm_daggers:0xCC44FF, // purple
  death_vortex: 0xFF2222, // red
  hellfire:     0xFF8800, // orange-white
  soul_drain:   0x44FF88, // green
  thunder_storm:0x44AAFF, // electric blue
  arcane_nova:  0xFFFFFF, // white
  eternal_orbit:0xFF44AA, // pink
};

// ── Weapon-level progression ─────────────────────────────────
// Each array has 8 entries (levels 1-8).
// dmgMul:        multiplier on WEAPON_DEFS[w].damage
// cooldownMul:   multiplier on WEAPON_DEFS[w].cooldownMs  (< 1 = faster)
// projectiles:   total projectile count at this level
// rangeMul:      multiplier on WEAPON_DEFS[w].range

export type WeaponLevelData = {
  dmgMul: number;
  cooldownMul: number;
  projectiles: number;
  rangeMul: number;
};

export const VS_WEAPON_LEVELS: Record<WeaponKind, WeaponLevelData[]> = {
  // shadow_bolt → holy_bolt  (Magic Wand analogue)
  shadow_bolt: [
    { dmgMul: 1.0,  cooldownMul: 1.00, projectiles: 1, rangeMul: 1.0 },
    { dmgMul: 1.1,  cooldownMul: 1.00, projectiles: 1, rangeMul: 1.0 },
    { dmgMul: 1.1,  cooldownMul: 0.95, projectiles: 2, rangeMul: 1.1 },
    { dmgMul: 1.2,  cooldownMul: 0.95, projectiles: 2, rangeMul: 1.1 },
    { dmgMul: 1.2,  cooldownMul: 0.90, projectiles: 2, rangeMul: 1.2 },
    { dmgMul: 1.3,  cooldownMul: 0.90, projectiles: 3, rangeMul: 1.2 },
    { dmgMul: 1.4,  cooldownMul: 0.85, projectiles: 3, rangeMul: 1.3 },
    { dmgMul: 1.5,  cooldownMul: 0.80, projectiles: 4, rangeMul: 1.3 },
  ],
  // dagger → storm_daggers  (Knife analogue)
  dagger: [
    { dmgMul: 1.0,  cooldownMul: 1.00, projectiles: 3, rangeMul: 1.0 },
    { dmgMul: 1.0,  cooldownMul: 1.00, projectiles: 4, rangeMul: 1.0 },
    { dmgMul: 1.1,  cooldownMul: 0.95, projectiles: 4, rangeMul: 1.1 },
    { dmgMul: 1.1,  cooldownMul: 0.95, projectiles: 5, rangeMul: 1.1 },
    { dmgMul: 1.2,  cooldownMul: 0.90, projectiles: 5, rangeMul: 1.2 },
    { dmgMul: 1.2,  cooldownMul: 0.85, projectiles: 6, rangeMul: 1.2 },
    { dmgMul: 1.3,  cooldownMul: 0.85, projectiles: 6, rangeMul: 1.3 },
    { dmgMul: 1.3,  cooldownMul: 0.70, projectiles: 7, rangeMul: 1.3 },
  ],
  // fireball → hellfire  (Fire Wand analogue)
  fireball: [
    { dmgMul: 1.0,  cooldownMul: 1.00, projectiles: 1, rangeMul: 1.0 },
    { dmgMul: 1.3,  cooldownMul: 1.00, projectiles: 1, rangeMul: 1.0 },
    { dmgMul: 1.6,  cooldownMul: 1.00, projectiles: 1, rangeMul: 1.1 },
    { dmgMul: 1.6,  cooldownMul: 0.95, projectiles: 2, rangeMul: 1.1 },
    { dmgMul: 1.9,  cooldownMul: 0.95, projectiles: 2, rangeMul: 1.2 },
    { dmgMul: 1.9,  cooldownMul: 0.90, projectiles: 2, rangeMul: 1.2 },
    { dmgMul: 2.2,  cooldownMul: 0.90, projectiles: 2, rangeMul: 1.3 },
    { dmgMul: 2.2,  cooldownMul: 0.85, projectiles: 3, rangeMul: 1.3 },
  ],
  // sword → death_vortex  (Axe analogue — radial fire)
  sword: [
    { dmgMul: 1.0,  cooldownMul: 1.00, projectiles: 2, rangeMul: 1.0 },
    { dmgMul: 1.25, cooldownMul: 1.00, projectiles: 2, rangeMul: 1.0 },
    { dmgMul: 1.25, cooldownMul: 1.00, projectiles: 3, rangeMul: 1.1 },
    { dmgMul: 1.5,  cooldownMul: 1.00, projectiles: 3, rangeMul: 1.1 },
    { dmgMul: 1.5,  cooldownMul: 0.95, projectiles: 4, rangeMul: 1.2 },
    { dmgMul: 1.75, cooldownMul: 0.95, projectiles: 4, rangeMul: 1.2 },
    { dmgMul: 1.75, cooldownMul: 0.90, projectiles: 5, rangeMul: 1.3 },
    { dmgMul: 2.0,  cooldownMul: 0.90, projectiles: 6, rangeMul: 1.3 },
  ],
  // lightning_bolt → thunder_storm  (Lightning Ring analogue — random target)
  lightning_bolt: [
    { dmgMul: 1.0,  cooldownMul: 1.00, projectiles: 3, rangeMul: 1.0 },
    { dmgMul: 1.0,  cooldownMul: 1.00, projectiles: 4, rangeMul: 1.0 },
    { dmgMul: 1.15, cooldownMul: 1.00, projectiles: 4, rangeMul: 1.1 },
    { dmgMul: 1.15, cooldownMul: 0.95, projectiles: 5, rangeMul: 1.1 },
    { dmgMul: 1.3,  cooldownMul: 0.95, projectiles: 5, rangeMul: 1.2 },
    { dmgMul: 1.3,  cooldownMul: 0.90, projectiles: 6, rangeMul: 1.2 },
    { dmgMul: 1.45, cooldownMul: 0.90, projectiles: 6, rangeMul: 1.3 },
    { dmgMul: 1.45, cooldownMul: 0.85, projectiles: 7, rangeMul: 1.3 },
  ],
  // orb → arcane_nova  (King Bible analogue — orbital)
  orb: [
    { dmgMul: 1.0,  cooldownMul: 1.00, projectiles: 1, rangeMul: 1.0 },
    { dmgMul: 1.2,  cooldownMul: 1.00, projectiles: 1, rangeMul: 1.0 },
    { dmgMul: 1.2,  cooldownMul: 1.00, projectiles: 2, rangeMul: 1.0 },
    { dmgMul: 1.4,  cooldownMul: 1.00, projectiles: 2, rangeMul: 1.1 },
    { dmgMul: 1.4,  cooldownMul: 0.95, projectiles: 3, rangeMul: 1.1 },
    { dmgMul: 1.6,  cooldownMul: 0.95, projectiles: 3, rangeMul: 1.2 },
    { dmgMul: 1.6,  cooldownMul: 0.90, projectiles: 4, rangeMul: 1.2 },
    { dmgMul: 1.8,  cooldownMul: 0.90, projectiles: 5, rangeMul: 1.3 },
  ],
  // orbital_spark → eternal_orbit  (Runetracer analogue — orbital)
  orbital_spark: [
    { dmgMul: 1.0,  cooldownMul: 1.00, projectiles: 3, rangeMul: 1.0 },
    { dmgMul: 1.2,  cooldownMul: 1.00, projectiles: 3, rangeMul: 1.0 },
    { dmgMul: 1.2,  cooldownMul: 1.00, projectiles: 4, rangeMul: 1.0 },
    { dmgMul: 1.4,  cooldownMul: 0.95, projectiles: 4, rangeMul: 1.0 },
    { dmgMul: 1.4,  cooldownMul: 0.95, projectiles: 5, rangeMul: 1.0 },
    { dmgMul: 1.6,  cooldownMul: 0.90, projectiles: 5, rangeMul: 1.0 },
    { dmgMul: 1.6,  cooldownMul: 0.90, projectiles: 6, rangeMul: 1.0 },
    { dmgMul: 1.8,  cooldownMul: 0.85, projectiles: 7, rangeMul: 1.0 },
  ],
  // aura_shield → soul_drain  (Garlic analogue — passive aura)
  aura_shield: [
    { dmgMul: 1.0,  cooldownMul: 1.0, projectiles: 0, rangeMul: 1.0 },
    { dmgMul: 1.0,  cooldownMul: 1.0, projectiles: 0, rangeMul: 1.2 },
    { dmgMul: 1.3,  cooldownMul: 1.0, projectiles: 0, rangeMul: 1.2 },
    { dmgMul: 1.3,  cooldownMul: 1.0, projectiles: 0, rangeMul: 1.4 },
    { dmgMul: 1.6,  cooldownMul: 1.0, projectiles: 0, rangeMul: 1.4 },
    { dmgMul: 1.6,  cooldownMul: 1.0, projectiles: 0, rangeMul: 1.6 },
    { dmgMul: 1.9,  cooldownMul: 1.0, projectiles: 0, rangeMul: 1.6 },
    { dmgMul: 1.9,  cooldownMul: 1.0, projectiles: 0, rangeMul: 1.8 },
  ],
  // Evolved weapons — not upgradeable (always stay at the data for level 1)
  holy_bolt: [
    { dmgMul: 1.0, cooldownMul: 1.0, projectiles: 4, rangeMul: 1.0 },
    ...Array(7).fill({ dmgMul: 1.0, cooldownMul: 1.0, projectiles: 4, rangeMul: 1.0 }),
  ],
  storm_daggers: [
    { dmgMul: 1.0, cooldownMul: 1.0, projectiles: 8, rangeMul: 1.0 },
    ...Array(7).fill({ dmgMul: 1.0, cooldownMul: 1.0, projectiles: 8, rangeMul: 1.0 }),
  ],
  death_vortex: [
    { dmgMul: 1.0, cooldownMul: 1.0, projectiles: 8, rangeMul: 1.0 },
    ...Array(7).fill({ dmgMul: 1.0, cooldownMul: 1.0, projectiles: 8, rangeMul: 1.0 }),
  ],
  hellfire: [
    { dmgMul: 1.0, cooldownMul: 1.0, projectiles: 3, rangeMul: 1.0 },
    ...Array(7).fill({ dmgMul: 1.0, cooldownMul: 1.0, projectiles: 3, rangeMul: 1.0 }),
  ],
  soul_drain: [
    { dmgMul: 1.0, cooldownMul: 1.0, projectiles: 0, rangeMul: 2.0 },
    ...Array(7).fill({ dmgMul: 1.0, cooldownMul: 1.0, projectiles: 0, rangeMul: 2.0 }),
  ],
  thunder_storm: [
    { dmgMul: 1.0, cooldownMul: 1.0, projectiles: 7, rangeMul: 1.0 },
    ...Array(7).fill({ dmgMul: 1.0, cooldownMul: 1.0, projectiles: 7, rangeMul: 1.0 }),
  ],
  arcane_nova: [
    { dmgMul: 1.0, cooldownMul: 1.0, projectiles: 6, rangeMul: 1.0 },
    ...Array(7).fill({ dmgMul: 1.0, cooldownMul: 1.0, projectiles: 6, rangeMul: 1.0 }),
  ],
  eternal_orbit: [
    { dmgMul: 1.0, cooldownMul: 1.0, projectiles: 8, rangeMul: 1.0 },
    ...Array(7).fill({ dmgMul: 1.0, cooldownMul: 1.0, projectiles: 8, rangeMul: 1.0 }),
  ],
};

// ── VS targeting per weapon ──────────────────────────────────
// Determines how each weapon finds its target in wizard_survivor mode.
// 'nearest'  — fire toward closest NPC in range
// 'radial'   — fire in evenly-spaced radial directions (no NPC needed)
// 'orbital'  — orbit player (handled by orbital pattern)
// 'random'   — fire toward a random NPC in range
// 'aura'     — passive damage aura, no projectile
export type VsTargetMode = 'nearest' | 'radial' | 'orbital' | 'random' | 'aura';

export const VS_WEAPON_TARGET: Record<WeaponKind, VsTargetMode> = {
  shadow_bolt:   'nearest',
  dagger:        'nearest',
  fireball:      'nearest',
  sword:         'radial',
  lightning_bolt:'random',
  orb:           'orbital',
  orbital_spark: 'orbital',
  aura_shield:   'aura',
  // evolved
  holy_bolt:     'nearest',
  storm_daggers: 'nearest',
  death_vortex:  'radial',
  hellfire:      'nearest',
  soul_drain:    'aura',
  thunder_storm: 'random',
  arcane_nova:   'orbital',
  eternal_orbit: 'orbital',
};

// Range used for targeting in VS mode (larger than default)
export const VS_WEAPON_RANGE = 640;

// ── Passive items ────────────────────────────────────────────
export type VsPassiveItem = {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  // What this passive applies per level-up (additive each level)
  bonusPerLevel: {
    damageMulAdd?: number;       // e.g. 0.10 → +10% damage per level (applied as *= 1.10)
    cooldownMulSub?: number;     // e.g. 0.08 → -8% cooldown per level (applied as *= 0.92)
    maxHpMulAdd?: number;        // e.g. 0.20 → +20% max HP per level
    regenAdd?: number;           // absolute regen/sec added per level
    speedMulAdd?: number;        // e.g. 0.10 → +10% speed per level
    xpMulAdd?: number;           // e.g. 0.08 → +8% XP per level
    projectilesAdd?: number;     // +N to global projectileBonus per level
    pickupMulAdd?: number;       // +% pickup radius per level
    goldMulAdd?: number;         // +% gold earned per level (stored as vsGoldMul on player)
    lifestealAdd?: number;       // +% lifesteal fraction per level
    rangeAreaMulAdd?: number;    // +% to aura/area weapons per level (stored as auraShieldRangeMul)
  };
};

export const VS_PASSIVE_ITEMS: VsPassiveItem[] = [
  {
    id: 'vs_spinach',
    name: 'Spinach',
    description: '+10% damage per level. Synergy: Fireball, Rock Throw.',
    icon: '🌿',
    maxLevel: 5,
    bonusPerLevel: { damageMulAdd: 0.10 },
  },
  {
    id: 'vs_tome',
    name: 'Empty Tome',
    description: '-8% weapon cooldown per level. Synergy: Shadow Bolt.',
    icon: '📖',
    maxLevel: 5,
    bonusPerLevel: { cooldownMulSub: 0.08 },
  },
  {
    id: 'vs_candle',
    name: 'Candelabrador',
    description: '+10% weapon area per level. Synergy: Rock Throw.',
    icon: '🕯️',
    maxLevel: 5,
    bonusPerLevel: { rangeAreaMulAdd: 0.10 },
  },
  {
    id: 'vs_bracer',
    name: 'Bracer',
    description: '+15% pickup radius per level. Synergy: Leaf Cutter.',
    icon: '🎯',
    maxLevel: 5,
    bonusPerLevel: { pickupMulAdd: 0.15 },
  },
  {
    id: 'vs_heart',
    name: 'Hollow Heart',
    description: '+20% max HP per level. Synergy: Orbiting Sparks.',
    icon: '🫀',
    maxLevel: 5,
    bonusPerLevel: { maxHpMulAdd: 0.20 },
  },
  {
    id: 'vs_pummarola',
    name: 'Pummarola',
    description: '+0.2 HP/sec regen per level. Synergy: Aura Shield.',
    icon: '🍅',
    maxLevel: 5,
    bonusPerLevel: { regenAdd: 0.2 },
  },
  {
    id: 'vs_wings',
    name: 'Wings',
    description: '+10% move speed per level. Synergy: Arcane Orb.',
    icon: '🪶',
    maxLevel: 5,
    bonusPerLevel: { speedMulAdd: 0.10 },
  },
  {
    id: 'vs_duplicator',
    name: 'Duplicator',
    description: '+1 projectile to all weapons per level. Synergy: Lightning Bolt.',
    icon: '✨',
    maxLevel: 2,
    bonusPerLevel: { projectilesAdd: 1 },
  },
  {
    id: 'vs_crown',
    name: 'Crown',
    description: '+8% XP gained per level. Synergy: Arcane Orb.',
    icon: '👑',
    maxLevel: 5,
    bonusPerLevel: { xpMulAdd: 0.08 },
  },
  {
    id: 'vs_clover',
    name: 'Clover',
    description: '+10% gold bonus per level.',
    icon: '🍀',
    maxLevel: 5,
    bonusPerLevel: { goldMulAdd: 0.10 },
  },
];

// ── Evolution table ──────────────────────────────────────────
export type VsEvolution = {
  baseWeapon:    WeaponKind;
  passiveId:     string;
  evolvedWeapon: WeaponKind;
  name:          string;
  description:   string;
};

export const VS_EVOLUTIONS: VsEvolution[] = [
  {
    baseWeapon:    'shadow_bolt',
    passiveId:     'vs_tome',
    evolvedWeapon: 'holy_bolt',
    name:          'Holy Bolt',
    description:   'Fires 2× faster with 4 homing bolts of pure light.',
  },
  {
    baseWeapon:    'dagger',
    passiveId:     'vs_bracer',
    evolvedWeapon: 'storm_daggers',
    name:          'Storm Daggers',
    description:   'An endless storm of razor-sharp leaves.',
  },
  {
    baseWeapon:    'sword',
    passiveId:     'vs_candle',
    evolvedWeapon: 'death_vortex',
    name:          'Death Vortex',
    description:   'Eight spinning scythes radiate outward in all directions.',
  },
  {
    baseWeapon:    'fireball',
    passiveId:     'vs_spinach',
    evolvedWeapon: 'hellfire',
    name:          'Hellfire',
    description:   'Massive fireballs that explode on impact.',
  },
  {
    baseWeapon:    'aura_shield',
    passiveId:     'vs_pummarola',
    evolvedWeapon: 'soul_drain',
    name:          'Soul Drain',
    description:   'A massive lifesteal aura that heals you with every enemy hit.',
  },
  {
    baseWeapon:    'lightning_bolt',
    passiveId:     'vs_duplicator',
    evolvedWeapon: 'thunder_storm',
    name:          'Thunder Storm',
    description:   'Seven bolts of chain lightning strike random foes at once.',
  },
  {
    baseWeapon:    'orb',
    passiveId:     'vs_wings',
    evolvedWeapon: 'arcane_nova',
    name:          'Arcane Nova',
    description:   'Six orbiting nova spheres that also attract nearby XP gems.',
  },
  {
    baseWeapon:    'orbital_spark',
    passiveId:     'vs_heart',
    evolvedWeapon: 'eternal_orbit',
    name:          'Eternal Orbit',
    description:   'Eight orbiting sparks with vampiric healing on every hit.',
  },
];

// ── Spawn schedule ───────────────────────────────────────────
// Shared room-wide spawner (not per-player like Arena mode).
// fromMinute: schedule is active starting at this elapsed minute
// intervalMs: spawn a batch every N ms
// count: how many enemies per batch (scaled by player count)
// kinds: pool of monster kinds to pick from
export type VsSpawnEntry = {
  fromMinute: number;
  intervalMs: number;
  countMin:   number;
  countMax:   number;
  kinds:      MonsterKind[];
};

export const VS_SPAWN_SCHEDULE: VsSpawnEntry[] = [
  {
    fromMinute: 0, intervalMs: 3000, countMin: 3, countMax: 5,
    kinds: ['skeleton', 'zombie_v2', 'goblin', 'goblin_scratcher'],
  },
  {
    fromMinute: 2, intervalMs: 2500, countMin: 5, countMax: 8,
    kinds: ['skeleton', 'zombie_v2', 'goblin', 'spider', 'wraith'],
  },
  {
    fromMinute: 5, intervalMs: 2000, countMin: 8, countMax: 12,
    kinds: ['skeleton_elite', 'zombie_elite', 'goblin_elite', 'wraith', 'werewolf'],
  },
  {
    fromMinute: 10, intervalMs: 1500, countMin: 12, countMax: 18,
    kinds: ['skeleton_elite', 'zombie_elite', 'goblin_elite', 'wraith_elite', 'werewolf_elite'],
  },
  {
    fromMinute: 15, intervalMs: 1200, countMin: 15, countMax: 22,
    kinds: ['goblin_veteran', 'skeleton_veteran', 'zombie_veteran', 'werewolf_elite', 'wraith_veteran'],
  },
  {
    fromMinute: 20, intervalMs: 1000, countMin: 20, countMax: 28,
    kinds: ['zombie_veteran', 'wraith_veteran', 'werewolf_veteran', 'zombie_bear'],
  },
  {
    fromMinute: 25, intervalMs: 800, countMin: 25, countMax: 35,
    kinds: ['zombie_veteran', 'wraith_veteran', 'zombie_bear_elite', 'zombie_bear_black'],
  },
];

// Returns the active spawn entry for elapsed minutes
export function vsSpawnEntryAt(elapsedMinutes: number): VsSpawnEntry {
  let active = VS_SPAWN_SCHEDULE[0];
  for (const entry of VS_SPAWN_SCHEDULE) {
    if (elapsedMinutes >= entry.fromMinute) active = entry;
  }
  return active;
}

// ── Choice IDs for VS level-up ───────────────────────────────
// Server and client use these prefixed IDs to distinguish VS choices
// from regular powerup IDs.
export const VS_CHOICE_LEVELUP = 'vslvl:';  // + WeaponKind  → level up weapon
export const VS_CHOICE_ADD     = 'vsadd:';  // + WeaponKind  → add new weapon
export const VS_CHOICE_PASSIVE = 'vspass:'; // + passiveId   → add/level-up passive

// ── Base weapons available to add in VS mode ─────────────────
export const VS_BASE_WEAPONS: WeaponKind[] = [
  'shadow_bolt', 'dagger', 'fireball', 'sword',
  'lightning_bolt', 'orb', 'orbital_spark', 'aura_shield',
];

// ── rollVsChoices ────────────────────────────────────────────
// Returns 3 choice descriptors for the level-up modal in wizard_survivor.
// Choices are: weapon level-ups, new weapons, and passive items.
export type VsChoice = {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconSprite?: string;
};

export function rollVsChoices(
  player: PlayerState,
  weaponLevels: Partial<Record<WeaponKind, number>>,
  passiveItems: Array<{ id: string; level: number }>,
): VsChoice[] {
  const choices: VsChoice[] = [];

  // ---- Pool A: upgrade an existing weapon (only if < level 8 and not evolved) ----
  const upgradeable: VsChoice[] = [];
  for (const w of player.weapons) {
    const currentLevel = weaponLevels[w] ?? 1;
    if (currentLevel < 8 && !VS_EVOLVED_TINTS[w]) {
      const nextLevel = currentLevel + 1;
      const isReadyForEvo = nextLevel === 8 && VS_EVOLUTIONS.some(e => e.baseWeapon === w);
      upgradeable.push({
        id: `${VS_CHOICE_LEVELUP}${w}`,
        name: `Upgrade ${weaponDisplayName(w)} (Lv.${currentLevel}→${nextLevel})${isReadyForEvo ? ' ★' : ''}`,
        description: isReadyForEvo
          ? `Reaches max level — ready to evolve with the right passive!`
          : `Increase projectiles, damage, and fire rate.`,
        icon: vsWeaponIcon(w),
        iconSprite: vsWeaponSprite(w),
      });
    }
  }

  // ---- Pool B: add a new weapon (if slots available and weapon not owned) ----
  const addable: VsChoice[] = [];
  if (player.weapons.length < VS_MAX_WEAPON_SLOTS) {
    const owned = new Set(player.weapons);
    for (const w of VS_BASE_WEAPONS) {
      if (!owned.has(w)) {
        addable.push({
          id: `${VS_CHOICE_ADD}${w}`,
          name: `Add ${weaponDisplayName(w)}`,
          description: vsWeaponDescription(w),
          icon: vsWeaponIcon(w),
          iconSprite: vsWeaponSprite(w),
        });
      }
    }
  }

  // ---- Pool C: passive items (add new or level up existing, if slots available) ----
  const passiveChoices: VsChoice[] = [];
  const ownedPassiveMap = new Map(passiveItems.map(p => [p.id, p.level]));
  for (const passive of VS_PASSIVE_ITEMS) {
    const existingLevel = ownedPassiveMap.get(passive.id) ?? 0;
    if (existingLevel === 0 && passiveItems.length >= VS_MAX_PASSIVE_SLOTS) continue; // slots full
    if (existingLevel >= passive.maxLevel) continue; // already maxed
    const nextLevel = existingLevel + 1;
    const evos = VS_EVOLUTIONS.filter(e => e.passiveId === passive.id);
    const synergy = evos.length ? ` Synergy: ${evos.map(e => e.name).join(', ')}.` : '';
    passiveChoices.push({
      id: `${VS_CHOICE_PASSIVE}${passive.id}`,
      name: existingLevel === 0
        ? `${passive.name}`
        : `${passive.name} (Lv.${existingLevel}→${nextLevel})`,
      description: `${passive.description}${synergy}`,
      icon: passive.icon,
    });
  }

  // ---- Build final 3 choices ----
  // 1. Guarantee at least 1 weapon-related choice (upgrade or add)
  const weaponPool = [...upgradeable, ...addable].sort(() => Math.random() - 0.5);
  const statPool   = [...passiveChoices].sort(() => Math.random() - 0.5);

  if (weaponPool.length > 0) choices.push(weaponPool.shift()!);
  while (choices.length < 3 && statPool.length > 0)   choices.push(statPool.shift()!);
  while (choices.length < 3 && weaponPool.length > 0) choices.push(weaponPool.shift()!);

  return choices.slice(0, 3);
}

// ── Helpers ──────────────────────────────────────────────────
function weaponDisplayName(w: WeaponKind): string {
  const names: Partial<Record<WeaponKind, string>> = {
    shadow_bolt:   'Shadow Bolt',
    dagger:        'Leaf Cutter',
    fireball:      'Fireball',
    sword:         'Rock Throw',
    lightning_bolt:'Lightning Bolt',
    orb:           'Arcane Orb',
    orbital_spark: 'Orbiting Sparks',
    aura_shield:   'Aura Shield',
    holy_bolt:     'Holy Bolt',
    storm_daggers: 'Storm Daggers',
    death_vortex:  'Death Vortex',
    hellfire:      'Hellfire',
    soul_drain:    'Soul Drain',
    thunder_storm: 'Thunder Storm',
    arcane_nova:   'Arcane Nova',
    eternal_orbit: 'Eternal Orbit',
  };
  return names[w] ?? w;
}

function vsWeaponIcon(w: WeaponKind): string {
  const icons: Partial<Record<WeaponKind, string>> = {
    shadow_bolt:   '🌑', dagger:        '🍃', fireball:      '🔥',
    sword:         '🪨', lightning_bolt:'⚡', orb:           '🔮',
    orbital_spark: '🌀', aura_shield:   '🛡️',
    holy_bolt:     '✨', storm_daggers: '🌪️', death_vortex:  '💀',
    hellfire:      '☄️', soul_drain:    '🩸', thunder_storm: '🌩️',
    arcane_nova:   '💫', eternal_orbit: '♾️',
  };
  return icons[w] ?? '⚔️';
}

function vsWeaponSprite(w: WeaponKind): string | undefined {
  const sprites: Partial<Record<WeaponKind, string>> = {
    shadow_bolt:   '/sprites/proj_shadow.png',
    dagger:        '/sprites/proj_forest.png',
    fireball:      '/sprites/proj_fire.png',
    sword:         '/sprites/proj_earth.png',
    lightning_bolt:'/sprites/proj_lightning.png',
    orb:           '/sprites/proj_arcane.png',
    orbital_spark: '/sprites/icon_orbital.png?v=1',
    aura_shield:   undefined,
  };
  return sprites[w];
}

function vsWeaponDescription(w: WeaponKind): string {
  const descs: Partial<Record<WeaponKind, string>> = {
    shadow_bolt:   'A homing bolt of darkness that chases its prey.',
    dagger:        'A rapid stream of razor-sharp leaves.',
    fireball:      'A slow, devastating fireball.',
    sword:         'Rocks fly outward in all directions.',
    lightning_bolt:'Lightning strikes random enemies in range.',
    orb:           'An arcane orb that orbits you, striking everything it touches.',
    orbital_spark: 'Three sparks that orbit you and pierce all foes.',
    aura_shield:   'A burning aura that damages all nearby enemies.',
  };
  return descs[w] ?? 'A powerful weapon.';
}
