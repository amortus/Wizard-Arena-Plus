'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { LeaderboardEntry } from '../../shared/types';
import { dedupeBestByName } from '../../shared/leaderboard';

function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  const cps = code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...cps);
}

function partyKitHost(): string {
  if (typeof window === 'undefined') return 'localhost:1999';
  const env = (process.env.NEXT_PUBLIC_PARTYKIT_HOST as string | undefined);
  if (env) return env;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'localhost:1999';
  console.error('[leaderboard] NEXT_PUBLIC_PARTYKIT_HOST is not set — leaderboard will not load.');
  return 'localhost:1999';
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https' : 'http';
        const res = await fetch(`${proto}://${partyKitHost()}/parties/main/main`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (cancelled) return;
        const deduped = dedupeBestByName(data.entries ?? []).slice(0, 100);
        setEntries(deduped);
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="menu-root">
      <div className="scanlines" />
      <div className="menu-card lb-page-card">
        <img
          src="/wizard_arena_plus_logo.png"
          alt="Madness Arena"
          className="menu-logo"
        />
        <h1 className="lb-page-title">Arena Leaderboard</h1>
        <p className="sub">Top survivors of the arena · best score per wizard</p>

        {loading ? (
          <div className="lb-empty">Loading...</div>
        ) : !entries || entries.length === 0 ? (
          <div className="lb-empty">No survivors yet — be the first.</div>
        ) : (
          <div className="lb-table">
            <div className="lb-table-head">
              <span>#</span>
              <span></span>
              <span>Wizard</span>
              <span>Level</span>
              <span>Wave</span>
              <span>Score</span>
            </div>
            {entries.map((e, i) => (
              <div key={`${e.name}-${i}`} className="lb-table-row">
                <span className="lb-rank">#{i + 1}</span>
                <span className="lb-flag">{countryFlag(e.country)}</span>
                <span className="lb-name">
                  {e.character && (
                    <img
                      className="lb-character"
                      src={`/portraits/${e.character}.png`}
                      alt=""
                      onError={(ev) => {
                        const img = ev.currentTarget;
                        if (!img.dataset.fallback) {
                          img.dataset.fallback = '1';
                          img.src = `/sprites/${e.character}_south.png`;
                        }
                      }}
                    />
                  )}
                  {e.name}
                </span>
                <span className="lb-stats">L{e.level}</span>
                <span className="lb-stats">W{e.wave}</span>
                <span className="lb-score">{e.score}</span>
              </div>
            ))}
          </div>
        )}

        <Link href="/" className="start-btn lb-back">← Back to Arena</Link>
      </div>
    </div>
  );
}
