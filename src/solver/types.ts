export const FACE_ORDER = ["U", "D", "F", "B", "R", "L"] as const;
export const FACE_SIZE = 4;
export const STICKERS_PER_FACE = FACE_SIZE * FACE_SIZE;
export const TOTAL_STICKERS = FACE_ORDER.length * STICKERS_PER_FACE;

export type FaceName = (typeof FACE_ORDER)[number];
export type StickerColor = "W" | "Y" | "R" | "O" | "G" | "B";
export type FaceGrid = StickerColor[][];

export type CubeNet = Record<FaceName, FaceGrid>;

export type Bond = [number, number];

export interface SnapshotFile {
  v: number;
  savedAt: string;
  net: CubeNet;
  bonds: Bond[];
}

export interface CubeState {
  stickers: StickerColor[];
  bonds: Bond[];
}

export type BondInterpretation = "auto" | "sticker" | "cubie";

export interface SearchOptions {
  beamWidth: number;
  maxDepth: number;
  timeBudgetMs: number;
  progressEveryExpansions: number;
  strategy?: "beam" | "complete";
  searchUntilSolved?: boolean;
  /** Если true или timeBudgetMs <= 0 — не останавливать по времени (осторожно: браузер может зависнуть). */
  unlimitedTime?: boolean;
  /** Как интерпретировать индексы в bonds (для auto: max индекса <= 64 → cubie id, иначе стикеры 0..95). */
  bondMode?: BondInterpretation;
  /** Воркер: периодически проверять, чтобы обработать «Стоп» и новый «Старт». */
  shouldAbort?: () => boolean;
}

/** Состояние, в которое чаще всего приходили «длинным» путём и отсекали (транспозиция / beam seen). */
export interface TransposePruneEntry {
  /** Короткий id (хэш полного ключа состояния), не весь JSON */
  stateId: string;
  prunes: number;
  /** Минимальная известная длина пути до этого состояния */
  minKnownDepth: number;
}

export interface SearchProgress {
  elapsedMs: number;
  nodesExpanded: number;
  frontierSize: number;
  bestScore: number;
  bestDepth: number;
  bestPath: MoveName[];
  /** Текущий лимит глубины в iterative deepening (complete). */
  idaDepthLimit?: number;
  /** Максимальная длина префикса, до которой дошёл DFS в этой итерации IDA. */
  maxPrefixDepthThisIda?: number;
  /** Отсечено как «уже были здесь не дольше» (таблица транспозиций). */
  transposePrunes?: number;
  /** Отсечено: состояние уже на текущем пути (цикл). */
  pathCyclePrunes?: number;
  /** Beam: состояние уже было в seen. */
  beamSeenPrunes?: number;
  /** Топ состояний по числу отсечений (для UI «частые повторы»). */
  frequentPrunes?: TransposePruneEntry[];
}

export interface SearchResult {
  solved: boolean;
  reason: "solved" | "timeout" | "depth_limit" | "frontier_exhausted" | "aborted" | "memory_cap";
  moves: MoveName[];
  elapsedMs: number;
  nodesExpanded: number;
}

export type TurnSuffix = "" | "'" | "2";
export type BaseMove =
  | "U"
  | "D"
  | "L"
  | "R"
  | "F"
  | "B"
  | "Uw"
  | "Dw"
  | "Lw"
  | "Rw"
  | "Fw"
  | "Bw"
  | "u"
  | "d"
  | "l"
  | "r"
  | "f"
  | "b";
export type MoveName = `${BaseMove}${TurnSuffix}`;
