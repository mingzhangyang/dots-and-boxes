import React from 'react';
import { Trophy } from 'lucide-react';
import { type Player } from '../../shared/gameLogic';
import { type GameMode } from '../types';

interface WinOverlayProps {
  winner: Player | 0 | 'draw';
  gameMode: GameMode;
  remotePlayerIndex: 1 | 2 | null;
  onReset: () => void;
}

export function WinOverlay({ winner, gameMode, remotePlayerIndex, onReset }: WinOverlayProps) {
  if (winner === 0) return null;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 dark:bg-slate-950/90 backdrop-blur-md rounded-2xl sm:rounded-[2rem] animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center flex flex-col items-center gap-4 sm:gap-6 p-6 sm:p-8">
        <div className={`p-4 sm:p-6 rounded-full ${winner === 1 ? 'bg-rose-100 dark:bg-rose-500/20' : winner === 2 ? 'bg-sky-100 dark:bg-sky-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
          <Trophy className={`w-12 h-12 sm:w-20 sm:h-20 ${winner === 1 ? 'text-rose-500' : winner === 2 ? 'text-sky-500' : 'text-slate-400'}`} />
        </div>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white tracking-tight">
          {winner === 'draw' ? "It's a Draw!"
            : gameMode === 'remote'
              ? (winner === remotePlayerIndex ? 'You Win!' : 'You Lose!')
              : `Player ${winner} Wins!`}
        </h2>
        <button onClick={onReset}
          className="mt-2 sm:mt-4 px-8 sm:px-10 py-3 sm:py-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold text-base sm:text-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-all hover:scale-105 active:scale-95 shadow-lg">
          Play Again
        </button>
      </div>
    </div>
  );
}
