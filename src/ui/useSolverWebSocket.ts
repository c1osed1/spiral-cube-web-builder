import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchOptions, SearchProgress, SearchResult, SnapshotFile } from "../solver/types";
import type { SolveStreamHandlers } from "./solverApiClient";
import { getSolverWebSocketUrl } from "./solverApiClient";

type SocketPhase = "connecting" | "open" | "error";

type PendingHandlers = SolveStreamHandlers & { resolve?: () => void };

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
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<PendingHandlers | null>(null);
  const [socketPhase, setSocketPhase] = useState<SocketPhase>("connecting");

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const clearTimer = (): void => {
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const finishPendingAbort = (): void => {
      const h = handlersRef.current;
      if (!h) {
        return;
      }
      handlersRef.current = null;
      h.onAborted?.();
      h.resolve?.();
    };

    const finishPendingError = (message: string): void => {
      const h = handlersRef.current;
      if (!h) {
        return;
      }
      handlersRef.current = null;
      h.onError(message);
      h.resolve?.();
    };

    const scheduleReconnect = (): void => {
      if (cancelled) {
        return;
      }
      setSocketPhase("connecting");
      const delay = Math.min(30_000, 800 * Math.pow(1.5, attempt++));
      reconnectTimer = window.setTimeout(openSocket, delay);
    };

    function openSocket(): void {
      clearTimer();
      if (cancelled) {
        return;
      }

      setSocketPhase("connecting");

      const url = getSolverWebSocketUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        attempt = 0;
        setSocketPhase("open");
      };

      ws.onmessage = (ev: MessageEvent) => {
        const h = handlersRef.current;
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
            handlersRef.current = null;
            h.onDone(msg.payload as SearchResult);
            h.resolve?.();
          } else if (
            msg.type === "error" &&
            msg.payload &&
            typeof (msg.payload as { message?: string }).message === "string"
          ) {
            handlersRef.current = null;
            h.onError((msg.payload as { message: string }).message);
            h.resolve?.();
          }
        } catch (e) {
          handlersRef.current = null;
          h.onError(e instanceof Error ? e.message : "Невалидное сообщение с сервера.");
          h.resolve?.();
        }
      };

      ws.onerror = () => {
        setSocketPhase("error");
        if (handlersRef.current) {
          finishPendingError("WebSocket: не удалось подключиться. Запущен ли `npm run server`?");
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (handlersRef.current) {
          finishPendingError("Соединение закрыто до ответа done.");
        }
        if (!cancelled) {
          scheduleReconnect();
        }
      };
    }

    openSocket();

    return () => {
      cancelled = true;
      clearTimer();
      finishPendingAbort();
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
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
      if (handlersRef.current) {
        handlers.onError("На соединении уже выполняется поиск.");
        return;
      }
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        handlers.onError("Сокет не подключён. Дождитесь соединения или проверьте сервер.");
        return;
      }

      const pending: PendingHandlers = { ...handlers };
      handlersRef.current = pending;

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
          handlersRef.current = null;
          resolve();
          handlers.onError(e instanceof Error ? e.message : "Не удалось отправить задачу.");
        }
      });
    },
    []
  );

  const sendStop = useCallback((): void => {
    try {
      wsRef.current?.send(JSON.stringify({ type: "stop" }));
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
