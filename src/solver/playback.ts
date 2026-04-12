import { applyMove } from "./moves";
import type { CubeState, MoveName } from "./types";

export function stateAtStep(initialState: CubeState, moves: MoveName[], step: number): CubeState {
  const safeStep = Math.max(0, Math.min(step, moves.length));
  let state = initialState;
  for (let idx = 0; idx < safeStep; idx += 1) {
    state = applyMove(state, moves[idx]);
  }
  return state;
}
