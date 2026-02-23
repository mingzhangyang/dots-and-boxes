import { type GameState } from '../shared/gameLogic';

export const getBestMove = (state: GameState) => {
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
