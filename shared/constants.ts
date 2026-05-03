export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;

export const ARENA_WIDTH = 3200;
export const ARENA_HEIGHT = 3200;

export const PLAYER_SPEED = 140;
export const PLAYER_RADIUS = 16;
export const PLAYER_BASE_HP = 100;
export const PLAYER_MAX_PER_ROOM = 6;

// NPC speed can never exceed this fraction of base player speed —
// guarantees players can always run away with a slight buffer.
export const NPC_SPEED_CAP_FRAC = 0.85;

export const NPC_RADIUS = 14;
export const NPC_BASE_SPEED = 50;
export const NPC_BASE_HP = 20;
export const NPC_DAMAGE = 8;
export const NPC_TOUCH_COOLDOWN_MS = 500;
export const NPC_MAX_COUNT = 120;
export const NPC_XP_DROP = 1;

// NPC-NPC collision (separation steering)
export const NPC_SEPARATION_RADIUS = 26;
export const NPC_SEPARATION_FORCE = 90; // px/sec push at full overlap

// Wave spawning — denser, more aggressive
export const WAVE_DURATION_MS = 18_000;
export const WAVE_COOLDOWN_MS = 1_000;
export const WAVE_BASE_SIZE = 32;             // bigger wave 1
export const WAVE_GROWTH = 10;                // +10 per wave
export const WAVE_INITIAL_BURST_FRAC = 0.65;
export const WAVE_TRICKLE_INTERVAL_MS = 600;  // tighter trickle
// Number of distinct edge anchors enemies spawn from. Scales with wave (max 4).
export const WAVE_ANCHORS_AT = (waveNum: number) =>
  waveNum <= 2 ? 1 : waveNum <= 5 ? 2 : waveNum <= 10 ? 3 : 4;

// Level damage scaling — per-level bonus, capped so late game isn't a steamroll.
export const LEVEL_DAMAGE_MUL = 0.05;       // +5% per level (was 8%)
export const LEVEL_DAMAGE_CAP_LEVELS = 14;  // bonus stops scaling after L15 (max +70%)

// Invulnerability windows (ms) — these are MAX caps; the shield drops the
// instant the player moves (or picks all pending level-up choices).
export const LEVEL_UP_INVULN_MS = 8_000;  // up to 8s if you really need to read
export const SPAWN_INVULN_MS = 1_500;     // brief safety window on (re)spawn

export const GEM_RADIUS = 8;
export const GEM_PICKUP_RADIUS = 60;

export const PROJECTILE_RADIUS = 6;
export const PROJECTILE_LIFETIME_MS = 1500;

// Steeper non-linear curve — higher levels are a real climb.
//   L1 → 13   L5 → 125   L10 → 445   L15 → 965   L20 → 1685   L25 → 2605
export const XP_FOR_LEVEL = (level: number) =>
  Math.round(6 + level * 5 + level * level * 4);

// ---- Characters (player wizards) ----

export const CHARACTERS = [
  'blue_wizard',
  'fire_wizard',
  'salamander_wizard',
  'lightning_wizard',
  'earth_wizard',
  'forest_wizard',
  'shadow_wizard',
  'mouse_apprentice',
  'frog_wizard',
  'old_man_wizard',
  'owl_wizard',
  'cat_wizard',
] as const;
export type CharacterKind = (typeof CHARACTERS)[number];

// Weapon kinds — each has a fixed element/visual identity.
export type WeaponKind =
  | 'sword'
  | 'orb'
  | 'dagger'
  | 'fireball'
  | 'lightning_bolt'
  | 'shadow_bolt'
  | 'orbital_spark'
  | 'aura_shield';   // passive damage aura that ticks while equipped

// How the projectile moves through the world.
export type ProjectilePattern = 'straight' | 'wave' | 'homing' | 'orbital';

export const WEAPON_PATTERN: Record<WeaponKind, ProjectilePattern> = {
  sword:          'straight',
  orb:            'straight',
  dagger:         'straight',
  fireball:       'straight',
  lightning_bolt: 'wave',
  shadow_bolt:    'homing',
  orbital_spark:  'orbital',
  aura_shield:    'straight', // unused (no projectiles fired)
};

// Per-weapon spread between projectiles when more than one is fired.
export const WEAPON_SPREAD: Record<WeaponKind, number> = {
  sword:          0.18,
  orb:            0.18,
  dagger:         0.45,
  fireball:       0.18,
  lightning_bolt: 0.35,
  shadow_bolt:    0.18,
  orbital_spark:  0,
  aura_shield:    0,
};

