import { applyMove, inverseMove } from "./moves";
import { legalMoves } from "./bandage";
import { isSolved, scoreState, serializeBondState, serializeState } from "./state";
import type {
  BondInterpretation,
  CubeState,
  MoveName,
  SearchOptions,
  SearchProgress,
  SearchResult,
  TransposePruneEntry
} from "./types";

interface SearchNode {
  state: CubeState;
  path: MoveName[];
  score: number;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  beamWidth: 50_000,
  maxDepth: 500,
  timeBudgetMs: 300_000,
  progressEveryExpansions: 50_000,
  strategy: "beam",
  searchUntilSolved: false,
  unlimitedTime: false,
  bondMode: "auto"
};

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(x)));
}

/** Защита от API/JSON: maxDepth 0 / NaN / null даёт пустой цикл и «мгновенный» depth_limit без узлов. */
function normalizeSearchOptions(input: SearchOptions): SearchOptions {
  const unlimited = Boolean(input.unlimitedTime);
  return {
    beamWidth: clampInt(input.beamWidth, DEFAULT_SEARCH_OPTIONS.beamWidth, 2, 50_000),
    maxDepth: clampInt(input.maxDepth, DEFAULT_SEARCH_OPTIONS.maxDepth, 1, 500),
    timeBudgetMs: unlimited
      ? 0
      : clampInt(input.timeBudgetMs, DEFAULT_SEARCH_OPTIONS.timeBudgetMs, 1000, 1_000_000_000),
    progressEveryExpansions: clampInt(
      input.progressEveryExpansions,
      DEFAULT_SEARCH_OPTIONS.progressEveryExpansions,
      1,
      50_000
    ),
    strategy: input.strategy === "complete" ? "complete" : "beam",
    searchUntilSolved: Boolean(input.searchUntilSolved),
    unlimitedTime: unlimited,
    bondMode: input.bondMode ?? "auto",
    shouldAbort: typeof input.shouldAbort === "function" ? input.shouldAbort : undefined
  };
}

const MAX_PRUNE_MAP_KEYS = 2500;
const TOP_PRUNE_UI = 14;

/** Не слать одинаковый лучший префикс в onProgress чаще, чем раз в N мс (меньше «задышки» UI/WS). */
const PROGRESS_DEDUPE_MS = 2800;

/**
 * Лимит уникальных состояний в beam `seen` (RAM).
 * ~5M строк состояний + накладные расходы V8 — ориентир под машину ~15 ГБ и heap Node ~12 ГБ
 * (`NODE_OPTIONS=--max-old-space-size=12288` в npm scripts).
 */
const MAX_BEAM_SEEN_KEYS = 5_000_000;

/** Лимит transpose-кэша одной итерации IDA (complete) — тот же порядок памяти. */
const MAX_COMPLETE_TRANSPOSITION_KEYS = 5_000_000;

function compactStateId(serialized: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < serialized.length; i += 1) {
    h ^= serialized.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function recordPruneHit(
  map: Map<string, { count: number; minKnownDepth: number }>,
  fullKey: string,
  shorterOrEqualDepth: number
): void {
  const cur = map.get(fullKey);
  if (cur) {
    cur.count += 1;
    cur.minKnownDepth = Math.min(cur.minKnownDepth, shorterOrEqualDepth);
    return;
  }
  if (map.size >= MAX_PRUNE_MAP_KEYS) {
    return;
  }
  map.set(fullKey, { count: 1, minKnownDepth: shorterOrEqualDepth });
}

function topPruneEntries(map: Map<string, { count: number; minKnownDepth: number }>): TransposePruneEntry[] {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, TOP_PRUNE_UI)
    .map(([fullKey, v]) => ({
      stateId: compactStateId(fullKey),
      prunes: v.count,
      minKnownDepth: v.minKnownDepth
    }));
}

function timeLimitExceeded(cfg: SearchOptions, startedAt: number): boolean {
  if (cfg.unlimitedTime || (cfg.timeBudgetMs ?? 0) <= 0) {
    return false;
  }
  return performance.now() - startedAt > cfg.timeBudgetMs;
}

function bondMode(cfg: SearchOptions): BondInterpretation {
  return cfg.bondMode ?? "auto";
}

function checkSearchStop(cfg: SearchOptions, startedAt: number): "ok" | "abort" | "timeout" {
  if (cfg.shouldAbort?.()) {
    return "abort";
  }
  if (timeLimitExceeded(cfg, startedAt)) {
    return "timeout";
  }
  return "ok";
}

