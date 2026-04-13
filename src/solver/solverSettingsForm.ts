import type { SearchOptions } from "./types";

/** Поля формы настроек солвера (без React). */
export type SolverSettingsForm = SearchOptions & { unlimitedTime: boolean };

/** Максимумы из клампов search + безлимит по времени (complete). */
export const DEFAULT_SOLVER_SETTINGS: SolverSettingsForm = {
  beamWidth: 50_000,
  maxDepth: 500,
  timeBudgetMs: 1_000_000_000,
  progressEveryExpansions: 50_000,
  strategy: "complete",
  searchUntilSolved: true,
  unlimitedTime: true,
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
