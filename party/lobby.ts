import type * as Party from "partykit/server";

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
  gameMode?: 'arena' | 'castle';
};

const STALE_MS = 45_000;

export default class LobbyParty implements Party.Server {
  rooms = new Map<string, RoomListing>();
  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request): Promise<Response> {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method === 'GET') {
      const now = Date.now();
      const active = [...this.rooms.values()]
        .filter(r => now - r.lastSeen < STALE_MS)
        .sort((a, b) => b.playerCount - a.playerCount || a.createdAt - b.createdAt);
      return new Response(JSON.stringify(active), { headers: cors });
    }
    if (req.method === 'POST') {
      const data = await req.json() as Partial<RoomListing> & { id: string };
      if (!data.id) return new Response('missing id', { status: 400, headers: cors });
      if ((data.playerCount ?? 0) === 0) {
        this.rooms.delete(data.id);
      } else {
        const existing = this.rooms.get(data.id);
        this.rooms.set(data.id, {
          ...existing,
          ...data,
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
