import type { BondInterpretation, SearchOptions } from "./types";

/**
 * Из тела POST /api/solve: только допустимые поля SearchOptions.
 * Всё остальное (в т.ч. shouldAbort из JSON) отбрасывается — abort только с сервера.
 */
export function searchOptionsFromHttpBody(raw: unknown): Partial<SearchOptions> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const out: Partial<SearchOptions> = {};

  for (const key of ["beamWidth", "maxDepth", "timeBudgetMs", "progressEveryExpansions"] as const) {
    const v = o[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = v;
    }
  }

  const strategy = o.strategy;
  if (strategy === "beam" || strategy === "complete") {
    out.strategy = strategy;
  }

  if (typeof o.searchUntilSolved === "boolean") {
    out.searchUntilSolved = o.searchUntilSolved;
  }
  if (typeof o.unlimitedTime === "boolean") {
    out.unlimitedTime = o.unlimitedTime;
  }

  const bond = o.bondMode;
  if (bond === "auto" || bond === "sticker" || bond === "cubie") {
    out.bondMode = bond as BondInterpretation;
  }

  return out;
}