export const WEAPON_DEFS: Record<
  WeaponKind,
  {
    name: string;
    cooldownMs: number;
    damage: number;
    speed: number;
    range: number;
    projectiles: number;
  }
> = {
  sword:          { name: 'Rock Throw',      cooldownMs: 700,  damage: 16, speed: 220, range: 220, projectiles: 1 },
  orb:            { name: 'Arcane Orb',      cooldownMs: 900,  damage: 16, speed: 240, range: 320, projectiles: 1 },
  dagger:         { name: 'Leaf Cutter',     cooldownMs: 450,  damage: 6,  speed: 340, range: 220, projectiles: 3 },
  fireball:       { name: 'Fireball',        cooldownMs: 1000, damage: 22, speed: 230, range: 320, projectiles: 1 },
  lightning_bolt: { name: 'Lightning Bolt',  cooldownMs: 350,  damage: 6,  speed: 360, range: 260, projectiles: 3 },
  shadow_bolt:    { name: 'Shadow Bolt',     cooldownMs: 1100, damage: 18, speed: 220, range: 360, projectiles: 1 },
  orbital_spark:  { name: 'Orbiting Sparks', cooldownMs: 5000, damage: 8,  speed: 0,   range: 0,   projectiles: 3 },
  aura_shield:    { name: 'Aura Shield',     cooldownMs: 0,    damage: 5,  speed: 0,   range: 70,  projectiles: 0 },
};

// Each weapon has a fixed elemental identity — drives the projectile visual on the client.
export const WEAPON_ELEMENT: Record<WeaponKind, ElementKind> = {
  sword:          'earth',
  orb:            'arcane',
  dagger:         'forest',
  fireball:       'fire',
  lightning_bolt: 'lightning',
  shadow_bolt:    'shadow',
  orbital_spark:  'lightning',
  aura_shield:    'arcane',
};

export const CHARACTER_BASES: Record<
  CharacterKind,
  { weapon: WeaponKind; speedMul: number; hpMul: number; element: ElementKind }
> = {
  // Each wizard starts with a thematically matching weapon.
  blue_wizard:       { weapon: 'orb',            speedMul: 1.0,  hpMul: 1.0,  element: 'arcane'    },
  fire_wizard:       { weapon: 'fireball',       speedMul: 1.0,  hpMul: 0.9,  element: 'fire'      },
  salamander_wizard: { weapon: 'fireball',       speedMul: 0.95, hpMul: 1.1,  element: 'fire'      },
  lightning_wizard:  { weapon: 'lightning_bolt', speedMul: 1.15, hpMul: 0.85, element: 'lightning' },
  earth_wizard:      { weapon: 'sword',          speedMul: 0.95, hpMul: 1.25, element: 'earth'     },
  forest_wizard:     { weapon: 'dagger',         speedMul: 1.0,  hpMul: 1.0,  element: 'forest'    },
  shadow_wizard:     { weapon: 'shadow_bolt',    speedMul: 1.05, hpMul: 0.9,  element: 'shadow'    },
  mouse_apprentice:  { weapon: 'orb',            speedMul: 1.2,  hpMul: 0.8,  element: 'arcane'    },
  frog_wizard:       { weapon: 'dagger',         speedMul: 1.0,  hpMul: 1.05, element: 'forest'    },
  old_man_wizard:    { weapon: 'orb',            speedMul: 0.9,  hpMul: 1.30, element: 'arcane'    },
  owl_wizard:        { weapon: 'shadow_bolt',    speedMul: 1.10, hpMul: 0.95, element: 'shadow'    },
  cat_wizard:        { weapon: 'dagger',         speedMul: 1.20, hpMul: 0.90, element: 'forest'    },
};

export type ElementKind = 'arcane' | 'fire' | 'lightning' | 'earth' | 'forest' | 'shadow';

// projectile visual: outer glow color + inner core color
export const ELEMENT_VISUAL: Record<ElementKind, { glow: number; core: number; trail: number }> = {
  arcane:    { glow: 0x88aaff, core: 0xffffff, trail: 0x6688ff },
  fire:      { glow: 0xff7733, core: 0xffeecc, trail: 0xff3300 },
  lightning: { glow: 0xffee44, core: 0xffffff, trail: 0xddff66 },
  earth:     { glow: 0xaa7744, core: 0xffddaa, trail: 0x664422 },
  forest:    { glow: 0x66cc66, core: 0xddffaa, trail: 0x336622 },
  shadow:    { glow: 0xaa44dd, core: 0xeeaaff, trail: 0x441166 },
};

