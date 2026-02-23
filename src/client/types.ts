export interface Dot {
  r: number;
  c: number;
}

export interface InteractionState {
  hoveredDot: Dot | null;
  selectedDot: Dot | null;
  dragStart: Dot | null;
  mousePos: { x: number; y: number } | null;
}

export type GameMode = 'pvp' | 'pve' | 'remote';
export type RemoteStatus = 'idle' | 'connecting' | 'waiting' | 'ready' | 'disconnected';
