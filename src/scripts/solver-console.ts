/**
 * Запуск поиска из консоли с подробным логом (снимок JSON → solveState).
 *
 * Usage:
 *   npm run solve:console
 *   npm run solve:console -- spyral4-assembly.json
 *   npm run solve:console -- ./spyral4-assembly.json --beam --ms=30000
 *   npm run solve:console -- data.json --complete --until-solved --unlimited-time
 *
 * Flags:
 *   --beam | --complete     стратегия (по умолчанию complete)
 *   --ms=N                  лимит времени, мс (0 = без лимита при complete + until-solved — осторожно)
 *   --max-depth=N
 *   --beam-width=N
 *   --until-solved          complete: не останавливаться по maxDepth (IDA до решения)
 *   --unlimited-time        не обрывать по timeBudgetMs
 *   --progress-every=N      период прогресса в expansions
 *   --bond=auto|sticker|cubie
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";

import { legalMoves, resolveBondModel } from "../solver/bandage";
import { stateAtStep } from "../solver/playback";
import { solveState } from "../solver/search";
import { isSolved, parseSnapshotFile, scoreState, stateFromSnapshot } from "../solver/state";
import type { BondInterpretation, SearchProgress, SearchOptions } from "../solver/types";

function usage(): void {
  console.log(`Usage: npm run solve:console -- [snapshot.json] [flags...]
Flags: --beam | --complete  --ms=N  --max-depth=N  --beam-width=N  --until-solved  --unlimited-time  --progress-every=N  --bond=auto|sticker|cubie`);
}

function parseArgs(argv: string[]): {
  file: string;
  strategy: "beam" | "complete";
  timeBudgetMs: number;
  maxDepth: number;
  beamWidth: number;
  searchUntilSolved: boolean;
  unlimitedTime: boolean;
  progressEveryExpansions: number;
  bondMode: BondInterpretation;
} {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();

  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq === -1) {
        flags.set(a.slice(2), true);
      } else {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
      }
    } else {
      positional.push(a);
    }
  }

  const file =
    positional[0] !== undefined && positional[0].length > 0
      ? resolve(cwd(), positional[0])
      : resolve(cwd(), "spyral4-assembly.json");

  const strategy: "beam" | "complete" = flags.has("beam") ? "beam" : "complete";

  const msRaw = flags.get("ms");
  const timeBudgetMs =
    typeof msRaw === "string" && msRaw !== "" ? Math.max(0, Number(msRaw)) : strategy === "beam" ? 45_000 : 120_000;

  const maxDepthRaw = flags.get("max-depth");
  const maxDepth =
    typeof maxDepthRaw === "string" && maxDepthRaw !== ""
      ? Math.max(1, Number(maxDepthRaw))
      : strategy === "beam"
        ? 80
        : 40;

  const beamWidthRaw = flags.get("beam-width");
  const beamWidth =
    typeof beamWidthRaw === "string" && beamWidthRaw !== "" ? Math.max(2, Number(beamWidthRaw)) : 2200;

  const searchUntilSolved = flags.has("until-solved");
  const unlimitedTime = flags.has("unlimited-time");

  const peRaw = flags.get("progress-every");
  const progressEveryExpansions =
    typeof peRaw === "string" && peRaw !== "" ? Math.max(100, Number(peRaw)) : 2500;

  const bondRaw = flags.get("bond");
  let bondMode: BondInterpretation = "auto";
  if (bondRaw === "sticker" || bondRaw === "cubie") {
    bondMode = bondRaw;
  }

  return {
    file,
    strategy,
    timeBudgetMs,
    maxDepth,
    beamWidth,
    searchUntilSolved,
    unlimitedTime,
    progressEveryExpansions,
    bondMode
  };
}

function fmtProgress(p: SearchProgress, strategy: "beam" | "complete"): string {
  const parts = [
    `t=${Math.round(p.elapsedMs)}ms`,
    `exp=${p.nodesExpanded}`,
    `bestScore=${p.bestScore}`,
    `bestDepth=${p.bestDepth}`,
    strategy === "complete" ? `IDA≤${p.idaDepthLimit ?? "?"}` : `frontier=${p.frontierSize}`
  ];
  if (p.maxPrefixDepthThisIda !== undefined) {
    parts.push(`prefixMax=${p.maxPrefixDepthThisIda}`);
  }
  if (p.transposePrunes !== undefined) {
    parts.push(`transposePrune=${p.transposePrunes}`);
  }
  if (p.pathCyclePrunes !== undefined) {
    parts.push(`pathCycle=${p.pathCyclePrunes}`);
  }
  if (p.beamSeenPrunes !== undefined) {
    parts.push(`beamSeen=${p.beamSeenPrunes}`);
  }
  return parts.join("  ");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const raw = readFileSync(args.file, "utf8");
  const snapshot = parseSnapshotFile(JSON.parse(raw) as unknown);
  const state = stateFromSnapshot(snapshot);

  const model = resolveBondModel(state, args.bondMode);
  const rootMoves = legalMoves(state, undefined, args.bondMode);

  console.log("=== solver-console ===");
  console.log("file:", args.file);
  console.log("bonds:", state.bonds.length, "pairs");
  console.log("bond model:", model.mode, args.bondMode === "auto" ? "(auto)" : `(${args.bondMode})`);
  console.log("isSolved:", isSolved(state), " score:", scoreState(state));
  console.log("legal moves from root:", rootMoves.length, rootMoves.length <= 40 ? rootMoves.join(" ") : "(many)");

  const options: Partial<SearchOptions> = {
    strategy: args.strategy,
    beamWidth: args.beamWidth,
    maxDepth: args.maxDepth,
    timeBudgetMs: args.timeBudgetMs,
    progressEveryExpansions: args.progressEveryExpansions,
    searchUntilSolved: args.searchUntilSolved,
    unlimitedTime: args.unlimitedTime,
    bondMode: args.bondMode
  };

  if (args.unlimitedTime) {
    options.timeBudgetMs = 0;
  }

  console.log("search options:", JSON.stringify(options));
  console.log("--- progress ---");

  const result = await solveState(state, null, options, (p) => {
    console.log(fmtProgress(p, args.strategy));
    if (p.frequentPrunes && p.frequentPrunes.length > 0) {
      const top = p.frequentPrunes
        .slice(0, 5)
        .map((e) => `${e.stateId}×${e.prunes}(≤d${e.minKnownDepth})`)
        .join(" | ");
      console.log("  frequentPrunes:", top);
    }
  });

  console.log("--- result ---");
  console.log(JSON.stringify(result, null, 2));
  if (result.moves.length > 0) {
    console.log("moves:", result.moves.join(" "));
  }

  if (result.solved && result.moves.length > 0) {
    const end = stateAtStep(state, result.moves, result.moves.length);
    const ok = isSolved(end);
    console.log("replay verify isSolved:", ok);
    if (!ok) {
      console.error("LOGIC ERROR: path does not reach solved state (check moves / isSolved / applyMove).");
      process.exitCode = 2;
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
