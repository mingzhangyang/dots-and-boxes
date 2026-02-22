import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, Trophy, User, Bot, Sun, Moon, Volume2, VolumeX } from 'lucide-react';

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

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
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

type Player = 1 | 2;

interface Dot {
  r: number;
  c: number;
}

interface GameState {
  rows: number;
  cols: number;
  hLines: (Player | 0)[][];
  vLines: (Player | 0)[][];
  boxes: (Player | 0)[][];
  currentPlayer: Player;
  scores: { 1: number; 2: number };
  winner: Player | 0 | 'draw';
  moveCount: number;
}

interface InteractionState {
  hoveredDot: Dot | null;
  selectedDot: Dot | null;
  dragStart: Dot | null;
  mousePos: { x: number; y: number } | null;
}

const ROWS = 8;
const COLS = 8;
const DOT_RADIUS = 6;
const HIT_RADIUS = 40; // Increased hit radius for mobile touch targets
const LINE_WIDTH = 6;

const getColors = (isDark: boolean) => ({
  p1: '#f43f5e', // rose-500
  p2: '#0ea5e9', // sky-500
  p1Bg: isDark ? 'rgba(244, 63, 94, 0.25)' : 'rgba(244, 63, 94, 0.15)',
  p2Bg: isDark ? 'rgba(14, 165, 233, 0.25)' : 'rgba(14, 165, 233, 0.15)',
  dot: isDark ? '#334155' : '#cbd5e1', // slate-700 : slate-300
  dotHover: isDark ? '#64748b' : '#94a3b8', // slate-500 : slate-400
  boardBg: isDark ? '#0f172a' : '#ffffff', // slate-900 : white
});

