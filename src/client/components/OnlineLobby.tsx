import React from 'react';
import { Wifi, Loader2, Copy, Check } from 'lucide-react';
import { type RemoteStatus } from '../types';

interface OnlineLobbyProps {
  remoteStatus: RemoteStatus;
  remoteRoomId: string | null;
  joinInput: string;
  joinError: string;
  copied: boolean;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onJoinInputChange: (value: string) => void;
  onCopyRoomCode: () => void;
  onBackToLobby: () => void;
}

export function OnlineLobby({
  remoteStatus,
  remoteRoomId,
  joinInput,
  joinError,
  copied,
  onCreateRoom,
  onJoinRoom,
  onJoinInputChange,
  onCopyRoomCode,
  onBackToLobby,
}: OnlineLobbyProps) {
  if (remoteStatus === 'idle') {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/95 dark:bg-slate-950/95 backdrop-blur-md rounded-2xl sm:rounded-[2rem]">
        <div className="flex flex-col items-center gap-6 p-6 sm:p-10 w-full max-w-xs">
          <Wifi className="w-10 h-10 text-sky-500" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Play Online</h2>

          <button onClick={onCreateRoom}
            className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-sm transition-all hover:scale-105 active:scale-95 shadow-md">
            Create Room
          </button>

          <div className="w-full flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={joinInput}
                onChange={e => onJoinInputChange(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && onJoinRoom()}
                placeholder="Room code"
                maxLength={12}
                className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button onClick={onJoinRoom}
                className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-sm hover:bg-slate-700 dark:hover:bg-slate-200 transition-all active:scale-95">
                Join
              </button>
            </div>
            {joinError && <p className="text-xs text-rose-500">{joinError}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (remoteStatus === 'connecting' || remoteStatus === 'waiting') {
    return (
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
                <button onClick={onCopyRoomCode} className="text-slate-400 hover:text-sky-500 transition-colors">
                  {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (remoteStatus === 'disconnected') {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/95 dark:bg-slate-950/95 backdrop-blur-md rounded-2xl sm:rounded-[2rem]">
        <div className="flex flex-col items-center gap-6 p-6 sm:p-10 text-center">
          <Wifi className="w-10 h-10 text-rose-500" />
          <p className="text-slate-900 dark:text-white font-semibold text-lg">Opponent disconnected</p>
          <button onClick={onBackToLobby}
            className="px-8 py-3 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm hover:bg-slate-700 dark:hover:bg-slate-200 transition-all active:scale-95">
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  return null;
}
