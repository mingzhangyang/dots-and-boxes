export type Player = 1 | 2;

export interface GameState {
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

export const ROWS = 8;
export const COLS = 8;

export const createInitialState = (): GameState => ({
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

/**
 * Applies a move to a game state and returns the resulting state.
 * Returns null if the move is invalid (out of bounds or line already drawn).
 * The caller is responsible for sound effects.
 */
export const applyMove = (
  state: GameState,
  r: number,
  c: number,
  isH: boolean,
): GameState | null => {
  if (state.winner) return null;

  if (isH) {
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols - 1) return null;
    if (state.hLines[r][c] !== 0) return null;
  } else {
    if (r < 0 || r >= state.rows - 1 || c < 0 || c >= state.cols) return null;
    if (state.vLines[r][c] !== 0) return null;
  }

  const newState: GameState = {
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
    // Box above: top=hLines[r-1][c], bottom=hLines[r][c](new), left=vLines[r-1][c], right=vLines[r-1][c+1]
    if (r > 0 && newState.hLines[r - 1][c] && newState.vLines[r - 1][c] && newState.vLines[r - 1][c + 1]) {
      newState.boxes[r - 1][c] = state.currentPlayer;
      boxesCompleted++;
    }
    // Box below: top=hLines[r][c](new), bottom=hLines[r+1][c], left=vLines[r][c], right=vLines[r][c+1]
    if (r < state.rows - 1 && newState.hLines[r + 1][c] && newState.vLines[r][c] && newState.vLines[r][c + 1]) {
      newState.boxes[r][c] = state.currentPlayer;
      boxesCompleted++;
    }
  } else {
    // Box left: top=hLines[r][c-1], bottom=hLines[r+1][c-1], left=vLines[r][c-1], right=vLines[r][c](new)
    if (c > 0 && newState.vLines[r][c - 1] && newState.hLines[r][c - 1] && newState.hLines[r + 1][c - 1]) {
      newState.boxes[r][c - 1] = state.currentPlayer;
      boxesCompleted++;
    }
    // Box right: top=hLines[r][c], bottom=hLines[r+1][c], left=vLines[r][c](new), right=vLines[r][c+1]
    if (c < state.cols - 1 && newState.vLines[r][c + 1] && newState.hLines[r][c] && newState.hLines[r + 1][c]) {
      newState.boxes[r][c] = state.currentPlayer;
      boxesCompleted++;
    }
  }

  if (boxesCompleted > 0) {
    newState.scores[state.currentPlayer] += boxesCompleted;
    const totalBoxes = (state.rows - 1) * (state.cols - 1);
    if (newState.scores[1] + newState.scores[2] === totalBoxes) {
      if (newState.scores[1] > newState.scores[2]) newState.winner = 1;
      else if (newState.scores[2] > newState.scores[1]) newState.winner = 2;
      else newState.winner = 'draw';
    }
    // Player keeps turn after completing a box
  } else {
    newState.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  }

  return newState;
};
