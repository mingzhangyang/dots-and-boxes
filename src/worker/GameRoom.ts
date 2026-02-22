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
  | { type: 'opponent_disconnected' }
  | { type: 'full' }
  | { type: 'error'; message: string };

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
      return new Response('Room is full', { status: 409 });
    }

    // Restore persisted game state if the DO was evicted and restarted
    const saved = await this.state.storage.get<GameState>('gameState');
    if (saved) this.gameState = saved;

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server, [`player${playerIndex}`]);

    const ready = playerIndex === 2 && p1.length === 1;

    const joinMsg: ServerMessage = {
      type: 'joined',
      playerIndex,
      gameState: this.gameState,
      ready,
    };
    server.send(JSON.stringify(joinMsg));

    if (ready) {
      // Notify the waiting player 1 that their opponent has arrived
      for (const ws of this.state.getWebSockets('player1')) {
        const msg: ServerMessage = { type: 'opponent_joined', gameState: this.gameState };
        ws.send(JSON.stringify(msg));
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

    if (data.type === 'move') {
      // Both players must be connected before moves are accepted
      if (this.state.getWebSockets('player1').length === 0) return;
      if (this.state.getWebSockets('player2').length === 0) return;

      const tags = this.state.getTags(ws);
      const playerIndex: 1 | 2 = tags.includes('player1') ? 1 : 2;

      // Restore state in case DO was evicted mid-game
      const saved = await this.state.storage.get<GameState>('gameState');
      if (saved) this.gameState = saved;

      if (playerIndex !== this.gameState.currentPlayer) return;
      if (data.r === undefined || data.c === undefined || data.isH === undefined) return;

      const newState = applyMove(this.gameState, data.r, data.c, data.isH);
      if (!newState) return;

      this.gameState = newState;
      await this.state.storage.put('gameState', newState);

      this.broadcast({ type: 'state', gameState: newState });
    }
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    this.broadcastExcept(_ws, { type: 'opponent_disconnected' });
  }

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    this.broadcastExcept(_ws, { type: 'opponent_disconnected' });
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