const createInitialState = (): GameState => ({
  rows: ROWS,
  cols: COLS,
  hLines: Array(ROWS).fill(0).map(() => Array(COLS - 1).fill(0)),
  vLines: Array(ROWS - 1).fill(0).map(() => Array(COLS).fill(0)),
  boxes: Array(ROWS - 1).fill(0).map(() => Array(COLS - 1).fill(0)),
  currentPlayer: 1,
  scores: { 1: 0, 2: 0 },
  winner: 0,
  moveCount: 0,
});

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

  if (completingMoves.length > 0) {
    return completingMoves[Math.floor(Math.random() * completingMoves.length)];
  }
  if (safeMoves.length > 0) {
    return safeMoves[Math.floor(Math.random() * safeMoves.length)];
  }
  if (availableMoves.length > 0) {
    return availableMoves[Math.floor(Math.random() * availableMoves.length)];
  }
  return null;
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [gameMode, setGameMode] = useState<'pvp' | 'pve'>('pve');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const gameStateRef = useRef<GameState>(createInitialState());
  const interactionRef = useRef<InteractionState>({
    hoveredDot: null,
    selectedDot: null,
    dragStart: null,
    mousePos: null,
  });

  const [uiState, setUiState] = useState({
    currentPlayer: 1 as Player,
    scores: { 1: 0, 2: 0 },
    winner: 0 as Player | 0 | 'draw',
    moveCount: 0,
  });

  const updateGameState = useCallback((newState: GameState) => {
    gameStateRef.current = newState;
    setUiState({
      currentPlayer: newState.currentPlayer,
      scores: newState.scores,
      winner: newState.winner,
      moveCount: newState.moveCount,
    });
    drawCanvas();
  }, [theme]);

  const resetGame = () => {
    interactionRef.current = {
      hoveredDot: null,
      selectedDot: null,
      dragStart: null,
      mousePos: null,
    };
    updateGameState(createInitialState());
  };

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
    
    // Fill background
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

    // Draw boxes
    for (let r = 0; r < state.rows - 1; r++) {
      for (let c = 0; c < state.cols - 1; c++) {
        if (state.boxes[r][c] !== 0) {
          ctx.fillStyle = state.boxes[r][c] === 1 ? colors.p1Bg : colors.p2Bg;
          ctx.fillRect(getX(c), getY(r), spacingX, spacingY);
        }
      }
    }

    // Draw lines
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
      ctx.shadowBlur = 0; // Reset shadow
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

    // Draw drag line
    if (interaction.dragStart && interaction.mousePos) {
      drawLine(
        getX(interaction.dragStart.c), 
        getY(interaction.dragStart.r), 
        interaction.mousePos.x, 
        interaction.mousePos.y, 
        state.currentPlayer === 1 ? colors.p1Bg : colors.p2Bg
      );
    }

    // Draw dots
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
        ctx.shadowBlur = 0; // Reset shadow
      }
    }
    
    ctx.restore();
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        drawCanvas();
      });
    });
    
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [drawCanvas]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const attemptMove = useCallback((dot1: Dot, dot2: Dot) => {
    const state = gameStateRef.current;
    if (state.winner) return;

    const dr = Math.abs(dot1.r - dot2.r);
    const dc = Math.abs(dot1.c - dot2.c);
    if (dr + dc !== 1) return;

    let r, c, isH;
    if (dr === 0) {
      isH = true;
      r = dot1.r;
      c = Math.min(dot1.c, dot2.c);
      if (state.hLines[r][c] !== 0) return;
    } else {
      isH = false;
      r = Math.min(dot1.r, dot2.r);
      c = dot1.c;
      if (state.vLines[r][c] !== 0) return;
    }

    const newState = {
      ...state,
      hLines: state.hLines.map(row => [...row]),
      vLines: state.vLines.map(row => [...row]),
      boxes: state.boxes.map(row => [...row]),
      scores: { ...state.scores },
      moveCount: state.moveCount + 1,
    };

    if (isH) {
      newState.hLines[r][c] = state.currentPlayer;
    } else {
      newState.vLines[r][c] = state.currentPlayer;
    }

    let boxesCompleted = 0;
    if (isH) {
      if (r > 0 && newState.hLines[r-1][c] && newState.vLines[r-1][c] && newState.vLines[r-1][c+1]) {
        newState.boxes[r-1][c] = state.currentPlayer;
        boxesCompleted++;
      }
      if (r < state.rows - 1 && newState.hLines[r+1][c] && newState.vLines[r][c] && newState.vLines[r][c+1]) {
        newState.boxes[r][c] = state.currentPlayer;
        boxesCompleted++;
      }
    } else {
      if (c > 0 && newState.vLines[r][c-1] && newState.hLines[r][c-1] && newState.hLines[r+1][c-1]) {
        newState.boxes[r][c-1] = state.currentPlayer;
        boxesCompleted++;
      }
      if (c < state.cols - 1 && newState.vLines[r][c+1] && newState.hLines[r][c] && newState.hLines[r+1][c]) {
        newState.boxes[r][c] = state.currentPlayer;
        boxesCompleted++;
      }
    }

    if (boxesCompleted > 0) {
      soundEngine.playBoxSound();
      newState.scores[state.currentPlayer] += boxesCompleted;
      const totalBoxes = (state.rows - 1) * (state.cols - 1);
      if (newState.scores[1] + newState.scores[2] === totalBoxes) {
        if (newState.scores[1] > newState.scores[2]) newState.winner = 1;
        else if (newState.scores[2] > newState.scores[1]) newState.winner = 2;
        else newState.winner = 'draw';
        soundEngine.playWinSound();
      }
    } else {
      soundEngine.playLineSound();
      newState.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
    }

    updateGameState(newState);
  }, [updateGameState]);

  // Computer turn logic
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

  const getMousePos = (e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const getClosestDot = (x: number, y: number): Dot | null => {
    const state = gameStateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    const padding = Math.min(rect.width, rect.height) * 0.08;
    const usableWidth = rect.width - padding * 2;
    const usableHeight = rect.height - padding * 2;
    
    const spacingX = usableWidth / (state.cols - 1);
    const spacingY = usableHeight / (state.rows - 1);

    let c = Math.round((x - padding) / spacingX);
    let r = Math.round((y - padding) / spacingY);

    if (c < 0 || c >= state.cols || r < 0 || r >= state.rows) return null;

    const dotX = padding + c * spacingX;
    const dotY = padding + r * spacingY;

    const dist = Math.hypot(x - dotX, y - dotY);
    if (dist <= HIT_RADIUS) {
      return { r, c };
    }
    return null;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    // Prevent default to stop scrolling on touch devices
    if ('touches' in e && e.cancelable) {
      // We don't call preventDefault here to allow clicks on buttons to work
      // Touch action is handled via CSS touch-none on the canvas container
    }
    
    if (uiState.winner || (gameMode === 'pve' && uiState.currentPlayer === 2)) return;
    
    const pos = getMousePos(e);
    const dot = getClosestDot(pos.x, pos.y);
    
    if (dot) {
      interactionRef.current.dragStart = dot;
      interactionRef.current.mousePos = pos;
      drawCanvas();
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (uiState.winner || (gameMode === 'pve' && uiState.currentPlayer === 2)) return;
    const pos = getMousePos(e);
    const dot = getClosestDot(pos.x, pos.y);
    
    interactionRef.current.mousePos = pos;
    interactionRef.current.hoveredDot = dot;
    
    drawCanvas();
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (uiState.winner || (gameMode === 'pve' && uiState.currentPlayer === 2)) return;
    
    let pos;
    if ('changedTouches' in e && e.changedTouches.length > 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        pos = {
          x: e.changedTouches[0].clientX - rect.left,
          y: e.changedTouches[0].clientY - rect.top
        };
      } else {
        pos = { x: 0, y: 0 };
      }
    } else {
      pos = getMousePos(e);
    }
    
    const dot = getClosestDot(pos.x, pos.y);
    const dragStart = interactionRef.current.dragStart;
    const selectedDot = interactionRef.current.selectedDot;

    if (dragStart) {
      if (dot) {
        if (dot.r === dragStart.r && dot.c === dragStart.c) {
          if (selectedDot) {
            if (selectedDot.r === dot.r && selectedDot.c === dot.c) {
              interactionRef.current.selectedDot = null;
            } else {
              const dr = Math.abs(selectedDot.r - dot.r);
              const dc = Math.abs(selectedDot.c - dot.c);
              if (dr + dc === 1) {
                attemptMove(selectedDot, dot);
                interactionRef.current.selectedDot = null;
              } else {
                interactionRef.current.selectedDot = dot;
              }
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

  return (
    <div className={`min-h-[100dvh] flex flex-col items-center justify-start sm:justify-center p-2 sm:p-4 md:p-8 font-sans transition-colors duration-500 relative overflow-hidden ${theme === 'dark' ? 'dark bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Subtle background pattern */}
      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.02] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px' }}>
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-4 sm:gap-6 md:gap-8 z-10 h-full max-h-[100dvh] pt-safe pb-safe">
        
        <div className="flex flex-col gap-4 sm:gap-6 shrink-0 mt-2 sm:mt-0">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Dots & Boxes</h1>
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex bg-slate-200/80 dark:bg-slate-800/80 backdrop-blur-sm p-1 rounded-xl shadow-inner">
                <button 
                  onClick={() => { setGameMode('pvp'); resetGame(); }}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 ${gameMode === 'pvp' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                >
                  <User size={16} className="w-4 h-4 sm:w-5 sm:h-5" /> PvP
                </button>
                <button 
                  onClick={() => { setGameMode('pve'); resetGame(); }}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 ${gameMode === 'pve' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                >
                  <Bot size={16} className="w-4 h-4 sm:w-5 sm:h-5" /> PvE
                </button>
              </div>
              
              <div className="flex items-center gap-1 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <button 
                  onClick={() => {
                    const enabled = soundEngine.toggle();
                    setSoundEnabled(enabled);
                  }}
                  className="p-2 sm:p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95"
                  title="Toggle Sound"
                >
                  {soundEnabled ? <Volume2 size={18} className="sm:w-5 sm:h-5" /> : <VolumeX size={18} className="sm:w-5 sm:h-5" />}
                </button>
                <button 
                  onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                  className="p-2 sm:p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95"
                  title="Toggle Theme"
                >
                  {theme === 'dark' ? <Sun size={18} className="sm:w-5 sm:h-5" /> : <Moon size={18} className="sm:w-5 sm:h-5" />}
                </button>
                <button 
                  onClick={resetGame}
                  className="p-2 sm:p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95"
                  title="Restart Game"
                >
                  <RefreshCw size={18} className="sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6">
            <div className={`relative overflow-hidden rounded-xl sm:rounded-2xl p-4 sm:p-6 border-2 transition-all duration-500 ${
              uiState.currentPlayer === 1 && !uiState.winner 
                ? 'border-rose-400/50 dark:border-rose-500/50 bg-rose-50 dark:bg-rose-500/10 shadow-[0_4px_20px_rgb(244,63,94,0.12)] dark:shadow-[0_4px_20px_rgb(244,63,94,0.2)] transform sm:-translate-y-1' 
                : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md opacity-80'
            }`}>
              <div className="flex justify-between items-center">
                <span className={`font-bold uppercase tracking-wider text-xs sm:text-sm ${uiState.currentPlayer === 1 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>Player 1</span>
                {uiState.winner === 1 && <Trophy className="text-rose-500 dark:text-rose-400 animate-bounce w-5 h-5 sm:w-6 sm:h-6" />}
              </div>
              <div className={`text-4xl sm:text-5xl md:text-6xl font-light mt-2 sm:mt-3 tracking-tight ${uiState.currentPlayer === 1 ? 'text-rose-600 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>{uiState.scores[1]}</div>
              {uiState.currentPlayer === 1 && !uiState.winner && (
                <div className="absolute bottom-0 left-0 w-full h-1 sm:h-1.5 bg-gradient-to-r from-rose-400 to-rose-500 animate-pulse" />
              )}
            </div>

            <div className={`relative overflow-hidden rounded-xl sm:rounded-2xl p-4 sm:p-6 border-2 transition-all duration-500 ${
              uiState.currentPlayer === 2 && !uiState.winner 
                ? 'border-sky-400/50 dark:border-sky-500/50 bg-sky-50 dark:bg-sky-500/10 shadow-[0_4px_20px_rgb(14,165,233,0.12)] dark:shadow-[0_4px_20px_rgb(14,165,233,0.2)] transform sm:-translate-y-1' 
                : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md opacity-80'
            }`}>
              <div className="flex justify-between items-center">
                <span className={`font-bold uppercase tracking-wider text-xs sm:text-sm ${uiState.currentPlayer === 2 ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {gameMode === 'pve' ? 'Computer' : 'Player 2'}
                </span>
                {uiState.winner === 2 && <Trophy className="text-sky-500 dark:text-sky-400 animate-bounce w-5 h-5 sm:w-6 sm:h-6" />}
              </div>
              <div className={`text-4xl sm:text-5xl md:text-6xl font-light mt-2 sm:mt-3 tracking-tight ${uiState.currentPlayer === 2 ? 'text-sky-600 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>{uiState.scores[2]}</div>
              {uiState.currentPlayer === 2 && !uiState.winner && (
                <div className="absolute bottom-0 left-0 w-full h-1 sm:h-1.5 bg-gradient-to-r from-sky-400 to-sky-500 animate-pulse" />
              )}
            </div>
          </div>
        </div>

        <div className="relative w-full aspect-square max-w-[600px] mx-auto group flex-grow sm:flex-grow-0 flex items-center justify-center min-h-0">
          {uiState.winner !== 0 && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 dark:bg-slate-950/90 backdrop-blur-md rounded-2xl sm:rounded-[2rem] animate-in fade-in zoom-in-95 duration-500">
              <div className="text-center flex flex-col items-center gap-4 sm:gap-6 p-6 sm:p-8">
                <div className={`p-4 sm:p-6 rounded-full ${uiState.winner === 1 ? 'bg-rose-100 dark:bg-rose-500/20' : uiState.winner === 2 ? 'bg-sky-100 dark:bg-sky-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                  <Trophy className={`w-12 h-12 sm:w-20 sm:h-20 ${uiState.winner === 1 ? 'text-rose-500' : uiState.winner === 2 ? 'text-sky-500' : 'text-slate-400'}`} />
                </div>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {uiState.winner === 'draw' ? 'It\'s a Draw!' : `Player ${uiState.winner} Wins!`}
                </h2>
                <button 
                  onClick={resetGame}
                  className="mt-2 sm:mt-4 px-8 sm:px-10 py-3 sm:py-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold text-base sm:text-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-all hover:scale-105 active:scale-95 shadow-lg"
                >
                  Play Again
                </button>
              </div>
            </div>
          )}
          
          <div 
            ref={containerRef} 
            className="w-full h-full max-h-full aspect-square bg-white dark:bg-slate-900 rounded-2xl sm:rounded-[2rem] shadow-xl dark:shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden touch-none transition-all duration-500 group-hover:shadow-2xl"
          >
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
        
        <div className="text-center text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-medium bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm py-2 sm:py-3 px-4 sm:px-6 rounded-full self-center border border-slate-200 dark:border-slate-800 shadow-sm shrink-0 mb-2 sm:mb-0">
          Tap two adjacent dots or drag between them to draw a line.
        </div>
      </div>
    </div>
  );
}