/** Lets the worker event loop run so «Стоп» / новый «Старт» обрабатываются. */
async function yieldIfNeeded(
  cfg: SearchOptions,
  startedAt: number,
  nodesExpanded: number
): Promise<"ok" | "abort" | "timeout"> {
  const first = checkSearchStop(cfg, startedAt);
  if (first !== "ok") {
    return first;
  }
  const chunk = cfg.progressEveryExpansions ?? DEFAULT_SEARCH_OPTIONS.progressEveryExpansions;
  if (typeof cfg.shouldAbort !== "function" || nodesExpanded === 0 || nodesExpanded % chunk !== 0) {
    return "ok";
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return checkSearchStop(cfg, startedAt);
}

export async function solveState(
  initialState: CubeState,
  targetState: CubeState | null = null,
  options: Partial<SearchOptions> = {},
  onProgress?: (progress: SearchProgress) => void
): Promise<SearchResult> {
  const cfg = normalizeSearchOptions({ ...DEFAULT_SEARCH_OPTIONS, ...options });
  const startedAt = performance.now();

  if (typeof cfg.shouldAbort === "function") {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (cfg.shouldAbort()) {
      return makeResult(false, "aborted", [], performance.now() - startedAt, 0);
    }
  }

  if (cfg.strategy === "complete") {
    return solveStateComplete(initialState, targetState, cfg, onProgress);
  }
  return solveStateBeam(initialState, targetState, cfg, onProgress);
}

async function solveStateBeam(
  initialState: CubeState,
  targetState: CubeState | null,
  cfg: SearchOptions,
  onProgress?: (progress: SearchProgress) => void
): Promise<SearchResult> {
  const startedAt = performance.now();
  const targetKey = targetState ? serializeState(targetState) : null;
  const targetStickers = targetState?.stickers ?? null;
  const targetBondKey = targetState ? serializeBondState(targetState) : null;
  const seen = new Set<string>([serializeState(initialState)]);
  const pruneByKey = new Map<string, { count: number; minKnownDepth: number }>();
  let beamSeenPrunes = 0;

  let frontier: SearchNode[] = [
    {
      state: initialState,
      path: [],
      score: evaluateState(initialState, targetStickers, targetBondKey)
    }
  ];

  let nodesExpanded = 0;
  let bestNode = frontier[0];

  if (isGoalState(initialState, targetKey)) {
    return {
      solved: true,
      reason: "solved",
      moves: [],
      elapsedMs: 0,
      nodesExpanded: 0
    };
  }

  let lastEmitSig = "";
  let lastEmitAt = 0;

  function emitProgress(frontierSize: number, force = false): void {
    if (!onProgress) return;
    const now = performance.now();
    const sig = `${bestNode.score}\u0000${bestNode.path.join("\u0001")}\u0000${bestNode.path.length}`;
    if (!force && sig === lastEmitSig && now - lastEmitAt < PROGRESS_DEDUPE_MS) {
      return;
    }
    lastEmitSig = sig;
    lastEmitAt = now;
    onProgress({
      elapsedMs: performance.now() - startedAt,
      nodesExpanded,
      frontierSize,
      bestScore: bestNode.score,
      bestDepth: bestNode.path.length,
      bestPath: bestNode.path,
      beamSeenPrunes,
      frequentPrunes: topPruneEntries(pruneByKey)
    });
  }

  for (let depth = 0; depth < cfg.maxDepth; depth += 1) {
    if (typeof cfg.shouldAbort === "function") {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const st = checkSearchStop(cfg, startedAt);
      if (st === "abort") {
        return makeResult(false, "aborted", bestNode.path, performance.now() - startedAt, nodesExpanded);
      }
      if (st === "timeout") {
        return makeResult(false, "timeout", bestNode.path, performance.now() - startedAt, nodesExpanded);
      }
    }

    const nextLayer: SearchNode[] = [];
    for (const node of frontier) {
      const prev = node.path[node.path.length - 1];
      for (const { move, nextState } of orderedChildMoves(
        node.state,
        prev,
        cfg,
        targetStickers,
        targetBondKey,
        node.path.length
      )) {
        const key = serializeState(nextState);
        if (seen.has(key)) {
          beamSeenPrunes += 1;
          recordPruneHit(pruneByKey, key, node.path.length + 1);
          continue;
        }
        if (seen.size >= MAX_BEAM_SEEN_KEYS) {
          const elapsed = performance.now() - startedAt;
          return makeResult(false, "memory_cap", bestNode.path, elapsed, nodesExpanded);
        }
        seen.add(key);

        const path = [...node.path, move];
        const score = evaluateState(nextState, targetStickers, targetBondKey);
        const nextNode: SearchNode = { state: nextState, path, score };
        nextLayer.push(nextNode);
        nodesExpanded += 1;

        if (score < bestNode.score || (score === bestNode.score && path.length < bestNode.path.length)) {
          bestNode = nextNode;
        }

        if (isGoalState(nextState, targetKey)) {
          const solvedElapsed = performance.now() - startedAt;
          return makeResult(true, "solved", path, solvedElapsed, nodesExpanded);
        }

        if (nodesExpanded % cfg.progressEveryExpansions === 0) {
          emitProgress(nextLayer.length);
        }

        const y = await yieldIfNeeded(cfg, startedAt, nodesExpanded);
        if (y === "abort") {
          return makeResult(false, "aborted", bestNode.path, performance.now() - startedAt, nodesExpanded);
        }
        if (y === "timeout") {
          return makeResult(false, "timeout", bestNode.path, performance.now() - startedAt, nodesExpanded);
        }
      }
    }

    if (nextLayer.length === 0) {
      const endElapsed = performance.now() - startedAt;
      return makeResult(false, "frontier_exhausted", bestNode.path, endElapsed, nodesExpanded);
    }

    nextLayer.sort((a, b) => a.score - b.score || a.path.length - b.path.length);
    frontier = nextLayer.slice(0, cfg.beamWidth);
    emitProgress(frontier.length, true);
  }

  const totalElapsed = performance.now() - startedAt;
  return makeResult(false, "depth_limit", bestNode.path, totalElapsed, nodesExpanded);
}

interface CompleteSearchMetrics {
  transposePrunes: number;
  pathCyclePrunes: number;
  maxPrefixDepthThisIda: number;
  pruneByKey: Map<string, { count: number; minKnownDepth: number }>;
}

async function solveStateComplete(
  initialState: CubeState,
  targetState: CubeState | null,
  cfg: SearchOptions,
  onProgress?: (progress: SearchProgress) => void
): Promise<SearchResult> {
  const startedAt = performance.now();
  const targetKey = targetState ? serializeState(targetState) : null;
  const targetStickers = targetState?.stickers ?? null;
  const targetBondKey = targetState ? serializeBondState(targetState) : null;

  if (isGoalState(initialState, targetKey)) {
    return {
      solved: true,
      reason: "solved",
      moves: [],
      elapsedMs: 0,
      nodesExpanded: 0
    };
  }

  let nodesExpanded = 0;
  let bestPath: MoveName[] = [];
  let bestScore = evaluateState(initialState, targetStickers, targetBondKey);

  const metrics: CompleteSearchMetrics = {
    transposePrunes: 0,
    pathCyclePrunes: 0,
    maxPrefixDepthThisIda: 0,
    pruneByKey: new Map()
  };

  const depthStart = 1;
  const depthEnd = cfg.searchUntilSolved ? Number.MAX_SAFE_INTEGER : cfg.maxDepth;

  for (let depthLimit = depthStart; depthLimit <= depthEnd; depthLimit += 1) {
    if (typeof cfg.shouldAbort === "function") {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const st = checkSearchStop(cfg, startedAt);
      if (st === "abort") {
        return makeResult(false, "aborted", bestPath, performance.now() - startedAt, nodesExpanded);
      }
      if (st === "timeout") {
        return makeResult(false, "timeout", bestPath, performance.now() - startedAt, nodesExpanded);
      }
    }

    metrics.maxPrefixDepthThisIda = 0;

    const pathSet = new Set<string>([serializeState(initialState)]);
    const minPathLenByState = new Map<string, number>();

    const reportProgress: ((payload: SearchProgress) => void) | undefined = onProgress
      ? (() => {
          let lastSig = "";
          let lastAt = 0;
          return (payload: SearchProgress): void => {
            const sig = `${payload.bestScore}\u0000${payload.bestPath.join("\u0001")}\u0000${payload.idaDepthLimit ?? 0}\u0000${payload.maxPrefixDepthThisIda ?? 0}`;
            const now = performance.now();
            if (sig === lastSig && now - lastAt < PROGRESS_DEDUPE_MS) {
              return;
            }
            lastSig = sig;
            lastAt = now;
            onProgress(payload);
          };
        })()
      : undefined;

    const found = await dfsDepthLimited({
      state: initialState,
      prevMove: undefined,
      depthRemaining: depthLimit,
      path: [],
      pathSet,
      minPathLenByState,
      targetKey,
      targetStickers,
      targetBondKey,
      startedAt,
      cfg,
      idaDepthLimit: depthLimit,
      metrics,
      stats: {
        get nodesExpanded() {
          return nodesExpanded;
        },
        incNodes() {
          nodesExpanded += 1;
        },
        updateBest(score: number, path: MoveName[]) {
          if (score < bestScore || (score === bestScore && path.length < bestPath.length)) {
            bestScore = score;
            bestPath = [...path];
          }
        },
        get bestPath() {
          return bestPath;
        },
        get bestScore() {
          return bestScore;
        }
      },
      onProgress: reportProgress
    });

    if (found.status === "solved") {
      return makeResult(true, "solved", found.path, performance.now() - startedAt, nodesExpanded);
    }
    if (found.status === "timeout") {
      return makeResult(false, "timeout", bestPath, performance.now() - startedAt, nodesExpanded);
    }
    if (found.status === "aborted") {
      return makeResult(false, "aborted", bestPath, performance.now() - startedAt, nodesExpanded);
    }
    if (found.status === "memory_cap") {
      return makeResult(false, "memory_cap", bestPath, performance.now() - startedAt, nodesExpanded);
    }
  }

  return makeResult(false, "depth_limit", bestPath, performance.now() - startedAt, nodesExpanded);
}

interface DfsArgs {
  state: CubeState;
  prevMove?: MoveName;
  depthRemaining: number;
  path: MoveName[];
  pathSet: Set<string>;
  minPathLenByState: Map<string, number>;
  targetKey: string | null;
  targetStickers: CubeState["stickers"] | null;
  targetBondKey: string | null;
  startedAt: number;
  cfg: SearchOptions;
  idaDepthLimit: number;
  metrics: CompleteSearchMetrics;
  stats: {
    nodesExpanded: number;
    incNodes: () => void;
    updateBest: (score: number, path: MoveName[]) => void;
    bestPath: MoveName[];
    bestScore: number;
  };
  onProgress?: (progress: SearchProgress) => void;
}

type DfsOutcome =
  | { status: "solved"; path: MoveName[] }
  | { status: "timeout" }
  | { status: "continue" }
  | { status: "aborted" }
  | { status: "memory_cap" };

/** Детерминированная «соль» от состояния и глубины — при равной h меняется порядок ходов, меньше однообразных циклов в разветвлении. */
function stickerTieSalt(state: CubeState, pathDepth: number): number {
  let h = Math.imul(pathDepth, 0x9e3779b9) >>> 0;
  const s = state.stickers;
  const step = Math.max(1, Math.floor(s.length / 32));
  for (let i = 0; i < s.length; i += step) {
    const st = s[i]!;
    h = (Math.imul(h, 65599) ^ st.charCodeAt(0)) >>> 0;
  }
  return h >>> 0;
}

function moveTieRank(move: MoveName): number {
  let u = 0;
  for (let i = 0; i < move.length; i += 1) {
    u = (Math.imul(u, 33) + move.charCodeAt(i)) >>> 0;
  }
  return u >>> 0;
}

/** Сначала разветвляем ходы с лучшим эвристическим score; при равной h — порядок от соль+ход (не только localeCompare). */
function orderedChildMoves(
  state: CubeState,
  prevMove: MoveName | undefined,
  cfg: SearchOptions,
  targetStickers: CubeState["stickers"] | null,
  targetBondKey: string | null,
  pathDepth = 0
): { move: MoveName; nextState: CubeState }[] {
  const rawMoves = legalMoves(state, prevMove, bondMode(cfg));
  const pm = prevMove;
  const moves = pm !== undefined ? rawMoves.filter((m) => m !== inverseMove(pm)) : rawMoves;
  const scored = moves.map((move) => {
    const nextState = applyMove(state, move);
    return { move, nextState, h: evaluateState(nextState, targetStickers, targetBondKey) };
  });
  const salt = stickerTieSalt(state, pathDepth);
  scored.sort((a, b) => {
    if (a.h !== b.h) {
      return a.h - b.h;
    }
    const ra = (moveTieRank(a.move) ^ salt) >>> 0;
    const rb = (moveTieRank(b.move) ^ salt) >>> 0;
    return ra !== rb ? ra - rb : a.move.localeCompare(b.move);
  });
  return scored;
}

async function dfsDepthLimited(args: DfsArgs): Promise<DfsOutcome> {
  const st0 = checkSearchStop(args.cfg, args.startedAt);
  if (st0 === "abort") {
    return { status: "aborted" };
  }
  if (st0 === "timeout") {
    return { status: "timeout" };
  }
  if (isGoalState(args.state, args.targetKey)) {
    return { status: "solved", path: args.path };
  }
  if (args.depthRemaining === 0) {
    return { status: "continue" };
  }

  for (const { move, nextState } of orderedChildMoves(
    args.state,
    args.prevMove,
    args.cfg,
    args.targetStickers,
    args.targetBondKey,
    args.path.length
  )) {
    const key = serializeState(nextState);
    if (args.pathSet.has(key)) {
      args.metrics.pathCyclePrunes += 1;
      recordPruneHit(args.metrics.pruneByKey, key, args.path.length + 1);
      continue;
    }

    const nextPath = [...args.path, move];
    const pathLen = nextPath.length;
    args.metrics.maxPrefixDepthThisIda = Math.max(args.metrics.maxPrefixDepthThisIda, pathLen);

    const prevBest = args.minPathLenByState.get(key);
    if (prevBest !== undefined && prevBest <= pathLen) {
      args.metrics.transposePrunes += 1;
      recordPruneHit(args.metrics.pruneByKey, key, prevBest);
      continue;
    }
    if (!args.minPathLenByState.has(key) && args.minPathLenByState.size >= MAX_COMPLETE_TRANSPOSITION_KEYS) {
      return { status: "memory_cap" };
    }
    args.minPathLenByState.set(key, pathLen);

    args.stats.incNodes();
    args.stats.updateBest(evaluateState(nextState, args.targetStickers, args.targetBondKey), nextPath);

    if (args.stats.nodesExpanded % args.cfg.progressEveryExpansions === 0 && args.onProgress) {
      args.onProgress({
        elapsedMs: performance.now() - args.startedAt,
        nodesExpanded: args.stats.nodesExpanded,
        frontierSize: 0,
        bestScore: args.stats.bestScore,
        bestDepth: args.stats.bestPath.length,
        bestPath: [...args.stats.bestPath],
        idaDepthLimit: args.idaDepthLimit,
        maxPrefixDepthThisIda: args.metrics.maxPrefixDepthThisIda,
        transposePrunes: args.metrics.transposePrunes,
        pathCyclePrunes: args.metrics.pathCyclePrunes,
        frequentPrunes: topPruneEntries(args.metrics.pruneByKey)
      });
    }

    const y = await yieldIfNeeded(args.cfg, args.startedAt, args.stats.nodesExpanded);
    if (y === "abort") {
      return { status: "aborted" };
    }
    if (y === "timeout") {
      return { status: "timeout" };
    }

    args.pathSet.add(key);
    const found = await dfsDepthLimited({
      ...args,
      state: nextState,
      prevMove: move,
      depthRemaining: args.depthRemaining - 1,
      path: nextPath
    });
    args.pathSet.delete(key);

    if (found.status !== "continue") {
      return found;
    }
  }
  return { status: "continue" };
}

function isGoalState(state: CubeState, targetKey: string | null): boolean {
  if (targetKey) {
    return serializeState(state) === targetKey;
  }
  return isSolved(state);
}

function evaluateState(
  state: CubeState,
  targetStickers: CubeState["stickers"] | null,
  targetBondKey: string | null
): number {
  if (!targetStickers) {
    return scoreState(state);
  }
  let mismatch = 0;
  for (let idx = 0; idx < state.stickers.length; idx += 1) {
    if (state.stickers[idx] !== targetStickers[idx]) {
      mismatch += 1;
    }
  }
  if (!targetBondKey) {
    return mismatch;
  }
  const bondPenalty = serializeBondState(state) === targetBondKey ? 0 : 12;
  return mismatch + bondPenalty;
}

function makeResult(
  solved: boolean,
  reason: SearchResult["reason"],
  moves: MoveName[],
  elapsedMs: number,
  nodesExpanded: number
): SearchResult {
  return {
    solved,
    reason,
    moves,
    elapsedMs: Math.round(elapsedMs),
    nodesExpanded
  };
}
