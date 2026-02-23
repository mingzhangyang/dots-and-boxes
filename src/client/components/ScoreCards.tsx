import React from 'react';
import { Trophy } from 'lucide-react';
import { type Player } from '../../shared/gameLogic';
import { type GameMode } from '../types';

interface ScoreCardsProps {
  uiState: {
    currentPlayer: Player;
    scores: { 1: number; 2: number };
    winner: Player | 0 | 'draw';
  };
  gameMode: GameMode;
  remotePlayerIndex: 1 | 2 | null;
}

export function ScoreCards({ uiState, gameMode, remotePlayerIndex }: ScoreCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6">
      {([1, 2] as Player[]).map(p => {
        const isActive = uiState.currentPlayer === p && !uiState.winner;
        const isMe = gameMode === 'remote' && remotePlayerIndex === p;
        const label = gameMode === 'pve' && p === 2 ? 'Computer'
          : gameMode === 'remote' ? (isMe ? 'You' : 'Opponent')
          : `Player ${p}`;
        const color = p === 1 ? 'rose' : 'sky';
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
  );
}
