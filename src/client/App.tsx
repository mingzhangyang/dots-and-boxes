import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, User, Bot, Sun, Moon, Volume2, VolumeX, Wifi } from 'lucide-react';
import { type Player, type GameState, createInitialState, applyMove } from '../shared/gameLogic';
import { soundEngine } from './soundEngine';
import { type GameMode, type InteractionState } from './types';
import { DOT_RADIUS, HIT_RADIUS, LINE_WIDTH, getColors } from './constants';
import { getBestMove } from './ai';
import { useRemoteMultiplayer } from './hooks/useRemoteMultiplayer';
import { ScoreCards } from './components/ScoreCards';
import { WinOverlay } from './components/WinOverlay';
import { OnlineLobby } from './components/OnlineLobby';

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
  // Remote (WebSocket) multiplayer
  // ---------------------------------------------------------------------------

  const {
    wsRef,
    remoteRoomId,
    remotePlayerIndex,
    remoteStatus,
    joinInput,
    joinError,
    copied,
    createRoom,
    joinRoom,
    copyRoomCode,
    resetRemote,
    setJoinInput,
    setJoinError,
  } = useRemoteMultiplayer({ gameStateRef, updateGameState });

  // ---------------------------------------------------------------------------
  // Mode switching
  // ---------------------------------------------------------------------------

  const switchMode = useCallback((newMode: GameMode) => {
    resetRemote();
    setGameMode(newMode);
    interactionRef.current = { hoveredDot: null, selectedDot: null, dragStart: null, mousePos: null };
    updateGameState(createInitialState());
  }, [resetRemote, updateGameState]);

  // ---------------------------------------------------------------------------
  // Local move handling
  // ---------------------------------------------------------------------------

  const attemptMove = useCallback((dot1: { r: number; c: number }, dot2: { r: number; c: number }) => {
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
      wsRef.current?.send(JSON.stringify({ type: 'move', r, c, isH }));
      return;
    }

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
  }, [gameMode, wsRef, updateGameState]);

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

  const getClosestDot = (x: number, y: number) => {
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
  // Render
  // ---------------------------------------------------------------------------

  const isDark = theme === 'dark';

  const remoteStatusLabel = () => {
    if (remoteStatus === 'connecting') return 'Connecting…';
    if (remoteStatus === 'reconnecting') return 'Reconnecting…';
    if (remoteStatus === 'waiting') return 'Waiting for opponent…';
    if (remoteStatus === 'disconnected') return 'Opponent disconnected';
    if (remoteStatus === 'ready') {
      return uiState.currentPlayer === remotePlayerIndex ? 'Your turn' : "Opponent's turn";
    }
    return '';
  };

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

          <ScoreCards uiState={uiState} gameMode={gameMode} remotePlayerIndex={remotePlayerIndex} />
        </div>

        {/* Board / Lobby area */}
        <div className="relative w-full aspect-square max-w-[600px] mx-auto group flex-grow sm:flex-grow-0 flex items-center justify-center min-h-0">

          <WinOverlay
            winner={uiState.winner}
            gameMode={gameMode}
            remotePlayerIndex={remotePlayerIndex}
            onReset={resetGame}
          />

          {gameMode === 'remote' && (
            <OnlineLobby
              remoteStatus={remoteStatus}
              remoteRoomId={remoteRoomId}
              joinInput={joinInput}
              joinError={joinError}
              copied={copied}
              onCreateRoom={createRoom}
              onJoinRoom={joinRoom}
              onJoinInputChange={v => { setJoinInput(v); setJoinError(''); }}
              onCopyRoomCode={copyRoomCode}
              onBackToLobby={() => switchMode('remote')}
            />
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
