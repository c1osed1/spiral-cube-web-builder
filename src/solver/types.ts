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

export interface SearchOptions {
  beamWidth: number;
  maxDepth: number;
  timeBudgetMs: number;
  progressEveryExpansions: number;
  strategy?: "beam" | "complete";
  searchUntilSolved?: boolean;
}

export interface SearchProgress {
  elapsedMs: number;
  nodesExpanded: number;
  frontierSize: number;
  bestScore: number;
  bestDepth: number;
  bestPath: MoveName[];
}

export interface SearchResult {
  solved: boolean;
  reason: "solved" | "timeout" | "depth_limit" | "frontier_exhausted";
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
