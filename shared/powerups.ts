import { MAX_PROJECTILE_BONUS } from './constants';
import type { PlayerState } from './types';

export type Powerup = {
  id: string;
  name: string;
  description: string;
  icon: string;             // emoji fallback shown when no sprite is available
  iconSprite?: string;      // path to a sprite — preferred over icon when set
  apply: (p: PlayerState) => void;
  available?: (p: PlayerState) => boolean;
};

// Helper: minimum-level gate
const minLevel = (level: number) => (p: PlayerState) => p.level >= level;

export const POWERUPS: Powerup[] = [
  // ---- Damage ----
  {
    id: 'damage_up', icon: '⚔️',
    name: '+25% Damage',
    description: 'All weapons hit harder.',
    apply: (p) => { p.damageMul *= 1.25; },
  },
  {
    id: 'mega_damage', icon: '💥',
    name: 'Mega Damage',
    description: '+50% damage. Levels 5+.',
    available: minLevel(5),
    apply: (p) => { p.damageMul *= 1.5; },
  },
  {
    id: 'crit', icon: '⚡',
    name: 'Critical Strike',
    description: '+15% chance for double damage.',
    available: (p) => p.level >= 3 && p.critChance < 0.75,
    apply: (p) => { p.critChance = Math.min(0.75, p.critChance + 0.15); },
  },

  // ---- Speed / Cooldown ----
  {
    id: 'speed_up', icon: '🏃',
    name: '+5% Move Speed',
    description: 'Run faster.',
    apply: (p) => { p.speedMul = Math.min(1.5, p.speedMul * 1.05); },
  },
  {
    id: 'cooldown_down', icon: '⏱️',
    name: '-15% Cooldown',
    description: 'Attack more often.',
    apply: (p) => { p.cooldownMul *= 0.85; },
  },
  {
    id: 'fast_hands', icon: '🤲',
    name: 'Fast Hands',
    description: '-25% cooldown. Levels 5+.',
    available: minLevel(5),
    apply: (p) => { p.cooldownMul *= 0.75; },
  },

  // ---- Health ----
  {
    id: 'hp_up', icon: '❤️',
    name: '+25 Max HP',
    description: 'More max HP and a full heal.',
    apply: (p) => { p.maxHp += 25; p.hp = p.maxHp; },
  },
  {
    id: 'regen', icon: '💚',
    name: 'Regeneration',
    description: '+1 HP/sec passive heal.',
    available: (p) => p.regenPerSec < 5,
    apply: (p) => { p.regenPerSec += 1; },
  },
  {
    id: 'vampire', icon: '🩸',
    name: 'Vampiric Bite',
    description: 'Heal 10% of damage dealt. Levels 3+.',
    available: (p) => p.level >= 3 && p.vampireFraction < 0.4,
    apply: (p) => { p.vampireFraction += 0.1; },
  },

  // ---- Pickup / Magic ----
  {
    id: 'pickup_up', icon: '🧲', iconSprite: '/sprites/gem_blue.png',
    name: '+50% Pickup Range',
    description: 'Vacuum gems from further away.',
    apply: (p) => { p.pickupMul *= 1.5; },
  },

  // ---- Range / lifetime ----
  {
    id: 'extended_range', icon: '🏹',
    name: 'Extended Range',
    description: 'Projectiles travel +35% farther.',
    available: (p) => p.projectileLifeMul < 2.5,
    apply: (p) => { p.projectileLifeMul *= 1.35; },
  },

  // ---- Pierce / Aura / Risk ----
  {
    id: 'piercing', icon: '➡️',
    name: 'Piercing Shot',
    description: 'Projectiles pierce +1 enemy.',
    available: (p) => p.pierceCount < 4,
    apply: (p) => { p.pierceCount += 1; },
  },
  {
    id: 'frost_aura', icon: '❄️',
    name: 'Frost Aura',
    description: 'Damage enemies near you. Levels 3+.',
    available: (p) => p.level >= 3 && p.frostAuraDmg < 24,
    apply: (p) => {
      if (p.frostAuraDmg === 0) {
        p.frostAuraDmg = 6;
        p.frostAuraRadius = 80;
      } else {
        p.frostAuraDmg += 4;
        p.frostAuraRadius += 12;
      }
    },
  },
  {
    id: 'lucky_gems', icon: '🍀', iconSprite: '/sprites/gem_gold.png',
    name: 'Lucky Gems',
    description: '+50% XP from every gem.',
    available: (p) => p.xpMul < 3,
    apply: (p) => { p.xpMul *= 1.5; },
  },
  {
    id: 'bigger_heart', icon: '❤️‍🔥',
    name: 'Bigger Heart',
    description: '+50 max HP and full heal. Levels 3+.',
    available: minLevel(3),
    apply: (p) => { p.maxHp += 50; p.hp = p.maxHp; },
  },
  {
    id: 'glass_cannon', icon: '💢',
    name: 'Glass Cannon',
    description: '-25% max HP, +60% damage. Levels 5+.',
    available: (p) => p.level >= 5 && p.maxHp > 60,
    apply: (p) => {
      p.maxHp = Math.max(40, Math.round(p.maxHp * 0.75));
      p.hp = Math.min(p.hp, p.maxHp);
      p.damageMul *= 1.6;
    },
  },
  {
    id: 'time_shield', icon: '🛡',
    name: 'Time Shield',
    description: 'Every 30s, take 0 damage for 5s. Levels 4+.',
    available: (p) => p.level >= 4 && !p.timeShieldEnabled,
    apply: (p) => { p.timeShieldEnabled = true; },
  },
  {
    id: 'lightning_strike', icon: '⚡',
    name: 'Lightning Strike',
    description: 'A bolt smites a random foe every 4 seconds. Levels 3+.',
    available: (p) => p.level >= 3 && !p.lightningStrikeEnabled,
    apply: (p) => { p.lightningStrikeEnabled = true; },
  },
  {
    id: 'meteor_shower', icon: '☄️',
    name: 'Meteor Shower',
    description: '3 meteors crash on random foes every 8s. Levels 4+.',
    available: (p) => p.level >= 4 && !p.meteorShowerEnabled,
    apply: (p) => { p.meteorShowerEnabled = true; },
  },
  {
    id: 'frost_nova', icon: '🧊',
    name: 'Frost Nova',
    description: 'An icy ring bursts from you every 6s, damaging and slowing foes. Levels 3+.',
    available: (p) => p.level >= 3 && !p.frostNovaEnabled,
    apply: (p) => { p.frostNovaEnabled = true; },
  },
  {
    id: 'holy_smite', icon: '✨',
    name: 'Holy Smite',
    description: 'A pillar of light vaporises a random foe every 5s. Levels 4+.',
    available: (p) => p.level >= 4 && !p.holySmiteEnabled,
    apply: (p) => { p.holySmiteEnabled = true; },
  },
  {
    id: 'black_hole', icon: '🕳️',
    name: 'Black Hole',
    description: 'A vortex pulls and grinds foes for 3s every 18s. Levels 6+.',
    available: (p) => p.level >= 6 && !p.blackHoleEnabled,
    apply: (p) => { p.blackHoleEnabled = true; },
  },
  {
    id: 'phoenix_rebirth', icon: '🔥',
    name: 'Phoenix Rebirth',
    description: 'On death, revive once with full HP and a fiery blast. Levels 5+.',
    available: (p) => p.level >= 5 && !p.phoenixRebirthEnabled,
    apply: (p) => { p.phoenixRebirthEnabled = true; },
  },
  {
    id: 'chain_reaction', icon: '💥',
    name: 'Chain Reaction',
    description: 'Killed foes have a 25% chance to detonate. No infinite chains.',
    available: (p) => p.level >= 3 && !p.chainReactionEnabled,
    apply: (p) => { p.chainReactionEnabled = true; },
  },
  {
    id: 'missile_barrage', icon: '🎯',
    name: 'Missile Barrage',
    description: '8 homing missiles streak out every 12s. Levels 4+.',
    available: (p) => p.level >= 4 && !p.missileBarrageEnabled,
    apply: (p) => { p.missileBarrageEnabled = true; },
  },
  {
    id: 'earthquake', icon: '🌋',
    name: 'Earthquake',
    description: 'A shockwave damages and shoves foes back every 12s. Levels 4+.',
    available: (p) => p.level >= 4 && !p.earthquakeEnabled,
    apply: (p) => { p.earthquakeEnabled = true; },
  },
  {
    id: 'spirit_wolves', icon: '🐺', iconSprite: '/sprites/icon_wolf.png',
    name: 'Spirit Wolf',
    description: 'A ghostly wolf orbits you and lunges at nearby foes. Levels 4+.',
    available: (p) => p.level >= 4 && !p.spiritWolvesEnabled,
    apply: (p) => { p.spiritWolvesEnabled = true; p.spiritWolfCount = 1; },
  },
  {
    id: 'spirit_wolves_more', icon: '🐺', iconSprite: '/sprites/icon_wolf.png',
    name: 'Pack Howl',
    description: '+1 Spirit Wolf. Stacks up to 3 total.',
    available: (p) => p.spiritWolvesEnabled && p.spiritWolfCount < 3,
    apply: (p) => { p.spiritWolfCount = Math.min(3, p.spiritWolfCount + 1); },
  },
  {
    id: 'bloodbath', icon: '🩸',
    name: 'Bloodbath',
    description: 'Below 30% HP, deal +30% damage. Capped — no stacking.',
    available: (p) => p.level >= 3 && !p.bloodbathEnabled,
    apply: (p) => { p.bloodbathEnabled = true; },
  },
  {
    id: 'soul_harvest', icon: '🌙',
    name: 'Soul Harvest',
    description: 'Each kill grants +0.1% damage permanently (max +50%). Levels 3+.',
    available: (p) => p.level >= 3 && !p.soulHarvestEnabled,
    apply: (p) => { p.soulHarvestEnabled = true; },
  },
  {
    id: 'trail_of_fire', icon: '🔥',
    name: 'Trail of Fire',
    description: 'Leave a burning trail behind you that scorches foes. Levels 3+.',
    available: (p) => p.level >= 3 && !p.trailOfFireEnabled,
    apply: (p) => { p.trailOfFireEnabled = true; },
  },
  {
    id: 'time_stop', icon: '⏸️',
    name: 'Time Stop',
    description: 'Freeze nearby foes for 2s every 25s. Levels 5+.',
    available: (p) => p.level >= 5 && !p.timeStopEnabled,
    apply: (p) => { p.timeStopEnabled = true; },
  },

  // ---- Tier-2 upgrades (only appear if you already have the base) ----
  {
    id: 'aura_shield_wider', icon: '🛡️',
    name: 'Wider Aura',
    description: '+50% Aura Shield radius. Stacks up to 2.5×.',
    available: (p) => p.weapons.includes('aura_shield') && p.auraShieldRangeMul < 2.5,
    apply: (p) => { p.auraShieldRangeMul = Math.min(2.5, p.auraShieldRangeMul * 1.5); },
  },
  {
    id: 'trail_of_fire_longer', icon: '🔥',
    name: 'Lingering Trail',
    description: 'Trail of Fire lasts 50% longer. Stacks up to 2.5×.',
    available: (p) => p.trailOfFireEnabled && p.trailDurationMul < 2.5,
    apply: (p) => { p.trailDurationMul = Math.min(2.5, p.trailDurationMul * 1.5); },
  },
  {
    id: 'frost_nova_bigger', icon: '🧊',
    name: 'Glacial Burst',
    description: '+40% Frost Nova radius. Stacks up to 2.2×.',
    available: (p) => p.frostNovaEnabled && p.frostNovaRadiusMul < 2.2,
    apply: (p) => { p.frostNovaRadiusMul = Math.min(2.2, p.frostNovaRadiusMul * 1.4); },
  },
  {
    id: 'lightning_faster', icon: '⚡',
    name: 'Quickfire Bolts',
    description: '-30% Lightning Strike cooldown. Stacks down to 0.4×.',
    available: (p) => p.lightningStrikeEnabled && p.lightningCooldownMul > 0.4,
    apply: (p) => { p.lightningCooldownMul = Math.max(0.4, p.lightningCooldownMul * 0.7); },
  },

  // ---- Projectile shape ----
  {
    id: 'extra_projectile', icon: '➕',
    name: '+1 Projectile',
    description: 'Every weapon fires +1 shot.',
    apply: (p) => { p.projectileBonus = Math.min(MAX_PROJECTILE_BONUS, p.projectileBonus + 1); },
  },
  {
    id: 'extra_projectile_2', icon: '✨',
    name: '+2 Projectiles',
    description: 'Every weapon fires +2 shots. Levels 5+.',
    available: minLevel(5),
    apply: (p) => { p.projectileBonus = Math.min(MAX_PROJECTILE_BONUS, p.projectileBonus + 2); },
  },
  {
    id: 'big_hit', icon: '🎯',
    name: 'Bigger Hits',
    description: '+30% projectile size. Easier to land.',
    available: (p) => p.bigHitMul < 2.2,
    apply: (p) => { p.bigHitMul *= 1.3; },
  },
  {
    id: 'splash', icon: '💣',
    name: 'Splash Damage',
    description: 'Projectiles explode on impact. Levels 4+.',
    available: (p) => p.level >= 4 && p.splashRadius < 80,
    apply: (p) => { p.splashRadius = p.splashRadius === 0 ? 36 : p.splashRadius + 16; },
  },

  // ---- Weapon adds (priority on level-up) — use the actual projectile sprite
  {
    id: 'add_sword', icon: '🪨', iconSprite: '/sprites/proj_earth.png',
    name: 'Add Rock Throw',
    description: 'Throws a heavy rock at the nearest foe.',
    available: (p) => !p.weapons.includes('sword'),
    apply: (p) => { if (!p.weapons.includes('sword')) p.weapons.push('sword'); },
  },
  {
    id: 'add_orb', icon: '🔮', iconSprite: '/sprites/proj_arcane.png',
    name: 'Add Arcane Orb',
    description: 'A glowing orb of arcane energy.',
    available: (p) => !p.weapons.includes('orb'),
    apply: (p) => { if (!p.weapons.includes('orb')) p.weapons.push('orb'); },
  },
  {
    id: 'add_dagger', icon: '🍃', iconSprite: '/sprites/proj_forest.png',
    name: 'Add Leaf Cutter',
    description: 'Fires twin leaves in a tight spread.',
    available: (p) => !p.weapons.includes('dagger'),
    apply: (p) => { if (!p.weapons.includes('dagger')) p.weapons.push('dagger'); },
  },
  {
    id: 'add_fireball', icon: '🔥', iconSprite: '/sprites/proj_fire.png',
    name: 'Add Fireball',
    description: 'A slow, heavy-hitting flame.',
    available: (p) => !p.weapons.includes('fireball'),
    apply: (p) => { if (!p.weapons.includes('fireball')) p.weapons.push('fireball'); },
  },
  {
    id: 'add_lightning_bolt', icon: '⚡', iconSprite: '/sprites/proj_lightning.png',
    name: 'Add Lightning Bolt',
    description: 'Three crackling bolts of light.',
    available: (p) => !p.weapons.includes('lightning_bolt'),
    apply: (p) => { if (!p.weapons.includes('lightning_bolt')) p.weapons.push('lightning_bolt'); },
  },
  {
    id: 'add_shadow_bolt', icon: '🌑', iconSprite: '/sprites/proj_shadow.png',
    name: 'Add Shadow Bolt',
    description: 'A homing bolt of darkness that chases its prey.',
    available: (p) => !p.weapons.includes('shadow_bolt'),
    apply: (p) => { if (!p.weapons.includes('shadow_bolt')) p.weapons.push('shadow_bolt'); },
  },
  {
    id: 'add_orbital_spark', icon: '🌀', iconSprite: '/sprites/icon_orbital.png?v=1',
    name: 'Add Orbiting Sparks',
    description: 'Three sparks circle you, striking all foes they touch.',
    available: (p) => !p.weapons.includes('orbital_spark'),
    apply: (p) => { if (!p.weapons.includes('orbital_spark')) p.weapons.push('orbital_spark'); },
  },
  {
    id: 'add_aura_shield', icon: '🛡️',
    name: 'Add Aura Shield',
    description: 'A glowing ring around you that singes nearby foes.',
    available: (p) => !p.weapons.includes('aura_shield'),
    apply: (p) => { if (!p.weapons.includes('aura_shield')) p.weapons.push('aura_shield'); },
  },
];

export function rollPowerupChoices(player: PlayerState, n = 3): Powerup[] {
  const isWeapon = (p: Powerup) => p.id.startsWith('add_');
  const available = POWERUPS.filter((p) => !p.available || p.available(player));
  const weaponPool = available.filter(isWeapon);
  const statPool = available.filter((p) => !isWeapon(p));

  const choices: Powerup[] = [];
  // Guarantee one weapon unlock if any are still available
  if (weaponPool.length > 0) {
    const idx = Math.floor(Math.random() * weaponPool.length);
    choices.push(weaponPool[idx]);
  }
  const shuffledStats = [...statPool].sort(() => Math.random() - 0.5);
  while (choices.length < n && shuffledStats.length > 0) {
    choices.push(shuffledStats.shift()!);
  }
  const remainingWeapons = weaponPool.filter((w) => !choices.includes(w));
  while (choices.length < n && remainingWeapons.length > 0) {
    choices.push(remainingWeapons.shift()!);
  }
  return choices.slice(0, n);
}
