import { useRef, useState, useCallback, type MutableRefObject } from 'react';
import { type GameState } from '../../shared/gameLogic';
import { soundEngine } from '../soundEngine';
import { type RemoteStatus } from '../types';

interface UseRemoteMultiplayerOptions {
  gameStateRef: MutableRefObject<GameState>;
  updateGameState: (state: GameState) => void;
}

export function useRemoteMultiplayer({ gameStateRef, updateGameState }: UseRemoteMultiplayerOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [remoteRoomId, setRemoteRoomId] = useState<string | null>(null);
  const [remotePlayerIndex, setRemotePlayerIndex] = useState<1 | 2 | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('idle');
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [copied, setCopied] = useState(false);

  const connectToRoom = useCallback((roomId: string) => {
    if (wsRef.current) wsRef.current.close();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/room/${roomId}/ws`);
    wsRef.current = ws;
    setRemoteStatus('connecting');

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);

      if (msg.type === 'joined') {
        setRemoteRoomId(roomId);
        setRemotePlayerIndex(msg.playerIndex);
        updateGameState(msg.gameState);
        setRemoteStatus(msg.ready ? 'ready' : 'waiting');
      } else if (msg.type === 'opponent_joined') {
        setRemoteStatus('ready');
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
        setRemoteStatus('disconnected');
      } else if (msg.type === 'full') {
        setJoinError('This room is full. Try a different code.');
        setRemoteStatus('idle');
      }
    };

    ws.onclose = () => {
      setRemoteStatus(prev => prev === 'idle' || prev === 'connecting' ? 'idle' : 'disconnected');
    };

    ws.onerror = () => {
      setJoinError('Could not connect. Check the room code and try again.');
      setRemoteStatus('idle');
    };
  }, [updateGameState, gameStateRef]);

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
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setRemoteRoomId(null);
    setRemotePlayerIndex(null);
    setRemoteStatus('idle');
    setJoinInput('');
    setJoinError('');
  }, []);

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
