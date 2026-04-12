import { getStickerPosition } from "../solver/state";
import { FACE_ORDER, FACE_SIZE, type CubeState, type FaceName } from "../solver/types";

export interface FaceDomino {
  /** Ключ master: `${face}-${row}-${col}` */
  masterKey: string;
  face: FaceName;
  row: number;
  col: number;
  spanRows: 1 | 2;
  spanCols: 1 | 2;
  primaryIndex: number;
  secondaryIndex: number;
}

export function cellKey(face: FaceName, row: number, col: number): string {
  return `${face}-${row}-${col}`;
}

function pairKey(ia: number, ib: number): string {
  return ia < ib ? `${ia}-${ib}` : `${ib}-${ia}`;
}

/**
 * Домино только для пары соседних стикеров на одной грани, если оба ещё не участвуют в другом домино
 * (иначе два рядом бандажа не сливаются в один прямоугольник).
 */
export function buildFaceDominoes(state: CubeState): {
  slaves: Set<string>;
  dominoes: Map<string, FaceDomino>;
  dominoPairKeys: Set<string>;
} {
  const slaves = new Set<string>();
  const dominoes = new Map<string, FaceDomino>();
  const dominoPairKeys = new Set<string>();
  const usedStickerIds = new Set<number>();

  for (const [ia, ib] of state.bonds) {
    let pa: ReturnType<typeof getStickerPosition>;
    let pb: ReturnType<typeof getStickerPosition>;
    try {
      pa = getStickerPosition(ia);
      pb = getStickerPosition(ib);
    } catch {
      continue;
    }
    if (pa.face !== pb.face) {
      continue;
    }
    const dr = Math.abs(pa.row - pb.row);
    const dc = Math.abs(pa.col - pb.col);
    if (dr + dc !== 1) {
      continue;
    }

    if (usedStickerIds.has(ia) || usedStickerIds.has(ib)) {
      continue;
    }

    const upperLeft =
      pa.row < pb.row || (pa.row === pb.row && pa.col <= pb.col)
        ? pa
        : pb;
    const other = upperLeft === pa ? pb : pa;
    const face = upperLeft.face;
    const mk = cellKey(face, upperLeft.row, upperLeft.col);
    const sk = cellKey(face, other.row, other.col);

    if (slaves.has(mk) || dominoes.has(mk)) {
      continue;
    }
    if (slaves.has(sk) || dominoes.has(sk)) {
      continue;
    }

    const horizontal = dr === 0;
    slaves.add(sk);
    dominoPairKeys.add(pairKey(ia, ib));
    usedStickerIds.add(ia);
    usedStickerIds.add(ib);
    dominoes.set(mk, {
      masterKey: mk,
      face,
      row: upperLeft.row,
      col: upperLeft.col,
      spanRows: horizontal ? 1 : 2,
      spanCols: horizontal ? 2 : 1,
      primaryIndex: Math.min(ia, ib),
      secondaryIndex: Math.max(ia, ib)
    });
  }

  return { slaves, dominoes, dominoPairKeys };
}

export interface BondLineSvg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Линии между центрами на одной грани: не соседи, либо соседи но без домино (пересечение с другим бандажом).
 */
export function buildSameFaceBondLines(state: CubeState, dominoPairKeys: Set<string>): Record<FaceName, BondLineSvg[]> {
  const lines = Object.fromEntries(FACE_ORDER.map((face) => [face, [] as BondLineSvg[]])) as Record<
    FaceName,
    BondLineSvg[]
  >;

  for (const [a, b] of state.bonds) {
    let pa: ReturnType<typeof getStickerPosition>;
    let pb: ReturnType<typeof getStickerPosition>;
    try {
      pa = getStickerPosition(a);
      pb = getStickerPosition(b);
    } catch {
      continue;
    }
    if (pa.face !== pb.face) {
      continue;
    }
    const dr = Math.abs(pa.row - pb.row);
    const dc = Math.abs(pa.col - pb.col);
    if (dr + dc === 1 && dominoPairKeys.has(pairKey(a, b))) {
      continue;
    }
    lines[pa.face].push({
      x1: toSvgCoord(pa.col),
      y1: toSvgCoord(pa.row),
      x2: toSvgCoord(pb.col),
      y2: toSvgCoord(pb.row)
    });
  }

  return lines;
}

function toSvgCoord(cell: number): number {
  return ((cell + 0.5) / FACE_SIZE) * 100;
}
