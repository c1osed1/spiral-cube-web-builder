import type { SearchOptions, SearchProgress, SearchResult, SnapshotFile } from "../solver/types";

export type SolveStreamHandlers = {
  onProgress?: (p: SearchProgress) => void;
  onDone: (r: SearchResult) => void;
  onError: (message: string) => void;
  /** Fetch прерван (Стоп) — без сообщения об ошибке. */
  onAborted?: () => void;
};

/** Пустая строка → тот же origin, путь `/api/solve` (прокси Vite → Node). */
export function solverApiBase(): string {
  const raw = import.meta.env.VITE_SOLVER_API as string | undefined;
  return raw?.trim() ? raw.replace(/\/$/, "") : "";
}

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
  const url = `${base}/api/solve`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });

  if (!res.ok) {
    handlers.onError(`Сервер солвера: HTTP ${res.status} (${url}). Запущен ли \`npm run server\`?`);
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
        } else if (msg.type === "error" && msg.payload && typeof (msg.payload as { message?: string }).message === "string") {
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
