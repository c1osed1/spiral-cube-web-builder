import { applyMove } from "./moves";
import { legalMoves } from "./bandage";
import { isSolved, scoreState, serializeBondState, serializeState } from "./state";
import type {
  BondInterpretation,
  CubeState,
  MoveName,
  SearchOptions,
  SearchProgress,
  SearchResult
} from "./types";

interface SearchNode {
  state: CubeState;
  path: MoveName[];
  score: number;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  beamWidth: 2200,
  maxDepth: 180,
  timeBudgetMs: 300_000,
  progressEveryExpansions: 1500,
  strategy: "beam",
  searchUntilSolved: false,
  unlimitedTime: false,
  bondMode: "auto"
};

function timeLimitExceeded(cfg: SearchOptions, startedAt: number): boolean {
  if (cfg.unlimitedTime || (cfg.timeBudgetMs ?? 0) <= 0) {
    return false;
  }
  return performance.now() - startedAt > cfg.timeBudgetMs;
}

function bondMode(cfg: SearchOptions): BondInterpretation {
  return cfg.bondMode ?? "auto";
}

export function solveState(
  initialState: CubeState,
  targetState: CubeState | null = null,
  options: Partial<SearchOptions> = {},
  onProgress?: (progress: SearchProgress) => void
): SearchResult {
  const cfg = { ...DEFAULT_SEARCH_OPTIONS, ...options };
  if (cfg.strategy === "complete") {
    return solveStateComplete(initialState, targetState, cfg, onProgress);
  }
  return solveStateBeam(initialState, targetState, cfg, onProgress);
}

function solveStateBeam(
  initialState: CubeState,
  targetState: CubeState | null,
  cfg: SearchOptions,
  onProgress?: (progress: SearchProgress) => void
): SearchResult {
  const startedAt = performance.now();
  const targetKey = targetState ? serializeState(targetState) : null;
  const targetStickers = targetState?.stickers ?? null;
  const targetBondKey = targetState ? serializeBondState(targetState) : null;
  const seen = new Set<string>([serializeState(initialState)]);

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

  for (let depth = 0; depth < cfg.maxDepth; depth += 1) {
    const elapsed = performance.now() - startedAt;
    if (timeLimitExceeded(cfg, startedAt)) {
      return makeResult(false, "timeout", bestNode.path, elapsed, nodesExpanded);
    }

    const nextLayer: SearchNode[] = [];
    for (const node of frontier) {
      const prev = node.path[node.path.length - 1];
      const moves = legalMoves(node.state, prev, bondMode(cfg));
      for (const move of moves) {
        const nextState = applyMove(node.state, move);
        const key = serializeState(nextState);
        if (seen.has(key)) {
          continue;
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

        if (nodesExpanded % cfg.progressEveryExpansions === 0 && onProgress) {
          onProgress({
            elapsedMs: performance.now() - startedAt,
            nodesExpanded,
            frontierSize: nextLayer.length,
            bestScore: bestNode.score,
            bestDepth: bestNode.path.length,
            bestPath: bestNode.path
          });
        }
      }
    }

    if (nextLayer.length === 0) {
      const endElapsed = performance.now() - startedAt;
      return makeResult(false, "frontier_exhausted", bestNode.path, endElapsed, nodesExpanded);
    }

    nextLayer.sort((a, b) => a.score - b.score || a.path.length - b.path.length);
    frontier = nextLayer.slice(0, cfg.beamWidth);
  }

  const totalElapsed = performance.now() - startedAt;
  return makeResult(false, "depth_limit", bestNode.path, totalElapsed, nodesExpanded);
}

function solveStateComplete(
  initialState: CubeState,
  targetState: CubeState | null,
  cfg: SearchOptions,
  onProgress?: (progress: SearchProgress) => void
): SearchResult {
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

  const depthStart = 1;
  const depthEnd = cfg.searchUntilSolved ? Number.MAX_SAFE_INTEGER : cfg.maxDepth;

  for (let depthLimit = depthStart; depthLimit <= depthEnd; depthLimit += 1) {
    const pathSet = new Set<string>([serializeState(initialState)]);
    const found = dfsDepthLimited({
      state: initialState,
      prevMove: undefined,
      depthRemaining: depthLimit,
      path: [],
      pathSet,
      targetKey,
      targetStickers,
      targetBondKey,
      startedAt,
      cfg,
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
        }
      },
      onProgress
    });

    if (found.status === "solved") {
      return makeResult(true, "solved", found.path, performance.now() - startedAt, nodesExpanded);
    }
    if (found.status === "timeout") {
      return makeResult(false, "timeout", bestPath, performance.now() - startedAt, nodesExpanded);
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
  targetKey: string | null;
  targetStickers: CubeState["stickers"] | null;
  targetBondKey: string | null;
  startedAt: number;
  cfg: SearchOptions;
  stats: {
    nodesExpanded: number;
    incNodes: () => void;
    updateBest: (score: number, path: MoveName[]) => void;
  };
  onProgress?: (progress: SearchProgress) => void;
}

function dfsDepthLimited(args: DfsArgs): { status: "solved"; path: MoveName[] } | { status: "timeout" } | { status: "continue" } {
  if (timeLimitExceeded(args.cfg, args.startedAt)) {
    return { status: "timeout" };
  }
  if (isGoalState(args.state, args.targetKey)) {
    return { status: "solved", path: args.path };
  }
  if (args.depthRemaining === 0) {
    return { status: "continue" };
  }

  const moves = legalMoves(args.state, args.prevMove, bondMode(args.cfg));
  for (const move of moves) {
    const nextState = applyMove(args.state, move);
    const key = serializeState(nextState);
    if (args.pathSet.has(key)) {
      continue;
    }

    args.stats.incNodes();
    const nextPath = [...args.path, move];
    args.stats.updateBest(evaluateState(nextState, args.targetStickers, args.targetBondKey), nextPath);

    if (args.stats.nodesExpanded % args.cfg.progressEveryExpansions === 0 && args.onProgress) {
      args.onProgress({
        elapsedMs: performance.now() - args.startedAt,
        nodesExpanded: args.stats.nodesExpanded,
        frontierSize: 0,
        bestScore: 0,
        bestDepth: nextPath.length,
        bestPath: nextPath
      });
    }

    args.pathSet.add(key);
    const found = dfsDepthLimited({
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
