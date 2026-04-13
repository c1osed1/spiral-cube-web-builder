/**
 * Локальный API солвера (Node): HTTP + WebSocket на одном порту.
 *
 * WebSocket: `ws` с `server + path` (как в доке ws) — надёжнее ручного handleUpgrade.
 * Два пути: /api/ws/solve (через Vite proxy /api) и /ws/solve — если прокси режет префикс /api.
 */
import http from "node:http";
import cors from "cors";
import express from "express";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { searchOptionsFromHttpBody } from "../src/solver/httpSolveOptions";
import { runSolveJob } from "../src/solver/runSolveJob";

const PORT = Number(process.env.SOLVER_PORT ?? process.env.PORT ?? 8787);

function upgradeRequestPathname(rawUrl: string | undefined): string {
  const path = rawUrl && rawUrl.length > 0 ? rawUrl : "/";
  try {
    return new URL(path, "http://127.0.0.1").pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "cube-solver", wsPaths: ["/api/ws/solve", "/ws/solve"] });
});

app.post("/api/solve", async (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  let aborted = false;
  const markAborted = (): void => {
    aborted = true;
  };

  req.on("aborted", markAborted);
  req.socket?.once("error", markAborted);

  const writeLine = (obj: unknown) => {
    try {
      if (!res.writableEnded) {
        res.write(`${JSON.stringify(obj)}\n`);
      }
    } catch {
      markAborted();
    }
  };

  try {
    const body = req.body as {
      snapshot?: unknown;
      targetSnapshot?: unknown;
      options?: unknown;
    };
    if (!body?.snapshot) {
      writeLine({ type: "error", payload: { message: "Body must include snapshot." } });
      res.end();
      return;
    }

    const result = await runSolveJob({
      snapshot: body.snapshot,
      targetSnapshot: body.targetSnapshot,
      options: searchOptionsFromHttpBody(body.options),
      shouldAbort: () => aborted,
      onProgress: (payload) => writeLine({ type: "progress", payload })
    });
    writeLine({ type: "done", payload: result });
  } catch (e) {
    writeLine({
      type: "error",
      payload: { message: e instanceof Error ? e.message : "Solver failed." }
    });
  }
  res.end();
});

function wsSend(ws: WebSocket, obj: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function registerSolveSocket(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket) => {
    let aborted = false;
    let busy = false;

    ws.on("close", () => {
      aborted = true;
    });

    ws.on("message", (data: RawData, isBinary) => {
      if (isBinary) {
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        wsSend(ws, { type: "error", payload: { message: "Невалидный JSON в сообщении." } });
        return;
      }
      const msg = parsed as { type?: string };
      if (msg.type === "stop") {
        aborted = true;
        return;
      }
      if (msg.type !== "solve") {
        wsSend(ws, { type: "error", payload: { message: "Ожидается type: \"solve\" или \"stop\"." } });
        return;
      }
      if (busy) {
        wsSend(ws, { type: "error", payload: { message: "На этом соединении уже идёт поиск." } });
        return;
      }
      const body = parsed as {
        snapshot?: unknown;
        targetSnapshot?: unknown;
        options?: unknown;
      };
      if (!body.snapshot) {
        wsSend(ws, { type: "error", payload: { message: "Нет snapshot в сообщении solve." } });
        return;
      }

      busy = true;
      void (async () => {
        try {
          const result = await runSolveJob({
            snapshot: body.snapshot,
            targetSnapshot: body.targetSnapshot,
            options: searchOptionsFromHttpBody(body.options),
            shouldAbort: () => aborted || ws.readyState !== WebSocket.OPEN,
            onProgress: (payload) => wsSend(ws, { type: "progress", payload })
          });
          wsSend(ws, { type: "done", payload: result });
        } catch (e) {
          wsSend(ws, {
            type: "error",
            payload: { message: e instanceof Error ? e.message : "Solver failed." }
          });
        } finally {
          busy = false;
        }
      })();
    });
  });
}

const httpServer = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });
registerSolveSocket(wss);

httpServer.on("upgrade", (request, socket, head) => {
  const pathname = upgradeRequestPathname(request.url);
  if (pathname === "/api/ws/solve" || pathname === "/ws/solve") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`Solver API http://127.0.0.1:${PORT}`);
  console.log(`  HTTP  POST /api/solve  NDJSON`);
  console.log(`  WS    ws://127.0.0.1:${PORT}/api/ws/solve (в dev UI ходит сюда напрямую, без Vite WS-proxy)`);
});
