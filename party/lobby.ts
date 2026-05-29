import type * as Party from "partykit/server";
import type { LeaderboardEntry, GameMode } from "../shared/types";

type RoomListing = {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  wave: number;
  waveName: string;
  hasPassword: boolean;
  createdAt: number;
  lastSeen: number;
  gameMode?: GameMode;
};

const STALE_MS = 20_000;
const LEADERBOARD_KEY = 'leaderboard:v1';
const LEADERBOARD_SIZE = 100;

export default class LobbyParty implements Party.Server {
  rooms = new Map<string, RoomListing>();
  leaderboard: LeaderboardEntry[] = [];
  leaderboardLoaded = false;

  constructor(readonly room: Party.Room) {
    void this.loadLeaderboard();
  }

  async loadLeaderboard() {
    try {
      const stored = await this.room.storage.get<LeaderboardEntry[]>(LEADERBOARD_KEY);
      if (stored && Array.isArray(stored)) this.leaderboard = stored;
    } catch {}
    this.leaderboardLoaded = true;
  }

  async onRequest(req: Party.Request): Promise<Response> {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!this.leaderboardLoaded) await this.loadLeaderboard();

    if (req.method === 'GET') {
      const now = Date.now();
      const active = [...this.rooms.values()]
        .filter(r => now - r.lastSeen < STALE_MS)
        .sort((a, b) => b.playerCount - a.playerCount || a.createdAt - b.createdAt);
      return new Response(JSON.stringify({ rooms: active, leaderboard: this.leaderboard }), { headers: cors });
    }

    if (req.method === 'POST') {
      const data = await req.json() as
        | (Partial<RoomListing> & { id: string; type?: undefined })
        | { type: 'leaderboard_entry'; entry: LeaderboardEntry };

      // Leaderboard entry from a game room
      if (data.type === 'leaderboard_entry' && data.entry) {
        this.leaderboard.push(data.entry);
        this.leaderboard.sort((a, b) => b.score - a.score);
        this.leaderboard = this.leaderboard.slice(0, LEADERBOARD_SIZE);
        void this.room.storage.put(LEADERBOARD_KEY, this.leaderboard);
        return new Response('ok', { headers: cors });
      }

      // Room presence update from a game room
      const room = data as Partial<RoomListing> & { id: string };
      if (!room.id) return new Response('missing id', { status: 400, headers: cors });
      if ((room.playerCount ?? 0) === 0) {
        this.rooms.delete(room.id);
      } else {
        const existing = this.rooms.get(room.id);
        this.rooms.set(room.id, {
          ...existing,
          ...room,
          lastSeen: Date.now(),
          createdAt: existing?.createdAt ?? Date.now(),
        } as RoomListing);
      }
      return new Response('ok', { headers: cors });
    }

    return new Response('not found', { status: 404, headers: cors });
  }
}

LobbyParty satisfies Party.Worker;
