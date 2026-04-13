import type { SearchOptions } from "./types";

/** Поля формы настроек солвера (без React). */
export type SolverSettingsForm = SearchOptions & { unlimitedTime: boolean };

export const DEFAULT_SOLVER_SETTINGS: SolverSettingsForm = {
  beamWidth: 2600,
  maxDepth: 220,
  timeBudgetMs: 420_000,
  progressEveryExpansions: 2000,
  strategy: "complete",
  searchUntilSolved: true,
  unlimitedTime: false,
  bondMode: "auto"
};

export function toSearchOptions(form: SolverSettingsForm): Partial<SearchOptions> {
  const unlimited = form.unlimitedTime || form.timeBudgetMs <= 0;
  return {
    beamWidth: form.beamWidth,
    maxDepth: form.maxDepth,
    timeBudgetMs: unlimited ? 0 : form.timeBudgetMs,
    progressEveryExpansions: form.progressEveryExpansions,
    strategy: form.strategy,
    searchUntilSolved: form.searchUntilSolved,
    unlimitedTime: unlimited,
    bondMode: form.bondMode ?? "auto"
  };
}
