import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, Trophy, User, Bot, Sun, Moon, Volume2, VolumeX, Wifi, Copy, Check, Loader2 } from 'lucide-react';
import { type Player, type GameState, createInitialState, applyMove } from '../shared/gameLogic';

// ---------------------------------------------------------------------------
// Sound engine
// ---------------------------------------------------------------------------

class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  playLineSound() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playBoxSound() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(330, this.ctx.currentTime);
    osc.frequency.setValueAtTime(440, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playWinSound() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const startTime = this.ctx!.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, startTime + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }
}

const soundEngine = new SoundEngine();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Dot {
  r: number;
  c: number;
}

interface InteractionState {
  hoveredDot: Dot | null;
  selectedDot: Dot | null;
  dragStart: Dot | null;
  mousePos: { x: number; y: number } | null;
}

type GameMode = 'pvp' | 'pve' | 'remote';
type RemoteStatus = 'idle' | 'connecting' | 'waiting' | 'ready' | 'disconnected';

// ---------------------------------------------------------------------------
// Render constants
// ---------------------------------------------------------------------------

const DOT_RADIUS = 6;
const HIT_RADIUS = 40;
const LINE_WIDTH = 6;

const getColors = (isDark: boolean) => ({
  p1: '#f43f5e',
  p2: '#0ea5e9',
  p1Bg: isDark ? 'rgba(244, 63, 94, 0.25)' : 'rgba(244, 63, 94, 0.15)',
  p2Bg: isDark ? 'rgba(14, 165, 233, 0.25)' : 'rgba(14, 165, 233, 0.15)',
  dot: isDark ? '#334155' : '#cbd5e1',
  dotHover: isDark ? '#64748b' : '#94a3b8',
  boardBg: isDark ? '#0f172a' : '#ffffff',
});

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

