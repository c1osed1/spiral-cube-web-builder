import { useCallback, useEffect, useState } from "react";
import type { SearchOptions, SearchProgress, SearchResult, SnapshotFile } from "../solver/types";
import type { SolveStreamHandlers } from "./solverApiClient";
import { getSolverWebSocketUrl } from "./solverApiClient";

type SocketPhase = "connecting" | "open" | "error";

type PendingHandlers = SolveStreamHandlers & { resolve?: () => void };

/**
 * Один WebSocket на вкладку: React StrictMode делает mount→cleanup→mount и рвёт CONNECTING,
 * если закрывать сокет в cleanup сразу. Ref-count + отложенный close убирают лишние connect/abort.
 * Рассчитан на один вызов хука (App).
 */
let sharedWs: WebSocket | null = null;
let pendingHandlers: PendingHandlers | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let connectionSubscribers = 0;

const phaseListeners = new Set<(phase: SocketPhase) => void>();

function emitPhase(phase: SocketPhase): void {
  for (const fn of phaseListeners) {
    fn(phase);
  }
}

function clearReconnect(): void {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearDisconnect(): void {
  if (disconnectTimer != null) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
}

function finishPendingAbort(): void {
  const h = pendingHandlers;
  if (!h) {
    return;
  }
  pendingHandlers = null;
  h.onAborted?.();
  h.resolve?.();
}

function finishPendingError(message: string): void {
  const h = pendingHandlers;
  if (!h) {
    return;
  }
  pendingHandlers = null;
  h.onError(message);
  h.resolve?.();
}

function scheduleReconnect(): void {
  if (connectionSubscribers === 0) {
    return;
  }
  clearReconnect();
  emitPhase("connecting");
  const delay = Math.min(30_000, 2000 * Math.pow(1.35, reconnectAttempt++));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSharedSocket();
  }, delay);
}

function openSharedSocket(): void {
  clearReconnect();
  if (connectionSubscribers === 0) {
    return;
  }

  if (sharedWs && (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (sharedWs) {
    try {
      sharedWs.close();
    } catch {
      /* ignore */
    }
    sharedWs = null;
  }

  emitPhase("connecting");
  const url = getSolverWebSocketUrl();
  const ws = new WebSocket(url);
  sharedWs = ws;

  ws.onopen = () => {
    if (connectionSubscribers === 0) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return;
    }
    reconnectAttempt = 0;
    emitPhase("open");
  };

  ws.onmessage = (ev: MessageEvent) => {
    const h = pendingHandlers;
    if (!h) {
      return;
    }
    try {
      const msg = JSON.parse(String(ev.data)) as {
        type: string;
        payload?: SearchProgress | SearchResult | { message: string };
      };
      if (msg.type === "progress" && msg.payload && h.onProgress) {
        h.onProgress(msg.payload as SearchProgress);
      } else if (msg.type === "done" && msg.payload) {
        pendingHandlers = null;
        h.onDone(msg.payload as SearchResult);
        h.resolve?.();
      } else if (
        msg.type === "error" &&
        msg.payload &&
        typeof (msg.payload as { message?: string }).message === "string"
      ) {
        pendingHandlers = null;
        h.onError((msg.payload as { message: string }).message);
        h.resolve?.();
      }
    } catch (e) {
      pendingHandlers = null;
      h.onError(e instanceof Error ? e.message : "Невалидное сообщение с сервера.");
      h.resolve?.();
    }
  };

  ws.onerror = () => {
    emitPhase("error");
    if (pendingHandlers) {
      finishPendingError("WebSocket: не удалось подключиться. Запущен ли `npm run server`?");
    }
  };

  ws.onclose = () => {
    if (sharedWs === ws) {
      sharedWs = null;
    }
    if (pendingHandlers) {
      finishPendingError("Соединение закрыто до ответа done.");
    }
    if (connectionSubscribers > 0) {
      scheduleReconnect();
    }
  };
}

function subscribeConnection(): void {
  connectionSubscribers += 1;
  clearDisconnect();
  if (!sharedWs || sharedWs.readyState === WebSocket.CLOSED) {
    openSharedSocket();
  } else if (sharedWs.readyState === WebSocket.OPEN) {
    emitPhase("open");
  } else {
    emitPhase("connecting");
  }
}

function unsubscribeConnection(): void {
  connectionSubscribers = Math.max(0, connectionSubscribers - 1);
  clearReconnect();
  if (connectionSubscribers === 0) {
    disconnectTimer = setTimeout(() => {
      disconnectTimer = null;
      if (connectionSubscribers > 0) {
        return;
      }
      try {
        sharedWs?.close();
      } catch {
        /* ignore */
      }
      sharedWs = null;
      if (pendingHandlers) {
        finishPendingAbort();
      }
    }, 450);
  }
}

export function useSolverWebSocket(): {
  socketPhase: SocketPhase;
  socketHint: string;
  sendSolve: (
    payload: {
      snapshot: SnapshotFile;
      targetSnapshot?: SnapshotFile;
      options: Partial<SearchOptions>;
    },
    handlers: SolveStreamHandlers
  ) => Promise<void>;
  sendStop: () => void;
} {
  const [socketPhase, setSocketPhase] = useState<SocketPhase>(() =>
    sharedWs?.readyState === WebSocket.OPEN ? "open" : "connecting"
  );

  useEffect(() => {
    const onPhase = (p: SocketPhase): void => {
      setSocketPhase(p);
    };
    phaseListeners.add(onPhase);
    subscribeConnection();
    return () => {
      phaseListeners.delete(onPhase);
      unsubscribeConnection();
    };
  }, []);

  const sendSolve = useCallback(
    async (
      payload: {
        snapshot: SnapshotFile;
        targetSnapshot?: SnapshotFile;
        options: Partial<SearchOptions>;
      },
      handlers: SolveStreamHandlers
    ): Promise<void> => {
      if (pendingHandlers) {
        handlers.onError("На соединении уже выполняется поиск.");
        return;
      }
      const ws = sharedWs;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        handlers.onError("Сокет не подключён. Дождитесь соединения или проверьте сервер.");
        return;
      }

      const pending: PendingHandlers = { ...handlers };
      pendingHandlers = pending;

      await new Promise<void>((resolve) => {
        pending.resolve = resolve;
        try {
          ws.send(
            JSON.stringify({
              type: "solve",
              snapshot: payload.snapshot,
              targetSnapshot: payload.targetSnapshot,
              options: payload.options
            })
          );
        } catch (e) {
          pendingHandlers = null;
          resolve();
          handlers.onError(e instanceof Error ? e.message : "Не удалось отправить задачу.");
        }
      });
    },
    []
  );

  const sendStop = useCallback((): void => {
    try {
      sharedWs?.send(JSON.stringify({ type: "stop" }));
    } catch {
      /* ignore */
    }
  }, []);

  const socketHint =
    socketPhase === "open"
      ? ""
      : socketPhase === "connecting"
        ? "Подключение к солверу…"
        : "Нет соединения с солвером (npm run dev:full или npm run server)";

  return { socketPhase, socketHint, sendSolve, sendStop };
}