// ---- Monsters (NPCs) ----

export const MONSTERS = [
  // skeletons (organized — march in lines)
  'skeleton',
  'skeleton_knight',
  'stalker_skeleton',
  'crawling_skeleton',
  // zombies / undead (chaotic horde)
  'zombie_v2',
  'zombie_b',
  'bloated_zombie',
  'ghoul',
  // goblins (chaotic horde)
  'goblin',
  'goblin_brute',
  'goblin_scratcher',
  'feral_goblin',
  'fat_goblin',
  // misc (chaotic horde)
  'treant',
  'slime',
  // new — distinct creatures
  'spider',     // ground creeper (group)
  'wraith',     // floating ghost (swarm)
  'werewolf',   // pack hunter (line)
  'rat',        // tiny swarm minion (group, lots of them)
  'zombie_bear', // huge tank boss (only 3 spawn)
] as const;
export type MonsterKind = (typeof MONSTERS)[number];

// hpMul = HP toughness, speedMul = move speed, weight = spawn rarity (higher = more common)
export const MONSTER_BASES: Record<
  MonsterKind,
  { hpMul: number; speedMul: number; weight: number; tier: 'minion' | 'elite' | 'boss' }
> = {
  // tier=minion are cannon fodder, elite are tougher, boss are scary
  skeleton:          { hpMul: 1.0, speedMul: 1.0,  weight: 12, tier: 'minion' },
  skeleton_knight:   { hpMul: 2.4, speedMul: 0.85, weight: 4,  tier: 'elite'  },
  stalker_skeleton:  { hpMul: 0.8, speedMul: 1.3,  weight: 8,  tier: 'minion' },
  crawling_skeleton: { hpMul: 0.6, speedMul: 0.9,  weight: 10, tier: 'minion' },
  zombie_v2:         { hpMul: 1.3, speedMul: 0.85, weight: 12, tier: 'minion' },
  zombie_b:          { hpMul: 1.4, speedMul: 0.8,  weight: 8,  tier: 'minion' },
  bloated_zombie:    { hpMul: 2.8, speedMul: 0.65, weight: 3,  tier: 'elite'  },
  ghoul:             { hpMul: 1.6, speedMul: 1.15, weight: 5,  tier: 'elite'  },
  goblin:            { hpMul: 0.9, speedMul: 1.1,  weight: 12, tier: 'minion' },
  goblin_brute:      { hpMul: 2.6, speedMul: 0.9,  weight: 4,  tier: 'elite'  },
  goblin_scratcher:  { hpMul: 0.7, speedMul: 1.25, weight: 8,  tier: 'minion' },
  feral_goblin:      { hpMul: 0.8, speedMul: 1.4,  weight: 6,  tier: 'minion' },
  fat_goblin:        { hpMul: 2.0, speedMul: 0.75, weight: 4,  tier: 'elite'  },
  treant:            { hpMul: 4.0, speedMul: 0.55, weight: 2,  tier: 'boss'   },
  slime:             { hpMul: 1.1, speedMul: 0.95, weight: 10, tier: 'minion' },
  spider:            { hpMul: 1.0, speedMul: 1.10, weight: 10, tier: 'minion' },
  wraith:            { hpMul: 1.4, speedMul: 1.10, weight: 6,  tier: 'elite'  },
  werewolf:          { hpMul: 1.2, speedMul: 1.25, weight: 8,  tier: 'minion' },
  rat:               { hpMul: 0.35, speedMul: 1.30, weight: 16, tier: 'minion' },
  zombie_bear:       { hpMul: 6.0, speedMul: 0.70, weight: 1,  tier: 'boss'   },
};

// Per-monster NPC-NPC separation radius. Default is NPC_SEPARATION_RADIUS.
// Smaller values let minions bunch up (rats cluster tightly into a swarm).
export const MONSTER_SEPARATION_RADIUS_OVERRIDE: Partial<Record<MonsterKind, number>> = {
  rat: 10, // very tight — they swarm as a single mass
};

