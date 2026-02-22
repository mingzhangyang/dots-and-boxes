import { GameRoom } from './GameRoom';
import type { Env } from './GameRoom';

export { GameRoom };

function generateRoomId(): string {
  // Omit visually ambiguous characters (0/O, 1/I/L)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // POST /api/room — create a new game room, return its ID
    if (url.pathname === '/api/room' && request.method === 'POST') {
      const roomId = generateRoomId();
      return Response.json({ roomId }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // GET /api/room/:id/ws — upgrade to WebSocket and forward to the Durable Object
    const wsMatch = url.pathname.match(/^\/api\/room\/([A-Z0-9]{4,12})\/ws$/);
    if (wsMatch) {
      const roomId = wsMatch[1];
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    // Everything else — serve static assets (Vite build output)
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
