import { createInitialState, applyMove } from '../shared/gameLogic';
import type { GameState } from '../shared/gameLogic';

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

type ServerMessage =
  | { type: 'joined'; playerIndex: 1 | 2; gameState: GameState; ready: boolean }
  | { type: 'opponent_joined'; gameState: GameState }
  | { type: 'state'; gameState: GameState }
  | { type: 'opponent_disconnected'; gameState: GameState }
  | { type: 'full' }
  | { type: 'error'; message: string }
  | { type: 'ping' };

// Interval between server-sent ping frames
const HEARTBEAT_INTERVAL_MS = 30_000;
// Close a socket if it hasn't responded to pings within this window
const STALE_THRESHOLD_MS = 90_000;

/**
 * Durable Object that manages one game room.
 *
 * Uses Hibernatable WebSockets so the DO can be evicted between messages
 * without dropping connections.  Up to two players connect; the server
 * holds the authoritative GameState and broadcasts after every valid move.
 */
export class GameRoom {
  private readonly state: DurableObjectState;
  private gameState: GameState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    this.gameState = createInitialState();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Determine which player slot is available
    const p1 = this.state.getWebSockets('player1');
    const p2 = this.state.getWebSockets('player2');
    let playerIndex: 1 | 2;
    if (p1.length === 0) {
      playerIndex = 1;
    } else if (p2.length === 0) {
      playerIndex = 2;
    } else {
      // Room is full — accept the WebSocket, deliver the 'full' message, then close.
      // Using server.accept() (non-hibernatable) so this ephemeral socket isn't
      // tracked by the DO's hibernatable-WebSocket system.
      const { 0: client, 1: server } = new WebSocketPair();
      server.accept();
      server.send(JSON.stringify({ type: 'full' } satisfies ServerMessage));
      server.close(1008, 'Room is full');
      return new Response(null, { status: 101, webSocket: client });
    }

    // Restore persisted game state if the DO was evicted and restarted
    const saved = await this.state.storage.get<GameState>('gameState');
    if (saved) this.gameState = saved;

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server, [`player${playerIndex}`]);

    // Initialise per-socket heartbeat tracking
    server.serializeAttachment({ lastPong: Date.now() });

    // The other player's live sockets (used for ready detection and notifications)
    const otherSockets = playerIndex === 1 ? p2 : p1;
    const ready = otherSockets.length > 0;

    server.send(JSON.stringify({
      type: 'joined',
      playerIndex,
      gameState: this.gameState,
      ready,
    } satisfies ServerMessage));

    // Notify whichever player was already waiting that their opponent has arrived
    if (ready) {
      for (const ws of otherSockets) {
        ws.send(JSON.stringify({ type: 'opponent_joined', gameState: this.gameState } satisfies ServerMessage));
      }
    }

    // Start the heartbeat alarm the first time a player connects to this room
    if (playerIndex === 1) {
      const existingAlarm = await this.state.storage.getAlarm();
      if (!existingAlarm) {
        await this.state.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL_MS);
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let data: { type: string; r?: number; c?: number; isH?: boolean };
    try {
      data = JSON.parse(message as string);
    } catch {
      return;
    }

    // Keep the connection alive — update the last-pong timestamp
    if (data.type === 'pong') {
      ws.serializeAttachment({ lastPong: Date.now() });
      return;
    }

    if (data.type === 'move') {
      // Both players must be connected before moves are accepted
      if (this.state.getWebSockets('player1').length === 0 || this.state.getWebSockets('player2').length === 0) {
        ws.send(JSON.stringify({ type: 'error', message: 'Waiting for opponent.' } satisfies ServerMessage));
        return;
      }

      const tags = this.state.getTags(ws);
      const playerIndex: 1 | 2 = tags.includes('player1') ? 1 : 2;

      // Restore state in case the DO was evicted mid-game
      const saved = await this.state.storage.get<GameState>('gameState');
      if (saved) this.gameState = saved;

      if (playerIndex !== this.gameState.currentPlayer) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not your turn.' } satisfies ServerMessage));
        return;
      }

      if (data.r === undefined || data.c === undefined || data.isH === undefined) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid move data.' } satisfies ServerMessage));
        return;
      }

      const newState = applyMove(this.gameState, data.r, data.c, data.isH);
      if (!newState) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid move.' } satisfies ServerMessage));
        return;
      }

      this.gameState = newState;
      await this.state.storage.put('gameState', newState);

      this.broadcast({ type: 'state', gameState: newState });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Load the latest game state so the opponent gets an accurate snapshot
    const saved = await this.state.storage.get<GameState>('gameState');
    if (saved) this.gameState = saved;

    this.broadcastExcept(ws, { type: 'opponent_disconnected', gameState: this.gameState });
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    const saved = await this.state.storage.get<GameState>('gameState');
    if (saved) this.gameState = saved;

    this.broadcastExcept(ws, { type: 'opponent_disconnected', gameState: this.gameState });
  }

  /**
   * Alarm handler — fires every HEARTBEAT_INTERVAL_MS while players are connected.
   *
   * • Pings every live socket so the client knows the connection is healthy.
   * • Closes sockets that haven't responded within STALE_THRESHOLD_MS.
   * • When no sockets remain, cleans up persisted storage and lets the alarm lapse.
   */
  async alarm(): Promise<void> {
    const allSockets = this.state.getWebSockets();

    if (allSockets.length === 0) {
      // Nobody connected — purge state and stop rescheduling
      await this.state.storage.deleteAll();
      return;
    }

    const now = Date.now();
    for (const ws of allSockets) {
      const attachment = ws.deserializeAttachment() as { lastPong?: number } | null;
      const lastPong = attachment?.lastPong ?? now;

      if (now - lastPong > STALE_THRESHOLD_MS) {
        // Stale connection — close it so the opponent gets notified
        try { ws.close(1001, 'Connection timed out'); } catch { /* already closed */ }
      } else {
        try { ws.send(JSON.stringify({ type: 'ping' } satisfies ServerMessage)); } catch { /* ignore */ }
      }
    }

    // Schedule the next heartbeat
    await this.state.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL_MS);
  }

  private broadcast(message: ServerMessage): void {
    const msg = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(msg); } catch { /* ignore already-closed sockets */ }
    }
  }

  private broadcastExcept(exclude: WebSocket, message: ServerMessage): void {
    const msg = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      if (ws !== exclude) {
        try { ws.send(msg); } catch { /* ignore */ }
      }
    }
  }
}