// Per-monster spawn-jitter radius for 'group' formations. Default 120.
// Smaller = tighter spawn cluster.
export const MONSTER_GROUP_JITTER_OVERRIDE: Partial<Record<MonsterKind, number>> = {
  rat: 36, // rats spawn nearly on top of each other for swarm feel
};

// Some monster types have a hard cap on how many spawn per wave (boss-style hordes).
// Anything not listed here uses the standard WAVE_BASE_SIZE + growth formula.
export const MONSTER_WAVE_SIZE_OVERRIDE: Partial<Record<MonsterKind, number>> = {
  zombie_bear: 3, // only 3 bears per wave — they're tanky bosses
};

// Spawn formation per monster — drives where in the wave they appear.
// 'line':   organized — spawn evenly spaced along a line perpendicular to player
// 'group':  current default — clustered around the wave anchor with random jitter
// 'swarm':  flying — spawn at random angles around the player at varying distance
// 'ambush': spawn close to player (Mimic-style ambush)
export type FormationKind = 'group' | 'line' | 'swarm' | 'ambush';

export const MONSTER_FORMATION: Record<MonsterKind, FormationKind> = {
  // Skeletons march in lines — disciplined undead soldiers
  skeleton:          'line',
  skeleton_knight:   'line',
  stalker_skeleton:  'line',
  crawling_skeleton: 'line',
  // Zombies, goblins, treants — chaotic hordes
  zombie_v2:         'group',
  zombie_b:          'group',
  bloated_zombie:    'group',
  ghoul:             'group',
  goblin:            'group',
  goblin_brute:      'group',
  goblin_scratcher:  'group',
  feral_goblin:      'group',
  fat_goblin:        'group',
  treant:            'group',
  slime:             'group',
  spider:            'group',
  // Flying — converge from all sides
  wraith:            'swarm',
  // Pack hunter — disciplined line formation
  werewolf:          'line',
  // Rat swarm — tiny things scuttle in from all sides
  rat:               'group',
  // Zombie Bear — slow boss, plodding line
  zombie_bear:       'line',
};

export function pickMonsterKind(): MonsterKind {
  const totalWeight = MONSTERS.reduce((s, m) => s + MONSTER_BASES[m].weight, 0);
  let r = Math.random() * totalWeight;
  for (const m of MONSTERS) {
    r -= MONSTER_BASES[m].weight;
    if (r <= 0) return m;
  }
  return MONSTERS[0];
}

// Each wave is a SINGLE monster type for clarity ("here come the slimes!").
// Order is deliberately interleaved: easy → harder → easy → boss → easy ...
export const WAVE_THEMES: { name: string; kind: MonsterKind }[] = [
  { name: 'Goblin Skirmish',  kind: 'goblin' },
  { name: 'Restless Bones',   kind: 'skeleton' },
  { name: 'Slime Tide',       kind: 'slime' },
  { name: 'Spider Brood',     kind: 'spider' },
  { name: 'Werewolf Pack',    kind: 'werewolf' },
  { name: 'Rotten Crowd',     kind: 'zombie_v2' },
  { name: 'Crawl of Bones',   kind: 'crawling_skeleton' },
  { name: 'Goblin Brutes',    kind: 'goblin_brute' },
  { name: 'Stalker Shadows',  kind: 'stalker_skeleton' },
  { name: 'Wraith Hour',      kind: 'wraith' },          // elite
  { name: 'Feral Pack',       kind: 'feral_goblin' },
  { name: 'Skeleton Knights', kind: 'skeleton_knight' }, // elite
  { name: 'Bloated Plague',   kind: 'bloated_zombie' },  // elite
  { name: 'Goblin Scratchers',kind: 'goblin_scratcher' },
  { name: 'Fat Goblin Mob',   kind: 'fat_goblin' },
  { name: 'Ghoul Hunger',     kind: 'ghoul' },
  { name: 'Walking Dead',     kind: 'zombie_b' },
  { name: 'Treant Awakens',   kind: 'treant' },          // boss
  { name: 'Rat Swarm',        kind: 'rat' },
  { name: 'Bear Onslaught',   kind: 'zombie_bear' },     // boss
];

export function themeForWave(waveNumber: number): { name: string; kind: MonsterKind } {
  if (waveNumber <= 0) return WAVE_THEMES[0];
  return WAVE_THEMES[(waveNumber - 1) % WAVE_THEMES.length];
}
