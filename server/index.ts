/**
 * Локальный API солвера (Node): полная нагрузка на процессор ПК, не на вкладку браузера.
 *
 *   npm run server   → http://127.0.0.1:8787
 *   npm run dev:full → сервер + Vite (прокси /api → сервер)
 */
import cors from "cors";
import express from "express";
import { runSolveJob } from "../src/solver/runSolveJob";

const PORT = Number(process.env.SOLVER_PORT ?? process.env.PORT ?? 8787);
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "cube-solver" });
});

app.post("/api/solve", async (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });

  const writeLine = (obj: unknown) => {
    if (!res.writableEnded) {
      res.write(`${JSON.stringify(obj)}\n`);
    }
  };

  try {
    const body = req.body as {
      snapshot?: unknown;
      targetSnapshot?: unknown;
      options?: Record<string, unknown>;
    };
    if (!body?.snapshot) {
      writeLine({ type: "error", payload: { message: "Body must include snapshot." } });
      res.end();
      return;
    }

    const result = await runSolveJob({
      snapshot: body.snapshot,
      targetSnapshot: body.targetSnapshot,
      options: body.options ?? {},
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

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Solver API http://127.0.0.1:${PORT}  (POST /api/solve, GET /api/health)`);
});
