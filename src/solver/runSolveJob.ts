import { solveState } from "./search";
import { parseSnapshotFile, stateFromSnapshot } from "./state";
import type { SearchOptions, SearchProgress, SearchResult, SnapshotFile } from "./types";

export interface RunSolveJobParams {
  snapshot: unknown;
  targetSnapshot?: unknown;
  options?: Partial<SearchOptions>;
  onProgress?: (p: SearchProgress) => void;
  shouldAbort?: () => boolean;
}

export async function runSolveJob(params: RunSolveJobParams): Promise<SearchResult> {
  const snap = parseSnapshotFile(params.snapshot) as SnapshotFile;
  const initialState = stateFromSnapshot(snap);
  const targetState = params.targetSnapshot
    ? stateFromSnapshot(parseSnapshotFile(params.targetSnapshot) as SnapshotFile)
    : null;
  const opts: Partial<SearchOptions> = { ...(params.options ?? {}) };
  if (params.shouldAbort !== undefined) {
    opts.shouldAbort = params.shouldAbort;
  }
  return solveState(initialState, targetState, opts, params.onProgress);
}
