import { ALL_MOVES, affectedIndicesForMove } from "./moves";
import type { CubeState, MoveName } from "./types";

export function isMoveBandageLegal(state: CubeState, move: MoveName): boolean {
  const bondModel = detectBondModel(state);
  const affected =
    bondModel.mode === "cubie" ? affectedCubiesForMove(move) : affectedIndicesForMove(move);

  for (const [rawA, rawB] of state.bonds) {
    const a = normalizeBondIndex(rawA, bondModel);
    const b = normalizeBondIndex(rawB, bondModel);
    if (a === null || b === null) {
      continue;
    }
    const aMoved = affected.has(a);
    const bMoved = affected.has(b);
    if (aMoved !== bMoved) {
      return false;
    }
  }
  return true;
}

export function legalMoves(state: CubeState, previousMove?: MoveName): MoveName[] {
  return pruneBacktrackingMoves(
    ALL_MOVES.filter((move) => isMoveBandageLegal(state, move)),
    previousMove
  );
}

function pruneBacktrackingMoves(moves: MoveName[], previousMove?: MoveName): MoveName[] {
  if (!previousMove) {
    return moves;
  }
  return moves.filter((move) => !isImmediateInverse(previousMove, move));
}

type BondModel =
  | { mode: "sticker" }
  | { mode: "cubie"; oneBased: boolean };

function detectBondModel(state: CubeState): BondModel {
  const all = state.bonds.flat();
  const max = Math.max(...all, 0);
  const hasZero = all.includes(0);

  // Most bandaged 4x4 snapshots encode cubie ids in [0..63] or [1..64].
  if (max <= 64) {
    return { mode: "cubie", oneBased: !hasZero };
  }
  return { mode: "sticker" };
}

function normalizeBondIndex(index: number, model: BondModel): number | null {
  if (model.mode === "sticker") {
    return index;
  }
  const normalized = model.oneBased ? index - 1 : index;
  if (normalized < 0 || normalized > 63) {
    return null;
  }
  return normalized;
}

const CUBIE_AFFECTED_CACHE = new Map<MoveName, Set<number>>();

function affectedCubiesForMove(move: MoveName): Set<number> {
  const cached = CUBIE_AFFECTED_CACHE.get(move);
  if (cached) {
    return cached;
  }

  const face = faceOfMove(move);
  const affected = new Set<number>();
  for (let id = 0; id < 64; id += 1) {
    const x = id % 4;
    const y = Math.floor(id / 4) % 4;
    const z = Math.floor(id / 16);
    const moved =
      (face === "R" && x === 3) ||
      (face === "L" && x === 0) ||
      (face === "U" && y === 3) ||
      (face === "D" && y === 0) ||
      (face === "F" && z === 3) ||
      (face === "B" && z === 0);
    if (moved) {
      affected.add(id);
    }
  }
  CUBIE_AFFECTED_CACHE.set(move, affected);
  return affected;
}

function faceOfMove(move: MoveName): "U" | "D" | "L" | "R" | "F" | "B" {
  return move[0].toUpperCase() as "U" | "D" | "L" | "R" | "F" | "B";
}

function splitMove(move: MoveName): { base: string; suffix: "" | "'" | "2" } {
  if (move.endsWith("'")) {
    return { base: move.slice(0, -1), suffix: "'" };
  }
  if (move.endsWith("2")) {
    return { base: move.slice(0, -1), suffix: "2" };
  }
  return { base: move, suffix: "" };
}

function isImmediateInverse(previousMove: MoveName, currentMove: MoveName): boolean {
  const prev = splitMove(previousMove);
  const next = splitMove(currentMove);
  if (prev.base !== next.base) {
    return false;
  }
  if (prev.suffix === "2" && next.suffix === "2") {
    return true;
  }
  return (
    (prev.suffix === "" && next.suffix === "'") ||
    (prev.suffix === "'" && next.suffix === "")
  );
}
