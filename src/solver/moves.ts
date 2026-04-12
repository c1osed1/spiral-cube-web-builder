import { FACE_ORDER, FACE_SIZE, STICKERS_PER_FACE, type BaseMove, type CubeState, type MoveName } from "./types";
import { getStickerIndex } from "./state";

type Axis = "x" | "y" | "z";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface StickerMeta {
  index: number;
  pos: Vec3;
  normal: Vec3;
}

interface MoveDef {
  axis: Axis;
  layerValues: number[];
  quarterTurns: 1 | -1;
}

const AXIS_VALUES = [-3, -1, 1, 3];

const BASE_MOVE_DEFS: Record<BaseMove, MoveDef> = {
  U: { axis: "y", layerValues: [3], quarterTurns: 1 },
  D: { axis: "y", layerValues: [-3], quarterTurns: -1 },
  R: { axis: "x", layerValues: [3], quarterTurns: 1 },
  L: { axis: "x", layerValues: [-3], quarterTurns: -1 },
  F: { axis: "z", layerValues: [3], quarterTurns: 1 },
  B: { axis: "z", layerValues: [-3], quarterTurns: -1 },
  Uw: { axis: "y", layerValues: [3, 1], quarterTurns: 1 },
  Dw: { axis: "y", layerValues: [-3, -1], quarterTurns: -1 },
  Rw: { axis: "x", layerValues: [3, 1], quarterTurns: 1 },
  Lw: { axis: "x", layerValues: [-3, -1], quarterTurns: -1 },
  Fw: { axis: "z", layerValues: [3, 1], quarterTurns: 1 },
  Bw: { axis: "z", layerValues: [-3, -1], quarterTurns: -1 },
  u: { axis: "y", layerValues: [1], quarterTurns: 1 },
  d: { axis: "y", layerValues: [-1], quarterTurns: -1 },
  r: { axis: "x", layerValues: [1], quarterTurns: 1 },
  l: { axis: "x", layerValues: [-1], quarterTurns: -1 },
  f: { axis: "z", layerValues: [1], quarterTurns: 1 },
  b: { axis: "z", layerValues: [-1], quarterTurns: -1 }
};

export const ALL_MOVES: MoveName[] = [
  "U",
  "U'",
  "U2",
  "D",
  "D'",
  "D2",
  "L",
  "L'",
  "L2",
  "R",
  "R'",
  "R2",
  "F",
  "F'",
  "F2",
  "B",
  "B'",
  "B2",
  "Uw",
  "Uw'",
  "Uw2",
  "Dw",
  "Dw'",
  "Dw2",
  "Lw",
  "Lw'",
  "Lw2",
  "Rw",
  "Rw'",
  "Rw2",
  "Fw",
  "Fw'",
  "Fw2",
  "Bw",
  "Bw'",
  "Bw2",
  "u",
  "u'",
  "u2",
  "d",
  "d'",
  "d2",
  "r",
  "r'",
  "r2",
  "l",
  "l'",
  "l2",
  "f",
  "f'",
  "f2",
  "b",
  "b'",
  "b2"
];

const STICKER_META = buildStickerMeta();
const INDEX_BY_META_KEY = new Map<string, number>(
  STICKER_META.map((meta) => [getMetaKey(meta.pos, meta.normal), meta.index])
);

const AFFECTED_BY_MOVE = new Map<MoveName, Set<number>>();
const PERMUTATION_BY_MOVE = new Map<MoveName, number[]>();
for (const move of ALL_MOVES) {
  const affected = new Set<number>();
  const permutation = Array.from({ length: FACE_ORDER.length * STICKERS_PER_FACE }, (_, idx) => idx);
  for (const meta of STICKER_META) {
    const next = transformSticker(meta, move);
    permutation[meta.index] = next.index;
    if (next.index !== meta.index) {
      affected.add(meta.index);
    }
  }
  AFFECTED_BY_MOVE.set(move, affected);
  PERMUTATION_BY_MOVE.set(move, permutation);
}

export function affectedIndicesForMove(move: MoveName): Set<number> {
  return AFFECTED_BY_MOVE.get(move) ?? new Set<number>();
}

/** Обратный ход (R↔R', R2↔R2). Немедленный X после X⁻¹ не нужен в кратчайшем поиске. */
export function inverseMove(move: MoveName): MoveName {
  if (move.endsWith("2")) {
    return move;
  }
  if (move.endsWith("'")) {
    return move.slice(0, -1) as MoveName;
  }
  return `${move}'` as MoveName;
}

