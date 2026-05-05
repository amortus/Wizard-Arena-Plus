import type { LeaderboardEntry } from './types';

// Collapse multiple entries from the same name into a single best-score row,
// then sort descending by score. Used by the leaderboard page and the death
// screen rank lookup so they agree on what "rank" means.
export function dedupeBestByName(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const bestByName = new Map<string, LeaderboardEntry>();
  for (const e of entries) {
    const prev = bestByName.get(e.name);
    if (!prev || e.score > prev.score) bestByName.set(e.name, e);
  }
  return [...bestByName.values()].sort((a, b) => b.score - a.score);
}
