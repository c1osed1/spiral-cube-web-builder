import { describe, expect, test } from "vitest";
import snapshot from "../../spyral4-assembly.json";
import { cubieAffectedCountForTest, isMoveBandageLegal, legalMoves, resolveBondModel } from "./bandage";
import { applyMove, inverseMove } from "./moves";
import { solveState } from "./search";
import { isSolved, parseSnapshotFile, stateFromSnapshot } from "./state";
import type { MoveName } from "./types";

describe("snapshot parser", () => {
  test("parses provided snapshot and builds state", () => {
    const parsed = parseSnapshotFile(snapshot);
    const state = stateFromSnapshot(parsed);
    expect(state.stickers).toHaveLength(96);
    expect(parsed.bonds.length).toBeGreaterThan(0);
  });
});

describe("move invariants", () => {
  test("inverseMove pairs quarter turns", () => {
    expect(inverseMove("R")).toBe("R'");
    expect(inverseMove("R'")).toBe("R");
    expect(inverseMove("R2")).toBe("R2");
    expect(inverseMove("Uw")).toBe("Uw'");
  });

  test("face move and inverse restore same state", () => {
    const state = stateFromSnapshot(parseSnapshotFile(snapshot));
    const moved = applyMove(state, "R");
    const restored = applyMove(moved, "R'");
    expect(restored.stickers.join("")).toBe(state.stickers.join(""));
    expect(restored.bonds).toEqual(state.bonds);
  });

  test("bandage filter rejects at least one move", () => {
    const state = stateFromSnapshot(parseSnapshotFile(snapshot));
    const baseMoves: MoveName[] = ["U", "D", "L", "R", "F", "B"];
    const legalCount = baseMoves.filter((move) => isMoveBandageLegal(state, move)).length;
    expect(legalCount).toBeLessThan(6);
  });

  test("strict legal move computation is deterministic", () => {
    const state = stateFromSnapshot(parseSnapshotFile(snapshot));
    const strictA = legalMoves(state);
    const strictB = legalMoves(state);
    expect(strictA).toEqual(strictB);
  });

  test("wide moves are considered by legal move generator", () => {
    const state = stateFromSnapshot(parseSnapshotFile(snapshot));
    const strict = legalMoves(state);
    expect(strict.some((move) => move.includes("w") || /^[uldrfb]/.test(move))).toBe(true);
  });

  test("cubie bond model: Rw rotates more mini-cubies than R", () => {
    const state = stateFromSnapshot(parseSnapshotFile(snapshot));
    expect(resolveBondModel(state, "cubie").mode).toBe("cubie");
    expect(cubieAffectedCountForTest("R")).toBe(16);
    expect(cubieAffectedCountForTest("Rw")).toBe(32);
    expect(cubieAffectedCountForTest("r")).toBe(16);
  });
});

describe("search smoke", () => {
  test("returns a bounded search result", async () => {
    const state = stateFromSnapshot(parseSnapshotFile(snapshot));
    const result = await solveState(state, null, { beamWidth: 50, maxDepth: 4, timeBudgetMs: 2000 });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.nodesExpanded).toBeGreaterThanOrEqual(0);
    if (result.solved) {
      let replay = state;
      for (const move of result.moves) {
        replay = applyMove(replay, move);
      }
      expect(isSolved(replay)).toBe(true);
    }
  });

  test("target-state mode solves immediately when already at target", async () => {
    const state = stateFromSnapshot(parseSnapshotFile(snapshot));
    const result = await solveState(state, state, { timeBudgetMs: 500 });
    expect(result.solved).toBe(true);
    expect(result.moves).toHaveLength(0);
  });
});
