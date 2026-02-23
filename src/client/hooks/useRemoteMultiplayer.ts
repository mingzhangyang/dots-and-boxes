import { useRef, useState, useCallback, type MutableRefObject } from 'react';
import { type GameState } from '../../shared/gameLogic';
import { soundEngine } from '../soundEngine';
import { type RemoteStatus } from '../types';

interface UseRemoteMultiplayerOptions {
  gameStateRef: MutableRefObject<GameState>;
  updateGameState: (state: GameState) => void;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

export function useRemoteMultiplayer({ gameStateRef, updateGameState }: UseRemoteMultiplayerOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [remoteRoomId, setRemoteRoomId] = useState<string | null>(null);
  const [remotePlayerIndex, setRemotePlayerIndex] = useState<1 | 2 | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('idle');
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [copied, setCopied] = useState(false);

  // Refs used inside async event callbacks to avoid stale closure issues
  const statusRef = useRef<RemoteStatus>('idle');
  const currentRoomIdRef = useRef<string | null>(null);
  // Monotonically increasing ID — incremented on each new WebSocket creation.
  // Each socket's callbacks capture their own ID; if wsIdRef.current no longer
  // matches, the callback belongs to a superseded connection and is ignored.
  const wsIdRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStatus = useCallback((status: RemoteStatus) => {
    statusRef.current = status;
    setRemoteStatus(status);
  }, []);

  const connectToRoom = useCallback((roomId: string) => {
    // Cancel any pending reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Close any existing socket — increment wsIdRef first so its onclose is ignored
    wsIdRef.current += 1;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    currentRoomIdRef.current = roomId;
    const myId = wsIdRef.current;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/room/${roomId}/ws`);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      if (wsIdRef.current !== myId) return;
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (wsIdRef.current !== myId) return;
      const msg = JSON.parse(event.data as string);

      if (msg.type === 'ping') {
        // Respond immediately so the server keeps the connection alive
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (msg.type === 'joined') {
        setRemoteRoomId(roomId);
        setRemotePlayerIndex(msg.playerIndex);
        updateGameState(msg.gameState);
        setStatus(msg.ready ? 'ready' : 'waiting');
      } else if (msg.type === 'opponent_joined') {
        setStatus('ready');
        updateGameState(msg.gameState);
      } else if (msg.type === 'state') {
        const prev = gameStateRef.current;
        const next: GameState = msg.gameState;
        if (next.winner) {
          soundEngine.playWinSound();
        } else if (next.scores[1] + next.scores[2] > prev.scores[1] + prev.scores[2]) {
          soundEngine.playBoxSound();
        } else {
          soundEngine.playLineSound();
        }
        updateGameState(next);
      } else if (msg.type === 'opponent_disconnected') {
        // Sync to the server's authoritative state snapshot
        if (msg.gameState) updateGameState(msg.gameState);
        setStatus('disconnected');
      } else if (msg.type === 'full') {
        setJoinError('This room is full. Try a different code.');
        setStatus('idle');
        reconnectAttemptsRef.current = 0;
      } else if (msg.type === 'error') {
        // Server-side validation errors (not-your-turn, invalid-move, etc.)
        // These are informational only — status does not change
        console.warn('[remote] server error:', msg.message);
      }
    };

    ws.onclose = () => {
      if (wsIdRef.current !== myId) return;

      const currentStatus = statusRef.current;

      // If a message handler already moved us to 'idle' (e.g. 'full'), don't override
      if (currentStatus === 'idle') return;

      // Attempt transparent reconnection for unexpected drops
      if (
        reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS &&
        currentStatus !== 'disconnected' &&
        currentRoomIdRef.current
      ) {
        reconnectAttemptsRef.current += 1;
        setStatus('reconnecting');
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (currentRoomIdRef.current) connectToRoom(currentRoomIdRef.current);
        }, RECONNECT_DELAY_MS);
      } else {
        setStatus('disconnected');
      }
    };

    ws.onerror = () => {
      if (wsIdRef.current !== myId) return;
      // Only handle errors on the initial connect attempt, not during reconnection.
      // Reconnection errors are handled by onclose (which follows onerror).
      if (statusRef.current === 'connecting') {
        setJoinError('Could not connect. Check the room code and try again.');
        setStatus('idle');
        reconnectAttemptsRef.current = 0;
      }
    };
  }, [updateGameState, gameStateRef, setStatus]);

  const createRoom = useCallback(async () => {
    setJoinError('');
    try {
      const res = await fetch('/api/room', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create room');
      const { roomId } = await res.json() as { roomId: string };
      connectToRoom(roomId);
    } catch {
      setJoinError('Could not create room. Please try again.');
    }
  }, [connectToRoom]);

  const joinRoom = useCallback(() => {
    const code = joinInput.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError('Enter the room code shared by your opponent.');
      return;
    }
    setJoinError('');
    connectToRoom(code);
  }, [joinInput, connectToRoom]);

  const copyRoomCode = useCallback(() => {
    if (!remoteRoomId) return;
    navigator.clipboard.writeText(remoteRoomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [remoteRoomId]);

  const resetRemote = useCallback(() => {
    // Cancel pending reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    // Invalidate current connection so any in-flight events are ignored
    wsIdRef.current += 1;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    currentRoomIdRef.current = null;
    setRemoteRoomId(null);
    setRemotePlayerIndex(null);
    setStatus('idle');
    setJoinInput('');
    setJoinError('');
  }, [setStatus]);

  return {
    wsRef,
    remoteRoomId,
    remotePlayerIndex,
    remoteStatus,
    joinInput,
    joinError,
    copied,
    connectToRoom,
    createRoom,
    joinRoom,
    copyRoomCode,
    resetRemote,
    setJoinInput,
    setJoinError,
  };
}
