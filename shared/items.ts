import type { PlayerState } from './types';

export type MobaItem = {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  category: 'damage' | 'magic' | 'lifesteal' | 'defense' | 'speed' | 'legendary';
  unique?: boolean;
  apply: (p: PlayerState) => void;
};

export const MOBA_ITEMS: MobaItem[] = [
  // ── ⚔️ Damage ────────────────────────────────────────────────────────────
  {
    id: 'blade_shard', name: 'Blade Shard', icon: '🗡️', cost: 250,
    category: 'damage',
    description: '+12% Attack Damage',
    apply: (p) => { p.damageMul *= 1.12; },
  },
  {
    id: 'warrior_boots', name: 'Warrior Boots', icon: '🥾', cost: 500,
    category: 'damage', unique: true,
    description: '+12% Damage  +8% Movement Speed',
    apply: (p) => { p.damageMul *= 1.12; p.speedMul = Math.min(p.speedMul * 1.08, 1.5); },
  },
  {
    id: 'berserker', name: "Berserker's Fury", icon: '⚡', cost: 650,
    category: 'damage',
    description: '+25% Damage  +8% Crit Chance',
    apply: (p) => { p.damageMul *= 1.25; p.critChance = Math.min(p.critChance + 0.08, 0.75); },
  },
  {
    id: 'blade_of_despair', name: 'Blade of Despair', icon: '🔱', cost: 900,
    category: 'damage',
    description: '+40% Attack Damage — the strongest damage item',
    apply: (p) => { p.damageMul *= 1.40; },
  },
  {
    id: 'endless_battle', name: 'Endless Battle', icon: '⚔️', cost: 850,
    category: 'damage',
    description: '+22% Damage  +6% Lifesteal  +8% Speed',
    apply: (p) => {
      p.damageMul *= 1.22;
      p.vampireFraction = Math.min(p.vampireFraction + 0.06, 0.4);
      p.speedMul = Math.min(p.speedMul * 1.08, 1.5);
    },
  },

  // ── 🔮 Magic / Cooldown ──────────────────────────────────────────────────
  {
    id: 'arcane_shard', name: 'Arcane Shard', icon: '💠', cost: 250,
    category: 'magic',
    description: '−12% Cooldown on all abilities',
    apply: (p) => { p.cooldownMul *= 0.88; },
  },
  {
    id: 'genius_wand', name: 'Genius Wand', icon: '🌀', cost: 600,
    category: 'magic',
    description: '−20% Cooldown  +12% Damage',
    apply: (p) => { p.cooldownMul *= 0.80; p.damageMul *= 1.12; },
  },
  {
    id: 'lightning_truncheon', name: 'Lightning Truncheon', icon: '⚡', cost: 650,
    category: 'magic',
    description: '+15% Damage. Periodic chain lightning strikes a nearby enemy.',
    apply: (p) => { p.damageMul *= 1.15; p.lightningStrikeEnabled = true; },
  },

  // ── 🩸 Lifesteal ─────────────────────────────────────────────────────────
  {
    id: 'hunter_strike', name: "Hunter's Strike", icon: '🩸', cost: 200,
    category: 'lifesteal',
    description: '+8% Lifesteal — heal for part of damage dealt',
    apply: (p) => { p.vampireFraction = Math.min(p.vampireFraction + 0.08, 0.4); },
  },
  {
    id: 'haas_claws', name: "Haas's Claws", icon: '🦅', cost: 600,
    category: 'lifesteal',
    description: '+18% Lifesteal  +10% Damage',
    apply: (p) => {
      p.vampireFraction = Math.min(p.vampireFraction + 0.18, 0.4);
      p.damageMul *= 1.10;
    },
  },
  {
    id: 'bloodlust_axe', name: 'Bloodlust Axe', icon: '🪓', cost: 700,
    category: 'lifesteal',
    description: '+20% Damage  +10% Lifesteal',
    apply: (p) => {
      p.damageMul *= 1.20;
      p.vampireFraction = Math.min(p.vampireFraction + 0.10, 0.4);
    },
  },

  // ── 🛡️ Defense / HP ──────────────────────────────────────────────────────
  {
    id: 'ruby', name: 'Ruby', icon: '💎', cost: 200,
    category: 'defense',
    description: '+40 Max HP and instant heal',
    apply: (p) => { p.maxHp += 40; p.hp = Math.min(p.hp + 40, p.maxHp); },
  },
  {
    id: 'dominance_ice', name: 'Dominance Ice', icon: '🧊', cost: 600,
    category: 'defense',
    description: '+80 Max HP  −20% Cooldown',
    apply: (p) => { p.maxHp += 80; p.hp = Math.min(p.hp + 80, p.maxHp); p.cooldownMul *= 0.80; },
  },
  {
    id: 'oracle', name: 'Oracle', icon: '🔮', cost: 550,
    category: 'defense',
    description: '+80 Max HP  +1.5 HP Regen per second',
    apply: (p) => { p.maxHp += 80; p.hp = Math.min(p.hp + 80, p.maxHp); p.regenPerSec = Math.min(p.regenPerSec + 1.5, 5); },
  },
  {
    id: 'immortality', name: 'Immortality', icon: '👼', cost: 800,
    category: 'defense', unique: true,
    description: '+100 Max HP. Revive once per life with a fire burst.',
    apply: (p) => { p.maxHp += 100; p.hp = Math.min(p.hp + 100, p.maxHp); p.phoenixRebirthEnabled = true; p.phoenixUsed = false; },
  },
  {
    id: 'queen_wings', name: "Queen's Wings", icon: '🦋', cost: 700,
    category: 'defense',
    description: '+60 Max HP. +18% Damage when below 30% HP.',
    apply: (p) => { p.maxHp += 60; p.hp = Math.min(p.hp + 60, p.maxHp); p.bloodbathEnabled = true; },
  },

  // ── 👟 Speed ─────────────────────────────────────────────────────────────
  {
    id: 'rapid_boots', name: 'Rapid Boots', icon: '👟', cost: 250,
    category: 'speed', unique: true,
    description: '+12% Movement Speed',
    apply: (p) => { p.speedMul = Math.min(p.speedMul * 1.12, 1.5); },
  },
  {
    id: 'swift_treads', name: 'Swift Treads', icon: '🌬️', cost: 400,
    category: 'speed', unique: true,
    description: '+8% Speed  −12% Cooldown',
    apply: (p) => { p.speedMul = Math.min(p.speedMul * 1.08, 1.5); p.cooldownMul *= 0.88; },
  },

  // ── ✨ Legendary (passive proc / active ability) ──────────────────────────
  {
    id: 'winter_truncheon', name: 'Winter Truncheon', icon: '❄️', cost: 600,
    category: 'legendary', unique: true,
    description: 'Periodic Frost Nova — releases an ice ring that damages and slows enemies.',
    apply: (p) => { p.frostNovaEnabled = true; },
  },
  {
    id: 'calamity_reaper', name: 'Calamity Reaper', icon: '⏱️', cost: 700,
    category: 'legendary', unique: true,
    description: 'Periodic Time Stop — freezes all nearby enemies for 2 seconds.',
    apply: (p) => { p.timeStopEnabled = true; },
  },
  {
    id: 'aegis', name: 'Aegis Shield', icon: '🛡️', cost: 700,
    category: 'legendary', unique: true,
    description: 'Time Shield — periodic 5-second damage immunity window.',
    apply: (p) => { p.timeShieldEnabled = true; },
  },
  {
    id: 'glowing_wand', name: 'Glowing Wand', icon: '🔥', cost: 650,
    category: 'legendary', unique: true,
    description: '+10% Damage. Leaves a trail of fire while moving.',
    apply: (p) => { p.damageMul *= 1.10; p.trailOfFireEnabled = true; },
  },
];

export const MOBA_ITEMS_MAP = new Map(MOBA_ITEMS.map(i => [i.id, i]));
