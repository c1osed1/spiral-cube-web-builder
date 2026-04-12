import type { MoveName, SearchOptions, SearchProgress, SearchResult, SnapshotFile } from "../solver/types";

export interface WorkerSolveRequest {
  type: "solve";
  payload: {
    snapshot: SnapshotFile;
    targetSnapshot?: SnapshotFile;
    options?: Partial<SearchOptions>;
  };
}

export interface WorkerStopRequest {
  type: "stop";
}

export type WorkerRequest = WorkerSolveRequest | WorkerStopRequest;

export interface WorkerProgressEvent {
  type: "progress";
  payload: SearchProgress;
}

export interface WorkerDoneEvent {
  type: "done";
  payload: SearchResult;
}

export interface WorkerErrorEvent {
  type: "error";
  payload: {
    message: string;
  };
}

export interface WorkerStoppedEvent {
  type: "stopped";
}

export type WorkerEvent = WorkerProgressEvent | WorkerDoneEvent | WorkerErrorEvent | WorkerStoppedEvent;

export interface PlaybackState {
  moves: MoveName[];
  currentStep: number;
}