const getBestMove = (state: GameState) => {
  const availableMoves: { r: number; c: number; isH: boolean }[] = [];
  const completingMoves: { r: number; c: number; isH: boolean }[] = [];
  const safeMoves: { r: number; c: number; isH: boolean }[] = [];

  const countLines = (r: number, c: number) => {
    let count = 0;
    if (state.hLines[r][c]) count++;
    if (state.hLines[r + 1][c]) count++;
    if (state.vLines[r][c]) count++;
    if (state.vLines[r][c + 1]) count++;
    return count;
  };

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols - 1; c++) {
      if (!state.hLines[r][c]) {
        const move = { r, c, isH: true };
        availableMoves.push(move);
        let completes = false;
        let givesAway = false;
        if (r > 0) {
          const lines = countLines(r - 1, c);
          if (lines === 3) completes = true;
          if (lines === 2) givesAway = true;
        }
        if (r < state.rows - 1) {
          const lines = countLines(r, c);
          if (lines === 3) completes = true;
          if (lines === 2) givesAway = true;
        }
        if (completes) completingMoves.push(move);
        else if (!givesAway) safeMoves.push(move);
      }
    }
  }

  for (let r = 0; r < state.rows - 1; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (!state.vLines[r][c]) {
        const move = { r, c, isH: false };
        availableMoves.push(move);
        let completes = false;
        let givesAway = false;
        if (c > 0) {
          const lines = countLines(r, c - 1);
          if (lines === 3) completes = true;
          if (lines === 2) givesAway = true;
        }
        if (c < state.cols - 1) {
          const lines = countLines(r, c);
          if (lines === 3) completes = true;
          if (lines === 2) givesAway = true;
        }
        if (completes) completingMoves.push(move);
        else if (!givesAway) safeMoves.push(move);
      }
    }
  }

  if (completingMoves.length > 0) return completingMoves[Math.floor(Math.random() * completingMoves.length)];
  if (safeMoves.length > 0) return safeMoves[Math.floor(Math.random() * safeMoves.length)];
  if (availableMoves.length > 0) return availableMoves[Math.floor(Math.random() * availableMoves.length)];
  return null;
};

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [gameMode, setGameMode] = useState<GameMode>('pve');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Game state lives in a ref (avoids stale closures in canvas callbacks)
  const gameStateRef = useRef<GameState>(createInitialState());
  const interactionRef = useRef<InteractionState>({
    hoveredDot: null,
    selectedDot: null,
    dragStart: null,
    mousePos: null,
  });

  // React state for UI re-renders
  const [uiState, setUiState] = useState({
    currentPlayer: 1 as Player,
    scores: { 1: 0, 2: 0 },
    winner: 0 as Player | 0 | 'draw',
    moveCount: 0,
  });

  // Remote (online) multiplayer state
  const wsRef = useRef<WebSocket | null>(null);
  const [remoteRoomId, setRemoteRoomId] = useState<string | null>(null);
  const [remotePlayerIndex, setRemotePlayerIndex] = useState<1 | 2 | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('idle');
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [copied, setCopied] = useState(false);

  // ---------------------------------------------------------------------------
  // Canvas drawing
  // ---------------------------------------------------------------------------

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const colors = getColors(theme === 'dark');
    ctx.fillStyle = colors.boardBg;
    ctx.fillRect(0, 0, rect.width, rect.height);

    const state = gameStateRef.current;
    const interaction = interactionRef.current;

    const padding = Math.min(rect.width, rect.height) * 0.08;
    const usableWidth = rect.width - padding * 2;
    const usableHeight = rect.height - padding * 2;
    const spacingX = usableWidth / (state.cols - 1);
    const spacingY = usableHeight / (state.rows - 1);

    const getX = (c: number) => padding + c * spacingX;
    const getY = (r: number) => padding + r * spacingY;

    // Boxes
    for (let r = 0; r < state.rows - 1; r++) {
      for (let c = 0; c < state.cols - 1; c++) {
        if (state.boxes[r][c] !== 0) {
          ctx.fillStyle = state.boxes[r][c] === 1 ? colors.p1Bg : colors.p2Bg;
          ctx.fillRect(getX(c), getY(r), spacingX, spacingY);
        }
      }
    }

    // Lines
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawLine = (x1: number, y1: number, x2: number, y2: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols - 1; c++) {
        if (state.hLines[r][c] !== 0) {
          drawLine(getX(c), getY(r), getX(c + 1), getY(r), state.hLines[r][c] === 1 ? colors.p1 : colors.p2);
        }
      }
    }

    for (let r = 0; r < state.rows - 1; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (state.vLines[r][c] !== 0) {
          drawLine(getX(c), getY(r), getX(c), getY(r + 1), state.vLines[r][c] === 1 ? colors.p1 : colors.p2);
        }
      }
    }

    // Drag preview line
    if (interaction.dragStart && interaction.mousePos) {
      drawLine(
        getX(interaction.dragStart.c),
        getY(interaction.dragStart.r),
        interaction.mousePos.x,
        interaction.mousePos.y,
        state.currentPlayer === 1 ? colors.p1Bg : colors.p2Bg,
      );
    }

    // Dots
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        ctx.fillStyle = colors.dot;
        let radius = DOT_RADIUS;

        if (interaction.selectedDot?.r === r && interaction.selectedDot?.c === c) {
          ctx.fillStyle = state.currentPlayer === 1 ? colors.p1 : colors.p2;
          radius = DOT_RADIUS * 1.5;
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 10;
        } else if (interaction.hoveredDot?.r === r && interaction.hoveredDot?.c === c) {
          ctx.fillStyle = colors.dotHover;
          radius = DOT_RADIUS * 1.5;
        }

        ctx.beginPath();
        ctx.arc(getX(c), getY(r), radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();
  }, [theme]);

  // ---------------------------------------------------------------------------
  // State update helpers
  // ---------------------------------------------------------------------------

  const updateGameState = useCallback((newState: GameState) => {
    gameStateRef.current = newState;
    setUiState({
      currentPlayer: newState.currentPlayer,
      scores: newState.scores,
      winner: newState.winner,
      moveCount: newState.moveCount,
    });
    drawCanvas();
  }, [drawCanvas]);

  const resetGame = useCallback(() => {
    interactionRef.current = { hoveredDot: null, selectedDot: null, dragStart: null, mousePos: null };
    updateGameState(createInitialState());
  }, [updateGameState]);

  // ---------------------------------------------------------------------------
  // Mode switching
  // ---------------------------------------------------------------------------

  const switchMode = useCallback((newMode: GameMode) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setRemoteRoomId(null);
    setRemotePlayerIndex(null);
    setRemoteStatus('idle');
    setJoinInput('');
    setJoinError('');
    setGameMode(newMode);
    interactionRef.current = { hoveredDot: null, selectedDot: null, dragStart: null, mousePos: null };
    updateGameState(createInitialState());
  }, [updateGameState]);

  // ---------------------------------------------------------------------------
  // Remote (WebSocket) multiplayer
  // ---------------------------------------------------------------------------

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
        // Determine which sounds to play by comparing with current state
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
  }, [updateGameState]);

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

  // ---------------------------------------------------------------------------
  // Local move handling
  // ---------------------------------------------------------------------------

  const attemptMove = useCallback((dot1: Dot, dot2: Dot) => {
    const state = gameStateRef.current;
    if (state.winner) return;

    const dr = Math.abs(dot1.r - dot2.r);
    const dc = Math.abs(dot1.c - dot2.c);
    if (dr + dc !== 1) return;

    let r: number, c: number, isH: boolean;
    if (dr === 0) {
      isH = true;
      r = dot1.r;
      c = Math.min(dot1.c, dot2.c);
    } else {
      isH = false;
      r = Math.min(dot1.r, dot2.r);
      c = dot1.c;
    }

    if (gameMode === 'remote') {
      // Send move to server; wait for state broadcast
      wsRef.current?.send(JSON.stringify({ type: 'move', r, c, isH }));
      return;
    }

    // Local mode: apply immediately
    const newState = applyMove(state, r, c, isH);
    if (!newState) return;

    if (newState.winner) {
      soundEngine.playWinSound();
    } else if (newState.scores[1] + newState.scores[2] > state.scores[1] + state.scores[2]) {
      soundEngine.playBoxSound();
    } else {
      soundEngine.playLineSound();
    }

    updateGameState(newState);
  }, [gameMode, updateGameState]);

  // ---------------------------------------------------------------------------
  // AI turn
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (gameMode === 'pve' && uiState.currentPlayer === 2 && !uiState.winner) {
      const timer = setTimeout(() => {
        const move = getBestMove(gameStateRef.current);
        if (move) {
          const dot1 = { r: move.r, c: move.c };
          const dot2 = move.isH ? { r: move.r, c: move.c + 1 } : { r: move.r + 1, c: move.c };
          attemptMove(dot1, dot2);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [uiState.currentPlayer, uiState.winner, gameMode, uiState.moveCount, attemptMove]);

  // ---------------------------------------------------------------------------
  // Canvas resize / draw
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(() => drawCanvas()));
    ro.observe(container);
    return () => ro.disconnect();
  }, [drawCanvas]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  // ---------------------------------------------------------------------------
  // Pointer / touch input
  // ---------------------------------------------------------------------------

  const getMousePos = (e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const getClosestDot = (x: number, y: number): Dot | null => {
    const state = gameStateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const padding = Math.min(rect.width, rect.height) * 0.08;
    const spacingX = (rect.width - padding * 2) / (state.cols - 1);
    const spacingY = (rect.height - padding * 2) / (state.rows - 1);
    const c = Math.round((x - padding) / spacingX);
    const r = Math.round((y - padding) / spacingY);
    if (c < 0 || c >= state.cols || r < 0 || r >= state.rows) return null;
    const dist = Math.hypot(x - (padding + c * spacingX), y - (padding + r * spacingY));
    return dist <= HIT_RADIUS ? { r, c } : null;
  };

  const isMyTurn = () => {
    if (gameMode === 'remote') {
      return remoteStatus === 'ready' && uiState.currentPlayer === remotePlayerIndex && !uiState.winner;
    }
    return !uiState.winner && !(gameMode === 'pve' && uiState.currentPlayer === 2);
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isMyTurn()) return;
    const pos = getMousePos(e);
    const dot = getClosestDot(pos.x, pos.y);
    if (dot) {
      interactionRef.current.dragStart = dot;
      interactionRef.current.mousePos = pos;
      drawCanvas();
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isMyTurn()) return;
    const pos = getMousePos(e);
    interactionRef.current.mousePos = pos;
    interactionRef.current.hoveredDot = getClosestDot(pos.x, pos.y);
    drawCanvas();
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isMyTurn()) return;

    let pos: { x: number; y: number };
    if ('changedTouches' in e && e.changedTouches.length > 0) {
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      pos = rect
        ? { x: e.changedTouches[0].clientX - rect.left, y: e.changedTouches[0].clientY - rect.top }
        : { x: 0, y: 0 };
    } else {
      pos = getMousePos(e);
    }

    const dot = getClosestDot(pos.x, pos.y);
    const { dragStart, selectedDot } = interactionRef.current;

    if (dragStart) {
      if (dot) {
        if (dot.r === dragStart.r && dot.c === dragStart.c) {
          if (selectedDot) {
            if (selectedDot.r === dot.r && selectedDot.c === dot.c) {
              interactionRef.current.selectedDot = null;
            } else if (Math.abs(selectedDot.r - dot.r) + Math.abs(selectedDot.c - dot.c) === 1) {
              attemptMove(selectedDot, dot);
              interactionRef.current.selectedDot = null;
            } else {
              interactionRef.current.selectedDot = dot;
            }
          } else {
            interactionRef.current.selectedDot = dot;
          }
        } else {
          attemptMove(dragStart, dot);
          interactionRef.current.selectedDot = null;
        }
      }
      interactionRef.current.dragStart = null;
    }

    drawCanvas();
  };

  const handlePointerLeave = () => {
    interactionRef.current.dragStart = null;
    interactionRef.current.hoveredDot = null;
    interactionRef.current.mousePos = null;
    drawCanvas();
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const isDark = theme === 'dark';

  const remoteStatusLabel = () => {
    if (remoteStatus === 'connecting') return 'Connecting…';
    if (remoteStatus === 'waiting') return 'Waiting for opponent…';
    if (remoteStatus === 'disconnected') return 'Opponent disconnected';
    if (remoteStatus === 'ready') {
      return uiState.currentPlayer === remotePlayerIndex ? 'Your turn' : "Opponent's turn";
    }
    return '';
  };

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div className={`min-h-[100dvh] flex flex-col items-center justify-start sm:justify-center p-2 sm:p-4 md:p-8 font-sans transition-colors duration-500 relative overflow-hidden ${isDark ? 'dark bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-900'}`}>

      {/* Background dot pattern */}
      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.02] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      <div className="w-full max-w-2xl flex flex-col gap-4 sm:gap-6 md:gap-8 z-10 h-full max-h-[100dvh] pt-safe pb-safe">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:gap-6 shrink-0 mt-2 sm:mt-0">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Dots &amp; Boxes</h1>

            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
              {/* Mode selector */}
              <div className="flex bg-slate-200/80 dark:bg-slate-800/80 backdrop-blur-sm p-1 rounded-xl shadow-inner">
                {(['pvp', 'pve', 'remote'] as GameMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => switchMode(mode)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 ${gameMode === mode ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    {mode === 'pvp' && <><User size={14} /> PvP</>}
                    {mode === 'pve' && <><Bot size={14} /> PvE</>}
                    {mode === 'remote' && <><Wifi size={14} /> Online</>}
                  </button>
                ))}
              </div>

              {/* Utility buttons */}
              <div className="flex items-center gap-1 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <button onClick={() => { const e = soundEngine.toggle(); setSoundEnabled(e); }}
                  className="p-2 sm:p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95">
                  {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
                <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                  className="p-2 sm:p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95">
                  {isDark ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                <button onClick={resetGame}
                  className="p-2 sm:p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95">
                  <RefreshCw size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Score cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6">
            {([1, 2] as Player[]).map(p => {
              const isActive = uiState.currentPlayer === p && !uiState.winner;
              const isMe = gameMode === 'remote' && remotePlayerIndex === p;
              const label = gameMode === 'pve' && p === 2 ? 'Computer'
                : gameMode === 'remote' ? (isMe ? 'You' : 'Opponent')
                : `Player ${p}`;
              const color = p === 1
                ? 'rose' : 'sky';
              return (
                <div key={p} className={`relative overflow-hidden rounded-xl sm:rounded-2xl p-4 sm:p-6 border-2 transition-all duration-500 ${isActive
                  ? `border-${color}-400/50 dark:border-${color}-500/50 bg-${color}-50 dark:bg-${color}-500/10 shadow-[0_4px_20px_rgb(${p === 1 ? '244,63,94' : '14,165,233'},0.12)] dark:shadow-[0_4px_20px_rgb(${p === 1 ? '244,63,94' : '14,165,233'},0.2)] transform sm:-translate-y-1`
                  : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md opacity-80'}`}>
                  <div className="flex justify-between items-center">
                    <span className={`font-bold uppercase tracking-wider text-xs sm:text-sm ${isActive ? `text-${color}-600 dark:text-${color}-400` : 'text-slate-500 dark:text-slate-400'}`}>
                      {label}
                    </span>
                    {uiState.winner === p && <Trophy className={`text-${color}-500 dark:text-${color}-400 animate-bounce w-5 h-5 sm:w-6 sm:h-6`} />}
                  </div>
                  <div className={`text-4xl sm:text-5xl md:text-6xl font-light mt-2 sm:mt-3 tracking-tight ${isActive ? `text-${color}-600 dark:text-white` : 'text-slate-400 dark:text-slate-500'}`}>
                    {uiState.scores[p]}
                  </div>
                  {isActive && <div className={`absolute bottom-0 left-0 w-full h-1 sm:h-1.5 bg-gradient-to-r from-${color}-400 to-${color}-500 animate-pulse`} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Board / Lobby area */}
        <div className="relative w-full aspect-square max-w-[600px] mx-auto group flex-grow sm:flex-grow-0 flex items-center justify-center min-h-0">

          {/* Win overlay */}
          {uiState.winner !== 0 && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 dark:bg-slate-950/90 backdrop-blur-md rounded-2xl sm:rounded-[2rem] animate-in fade-in zoom-in-95 duration-500">
              <div className="text-center flex flex-col items-center gap-4 sm:gap-6 p-6 sm:p-8">
                <div className={`p-4 sm:p-6 rounded-full ${uiState.winner === 1 ? 'bg-rose-100 dark:bg-rose-500/20' : uiState.winner === 2 ? 'bg-sky-100 dark:bg-sky-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                  <Trophy className={`w-12 h-12 sm:w-20 sm:h-20 ${uiState.winner === 1 ? 'text-rose-500' : uiState.winner === 2 ? 'text-sky-500' : 'text-slate-400'}`} />
                </div>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {uiState.winner === 'draw' ? "It's a Draw!"
                    : gameMode === 'remote'
                      ? (uiState.winner === remotePlayerIndex ? 'You Win!' : 'You Lose!')
                      : `Player ${uiState.winner} Wins!`}
                </h2>
                <button onClick={resetGame}
                  className="mt-2 sm:mt-4 px-8 sm:px-10 py-3 sm:py-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold text-base sm:text-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-all hover:scale-105 active:scale-95 shadow-lg">
                  Play Again
                </button>
              </div>
            </div>
          )}

          {/* Online lobby overlay */}
          {gameMode === 'remote' && remoteStatus === 'idle' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/95 dark:bg-slate-950/95 backdrop-blur-md rounded-2xl sm:rounded-[2rem]">
              <div className="flex flex-col items-center gap-6 p-6 sm:p-10 w-full max-w-xs">
                <Wifi className="w-10 h-10 text-sky-500" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Play Online</h2>

                <button onClick={createRoom}
                  className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-sm transition-all hover:scale-105 active:scale-95 shadow-md">
                  Create Room
                </button>

                <div className="w-full flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      value={joinInput}
                      onChange={e => { setJoinInput(e.target.value.toUpperCase()); setJoinError(''); }}
                      onKeyDown={e => e.key === 'Enter' && joinRoom()}
                      placeholder="Room code"
                      maxLength={12}
                      className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <button onClick={joinRoom}
                      className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-sm hover:bg-slate-700 dark:hover:bg-slate-200 transition-all active:scale-95">
                      Join
                    </button>
                  </div>
                  {joinError && <p className="text-xs text-rose-500">{joinError}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Connecting / waiting overlay */}
          {gameMode === 'remote' && (remoteStatus === 'connecting' || remoteStatus === 'waiting') && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/95 dark:bg-slate-950/95 backdrop-blur-md rounded-2xl sm:rounded-[2rem]">
              <div className="flex flex-col items-center gap-6 p-6 sm:p-10 w-full max-w-xs text-center">
                <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />
                <p className="text-slate-700 dark:text-slate-300 font-medium">
                  {remoteStatus === 'connecting' ? 'Connecting…' : 'Waiting for opponent…'}
                </p>
                {remoteStatus === 'waiting' && remoteRoomId && (
                  <div className="flex flex-col items-center gap-3 w-full">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Share this code with your opponent:</p>
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 w-full justify-between">
                      <span className="font-mono text-xl font-bold tracking-widest text-slate-900 dark:text-white">{remoteRoomId}</span>
                      <button onClick={copyRoomCode} className="text-slate-400 hover:text-sky-500 transition-colors">
                        {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Opponent disconnected overlay */}
          {gameMode === 'remote' && remoteStatus === 'disconnected' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/95 dark:bg-slate-950/95 backdrop-blur-md rounded-2xl sm:rounded-[2rem]">
              <div className="flex flex-col items-center gap-6 p-6 sm:p-10 text-center">
                <Wifi className="w-10 h-10 text-rose-500" />
                <p className="text-slate-900 dark:text-white font-semibold text-lg">Opponent disconnected</p>
                <button onClick={() => switchMode('remote')}
                  className="px-8 py-3 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm hover:bg-slate-700 dark:hover:bg-slate-200 transition-all active:scale-95">
                  Back to Lobby
                </button>
              </div>
            </div>
          )}

          {/* Game board */}
          <div ref={containerRef}
            className="w-full h-full max-h-full aspect-square bg-white dark:bg-slate-900 rounded-2xl sm:rounded-[2rem] shadow-xl dark:shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden touch-none transition-all duration-500 group-hover:shadow-2xl">
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-crosshair touch-none"
              style={{ touchAction: 'none' }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerLeave}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              onTouchCancel={handlePointerLeave}
            />
          </div>
        </div>

        {/* Status bar */}
        <div className="text-center text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-medium bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm py-2 sm:py-3 px-4 sm:px-6 rounded-full self-center border border-slate-200 dark:border-slate-800 shadow-sm shrink-0 mb-2 sm:mb-0">
          {gameMode === 'remote' && remoteStatus !== 'idle'
            ? remoteStatusLabel()
            : 'Tap two adjacent dots or drag between them to draw a line.'}
        </div>

      </div>
    </div>
  );
}