export function applyMove(state: CubeState, move: MoveName): CubeState {
  const permutation = PERMUTATION_BY_MOVE.get(move);
  if (!permutation) {
    throw new Error(`Missing permutation for move ${move}.`);
  }
  const nextStickers = [...state.stickers];
  for (let from = 0; from < permutation.length; from += 1) {
    const to = permutation[from];
    nextStickers[to] = state.stickers[from];
  }
  const nextBonds = state.bonds.map(([a, b]) => [permutation[a], permutation[b]] as [number, number]);
  return {
    stickers: nextStickers,
    bonds: nextBonds
  };
}

function transformSticker(meta: StickerMeta, move: MoveName): StickerMeta {
  const parsed = parseMove(move);
  let turns = parsed.def.quarterTurns;
  if (parsed.suffix === "'") {
    turns = (turns * -1) as 1 | -1;
  }
  const turnCount = parsed.suffix === "2" ? 2 : 1;
  const shouldRotate = parsed.def.layerValues.includes(readAxis(meta.pos, parsed.def.axis));
  if (!shouldRotate) {
    return meta;
  }

  let pos = meta.pos;
  let normal = meta.normal;
  for (let i = 0; i < turnCount; i += 1) {
    pos = rotate(pos, parsed.def.axis, turns);
    normal = rotate(normal, parsed.def.axis, turns);
  }

  const key = getMetaKey(pos, normal);
  const targetIndex = INDEX_BY_META_KEY.get(key);
  if (typeof targetIndex !== "number") {
    throw new Error(`Unable to map rotated sticker for move ${move}.`);
  }
  return {
    index: targetIndex,
    pos,
    normal
  };
}

function parseMove(move: MoveName): { base: BaseMove; suffix: "" | "'" | "2"; def: MoveDef } {
  const suffix = move.endsWith("'") ? "'" : move.endsWith("2") ? "2" : "";
  const base = (suffix ? move.slice(0, -1) : move) as BaseMove;
  return {
    base,
    suffix,
    def: BASE_MOVE_DEFS[base]
  };
}

function readAxis(vec: Vec3, axis: Axis): number {
  return axis === "x" ? vec.x : axis === "y" ? vec.y : vec.z;
}

function rotate(vec: Vec3, axis: Axis, dir: 1 | -1): Vec3 {
  if (axis === "x") {
    return dir === 1 ? { x: vec.x, y: -vec.z, z: vec.y } : { x: vec.x, y: vec.z, z: -vec.y };
  }
  if (axis === "y") {
    return dir === 1 ? { x: vec.z, y: vec.y, z: -vec.x } : { x: -vec.z, y: vec.y, z: vec.x };
  }
  return dir === 1 ? { x: -vec.y, y: vec.x, z: vec.z } : { x: vec.y, y: -vec.x, z: vec.z };
}

function getMetaKey(pos: Vec3, normal: Vec3): string {
  return `${pos.x},${pos.y},${pos.z}|${normal.x},${normal.y},${normal.z}`;
}

function buildStickerMeta(): StickerMeta[] {
  const items: StickerMeta[] = [];
  for (const face of FACE_ORDER) {
    for (let row = 0; row < FACE_SIZE; row += 1) {
      for (let col = 0; col < FACE_SIZE; col += 1) {
        const index = getStickerIndex(face, row, col);
        items.push({
          index,
          pos: gridToPos(face, row, col),
          normal: faceNormal(face)
        });
      }
    }
  }

  if (items.length !== FACE_ORDER.length * STICKERS_PER_FACE) {
    throw new Error("Sticker metadata generation failed.");
  }
  return items;
}

function gridToPos(face: (typeof FACE_ORDER)[number], row: number, col: number): Vec3 {
  const x = AXIS_VALUES[col];
  const y = AXIS_VALUES[row];
  switch (face) {
    case "F":
      return { x, y: -y, z: 3 };
    case "B":
      return { x: -x, y: -y, z: -3 };
    case "U":
      return { x, y: 3, z: AXIS_VALUES[row] };
    case "D":
      return { x, y: -3, z: -AXIS_VALUES[row] };
    case "R":
      return { x: 3, y: -y, z: -AXIS_VALUES[col] };
    case "L":
      return { x: -3, y: -y, z: AXIS_VALUES[col] };
    default:
      throw new Error(`Unsupported face ${String(face)}`);
  }
}

function faceNormal(face: (typeof FACE_ORDER)[number]): Vec3 {
  switch (face) {
    case "U":
      return { x: 0, y: 1, z: 0 };
    case "D":
      return { x: 0, y: -1, z: 0 };
    case "F":
      return { x: 0, y: 0, z: 1 };
    case "B":
      return { x: 0, y: 0, z: -1 };
    case "R":
      return { x: 1, y: 0, z: 0 };
    case "L":
      return { x: -1, y: 0, z: 0 };
    default:
      throw new Error(`Unsupported face ${String(face)}`);
  }
}
