import type { SearchOptions, SearchProgress, SearchResult, SnapshotFile } from "../solver/types";

export type SolveStreamHandlers = {
  onProgress?: (p: SearchProgress) => void;
  onDone: (r: SearchResult) => void;
  onError: (message: string) => void;
  /** Соединение прервано (Стоп) — без сообщения об ошибке. */
  onAborted?: () => void;
};

/** Пустая строка → тот же origin (прокси Vite → Node). */
export function solverApiBase(): string {
  const raw = import.meta.env.VITE_SOLVER_API as string | undefined;
  return raw?.trim() ? raw.replace(/\/$/, "") : "";
}

const DEFAULT_DEV_SOLVER_WS_PORT = 8787;

function devSolverWsPort(): number {
  const n = Number(import.meta.env.VITE_SOLVER_WS_PORT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DEV_SOLVER_WS_PORT;
}

/** URL сокета солвера (dev → прямой порт Node, prod → тот же хост). */
export function getSolverWebSocketUrl(): string {
  const base = solverApiBase();
  if (base) {
    let hostPart = base;
    if (hostPart.startsWith("https://")) {
      hostPart = "wss://" + hostPart.slice(8);
    } else if (hostPart.startsWith("http://")) {
      hostPart = "ws://" + hostPart.slice(7);
    } else if (!hostPart.startsWith("ws://") && !hostPart.startsWith("wss://")) {
      hostPart = `ws://${hostPart.replace(/^\/\//, "")}`;
    }
    return `${hostPart.replace(/\/$/, "")}/api/ws/solve`;
  }
  // Vite http-proxy часто даёт ECONNRESET на WS upgrade — в dev идём напрямую на Node (тот же порт, что npm run server).
  if (import.meta.env.DEV) {
    return `ws://127.0.0.1:${devSolverWsPort()}/api/ws/solve`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws/solve`;
}

/** Резерв: NDJSON по HTTP (curl и т.п.). */
export async function runSolveNdjsonStream(
  payload: {
    snapshot: SnapshotFile;
    targetSnapshot?: SnapshotFile;
    options: Partial<SearchOptions>;
  },
  handlers: SolveStreamHandlers,
  signal: AbortSignal
): Promise<void> {
  const base = solverApiBase();
  const httpUrl = `${base}/api/solve`;
  const res = await fetch(httpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });

  if (!res.ok) {
    handlers.onError(`Сервер солвера: HTTP ${res.status} (${httpUrl}). Запущен ли \`npm run server\`?`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    handlers.onError("Пустой ответ сервера.");
    return;
  }

  const dec = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        const msg = JSON.parse(trimmed) as {
          type: string;
          payload?: SearchProgress | SearchResult | { message: string };
        };
        if (msg.type === "progress" && msg.payload && handlers.onProgress) {
          handlers.onProgress(msg.payload as SearchProgress);
        } else if (msg.type === "done" && msg.payload) {
          handlers.onDone(msg.payload as SearchResult);
          return;
        } else if (
          msg.type === "error" &&
          msg.payload &&
          typeof (msg.payload as { message?: string }).message === "string"
        ) {
          handlers.onError((msg.payload as { message: string }).message);
          return;
        }
      }
    }
  } catch (e) {
    if (signal.aborted) {
      handlers.onAborted?.();
      return;
    }
    handlers.onError(e instanceof Error ? e.message : "Ошибка чтения ответа.");
    return;
  }

  if (signal.aborted) {
    handlers.onAborted?.();
    return;
  }
  handlers.onError("Поток оборвался без результата.");
}
