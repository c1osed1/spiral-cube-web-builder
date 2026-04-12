import { ALL_MOVES, affectedIndicesForMove } from "./moves";
import type { BaseMove, BondInterpretation, CubeState, MoveName } from "./types";

export function isMoveBandageLegal(
  state: CubeState,
  move: MoveName,
  bondInterpretation: BondInterpretation = "auto"
): boolean {
  const bondModel = resolveBondModel(state, bondInterpretation);
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

export function legalMoves(
  state: CubeState,
  previousMove?: MoveName,
  bondInterpretation: BondInterpretation = "auto"
): MoveName[] {
  return pruneBacktrackingMoves(
    ALL_MOVES.filter((move) => isMoveBandageLegal(state, move, bondInterpretation)),
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

export function resolveBondModel(state: CubeState, interpretation: BondInterpretation): BondModel {
  if (interpretation === "sticker") {
    return { mode: "sticker" };
  }
  if (interpretation === "cubie") {
    const all = state.bonds.flat();
    const hasZero = all.includes(0);
    return { mode: "cubie", oneBased: !hasZero };
  }
  return detectBondModel(state);
}

function detectBondModel(state: CubeState): BondModel {
  const all = state.bonds.flat();
  const max = Math.max(...all, 0);
  const hasZero = all.includes(0);

  // Снимки со стикерами 0..95 обычно имеют max > 64.
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

/** Индекс мини-кубика 0..63: x = id%4, y = floor(id/4)%4, z = floor(id/16). Согласовано с осями в moves.ts (R=x=3, U=y=3, F=z=3). */
function cubieCoords(id: number): { x: number; y: number; z: number } {
  return {
    x: id % 4,
    y: Math.floor(id / 4) % 4,
    z: Math.floor(id / 16)
  };
}

function getMoveBase(move: MoveName): BaseMove {
  const suffix = move.endsWith("'") ? "'" : move.endsWith("2") ? "2" : "";
  return (suffix ? move.slice(0, -1) : move) as BaseMove;
}

function cubieAffectedByBaseMove(base: BaseMove, id: number): boolean {
  const c = cubieCoords(id);
  switch (base) {
    case "U":
      return c.y === 3;
    case "Uw":
      return c.y === 3 || c.y === 1;
    case "u":
      return c.y === 1;
    case "D":
      return c.y === 0;
    case "Dw":
      return c.y === 0 || c.y === 2;
    case "d":
      return c.y === 2;
    case "R":
      return c.x === 3;
    case "Rw":
      return c.x === 3 || c.x === 1;
    case "r":
      return c.x === 1;
    case "L":
      return c.x === 0;
    case "Lw":
      return c.x === 0 || c.x === 2;
    case "l":
      return c.x === 2;
    case "F":
      return c.z === 3;
    case "Fw":
      return c.z === 3 || c.z === 1;
    case "f":
      return c.z === 1;
    case "B":
      return c.z === 0;
    case "Bw":
      return c.z === 0 || c.z === 2;
    case "b":
      return c.z === 2;
    default:
      return false;
  }
}

/** Для тестов: число мини-кубиков 0..63 в слое хода (режим cubie-bonds). */
export function cubieAffectedCountForTest(move: MoveName): number {
  return affectedCubiesForMove(move).size;
}

function affectedCubiesForMove(move: MoveName): Set<number> {
  const cached = CUBIE_AFFECTED_CACHE.get(move);
  if (cached) {
    return cached;
  }

  const base = getMoveBase(move);
  const affected = new Set<number>();
  for (let id = 0; id < 64; id += 1) {
    if (cubieAffectedByBaseMove(base, id)) {
      affected.add(id);
    }
  }
  CUBIE_AFFECTED_CACHE.set(move, affected);
  return affected;
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
