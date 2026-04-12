/// <reference lib="webworker" />

import { solveState } from "../solver/search";
import { parseSnapshotFile, stateFromSnapshot } from "../solver/state";
import type { WorkerEvent, WorkerRequest } from "../ui/types";

let generation = 0;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "stop") {
    generation += 1;
    emit({ type: "stopped" });
    return;
  }

  if (request.type !== "solve") {
    emit({ type: "error", payload: { message: "Unsupported worker message." } });
    return;
  }

  const token = ++generation;
  try {
    const snapshot = parseSnapshotFile(request.payload.snapshot);
    const initialState = stateFromSnapshot(snapshot);
    const targetSnapshot = request.payload.targetSnapshot
      ? parseSnapshotFile(request.payload.targetSnapshot)
      : null;
    const targetState = targetSnapshot ? stateFromSnapshot(targetSnapshot) : null;

    const result = solveState(initialState, targetState, request.payload.options, (progress) => {
      if (token !== generation) {
        return;
      }
      emit({ type: "progress", payload: progress });
    });

    if (token !== generation) {
      return;
    }

    emit({ type: "done", payload: result });
  } catch (error) {
    if (token !== generation) {
      return;
    }
    emit({
      type: "error",
      payload: { message: error instanceof Error ? error.message : "Unknown solver error." }
    });
  }
};

function emit(message: WorkerEvent): void {
  self.postMessage(message);
}
