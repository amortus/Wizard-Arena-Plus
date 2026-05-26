import type { LeaderboardEntry } from './types';

// Collapse multiple entries from the same name into a single best-score row,
// then sort descending by score. Used by the leaderboard page and the death
// screen rank lookup so they agree on what "rank" means.
export function dedupeBestByName(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>();
  for (const e of entries) {
    const key = `${e.name}::${e.character ?? ''}`;
    const prev = best.get(key);
    if (!prev || e.score > prev.score) best.set(key, e);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
