// VS Meta-progression: persistent upgrades between runs, stored in localStorage.
// Gold accumulates across runs; upgrades are purchased once and apply at run start.

export type VsMetaUpgrade = {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxRanks: number;
  goldCosts: number[];    // cost per rank (length === maxRanks)
};

export const VS_META_UPGRADES: VsMetaUpgrade[] = [
  {
    id: 'might',
    name: 'Might',
    description: '+10% starting damage per rank.',
    icon: '⚔️',
    maxRanks: 5,
    goldCosts: [200, 400, 600, 800, 1000],
  },
  {
    id: 'max_health',
    name: 'Max Health',
    description: '+20 starting HP per rank.',
    icon: '❤️',
    maxRanks: 5,
    goldCosts: [150, 300, 500, 700, 900],
  },
  {
    id: 'growth',
    name: 'Growth',
    description: '+8% XP gain per rank.',
    icon: '📈',
    maxRanks: 5,
    goldCosts: [180, 360, 540, 720, 900],
  },
  {
    id: 'magnet',
    name: 'Magnet',
    description: '+30% pickup radius per rank.',
    icon: '🧲',
    maxRanks: 5,
    goldCosts: [120, 240, 400, 600, 800],
  },
  {
    id: 'recovery',
    name: 'Recovery',
    description: '+0.5 HP/sec regen per rank.',
    icon: '🩹',
    maxRanks: 5,
    goldCosts: [200, 400, 600, 800, 1000],
  },
  {
    id: 'speed',
    name: 'Speed',
    description: '+5% move speed per rank.',
    icon: '👟',
    maxRanks: 5,
    goldCosts: [150, 300, 500, 700, 900],
  },
];

export type VsMetaState = {
  gold: number;
  ranks: Record<string, number>;   // upgradeId → current rank (0 = not bought)
};

const STORAGE_KEY = 'vs_meta';

export function loadVsMeta(): VsMetaState {
  if (typeof window === 'undefined') return { gold: 0, ranks: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as VsMetaState;
  } catch { /* ignore */ }
  return { gold: 0, ranks: {} };
}

export function saveVsMeta(state: VsMetaState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function addVsGold(amount: number): VsMetaState {
  const state = loadVsMeta();
  state.gold += amount;
  saveVsMeta(state);
  return state;
}

export function buyVsUpgrade(upgradeId: string): { ok: boolean; state: VsMetaState; error?: string } {
  const state = loadVsMeta();
  const upgrade = VS_META_UPGRADES.find(u => u.id === upgradeId);
  if (!upgrade) return { ok: false, state, error: 'Unknown upgrade' };
  const curRank = state.ranks[upgradeId] ?? 0;
  if (curRank >= upgrade.maxRanks) return { ok: false, state, error: 'Already maxed' };
  const cost = upgrade.goldCosts[curRank];
  if (state.gold < cost) return { ok: false, state, error: 'Not enough gold' };
  state.gold -= cost;
  state.ranks[upgradeId] = curRank + 1;
  saveVsMeta(state);
  return { ok: true, state };
}

// Apply meta bonuses to a player state delta (applied at run start by the server via join message).
// Returns a flat stat delta that the server can apply.
export function computeVsMetaBonuses(ranks: Record<string, number>): {
  damageMulAdd: number;
  maxHpAdd: number;
  xpMulAdd: number;
  pickupMulAdd: number;
  regenAdd: number;
  speedMulAdd: number;
} {
  return {
    damageMulAdd: (ranks['might']      ?? 0) * 0.10,
    maxHpAdd:     (ranks['max_health'] ?? 0) * 20,
    xpMulAdd:     (ranks['growth']     ?? 0) * 0.08,
    pickupMulAdd: (ranks['magnet']     ?? 0) * 0.30,
    regenAdd:     (ranks['recovery']   ?? 0) * 0.5,
    speedMulAdd:  (ranks['speed']      ?? 0) * 0.05,
  };
}
