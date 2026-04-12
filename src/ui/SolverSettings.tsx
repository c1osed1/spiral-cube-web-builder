import type { BondInterpretation, SearchOptions } from "../solver/types";

export interface SolverSettingsForm extends SearchOptions {
  unlimitedTime: boolean;
}

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

interface SolverSettingsProps {
  value: SolverSettingsForm;
  onChange: (next: SolverSettingsForm) => void;
  disabled?: boolean;
}

export function SolverSettings({ value, onChange, disabled }: SolverSettingsProps): JSX.Element {
  function patch<K extends keyof SolverSettingsForm>(key: K, v: SolverSettingsForm[K]): void {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="panel solver-settings">
      <h2>Настройки поиска</h2>
      <p className="hint">
        Полный поиск (complete) может идти очень долго. «Безлимит по времени» — только для полного режима: браузер не
        остановит по таймеру (остановите вручную «Стоп»).
      </p>

      <div className="settings-grid">
        <label>
          Стратегия
          <select
            value={value.strategy ?? "complete"}
            disabled={disabled}
            onChange={(e) => patch("strategy", e.target.value as "beam" | "complete")}
          >
            <option value="complete">Полный (iterative deepening)</option>
            <option value="beam">Луч (beam, быстрее, не гарантирует решение)</option>
          </select>
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={value.unlimitedTime}
            disabled={disabled || value.strategy !== "complete"}
            onChange={(e) => patch("unlimitedTime", e.target.checked)}
          />
          Безлимит по времени (только complete)
        </label>

        <label>
          Лимит времени, мин
          <input
            type="number"
            min={1}
            max={10080}
            disabled={disabled || value.unlimitedTime}
            value={Math.max(1, Math.round(value.timeBudgetMs / 60_000))}
            onChange={(e) => patch("timeBudgetMs", Math.max(1, Number(e.target.value)) * 60_000)}
          />
        </label>

        <label>
          Макс. глубина (beam / complete без «до решения»)
          <input
            type="number"
            min={1}
            max={500}
            disabled={disabled}
            value={value.maxDepth}
            onChange={(e) => patch("maxDepth", Math.max(1, Math.min(500, Number(e.target.value))))}
          />
        </label>

        <label>
          Ширина луча (beam)
          <input
            type="number"
            min={50}
            max={50_000}
            step={50}
            disabled={disabled || value.strategy !== "beam"}
            value={value.beamWidth}
            onChange={(e) => patch("beamWidth", Math.max(50, Number(e.target.value)))}
          />
        </label>

        <label>
          Прогресс каждые N узлов
          <input
            type="number"
            min={50}
            max={50_000}
            step={50}
            disabled={disabled}
            value={value.progressEveryExpansions}
            onChange={(e) => patch("progressEveryExpansions", Math.max(50, Number(e.target.value)))}
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={value.searchUntilSolved ?? false}
            disabled={disabled || value.strategy !== "complete"}
            onChange={(e) => patch("searchUntilSolved", e.target.checked)}
          />
          Полный режим: углублять, пока не найдено решение (или таймер)
        </label>

        <label>
          Интерпретация bonds
          <select
            value={value.bondMode ?? "auto"}
            disabled={disabled}
            onChange={(e) => patch("bondMode", e.target.value as BondInterpretation)}
          >
            <option value="auto">Авто (max ≤ 64 → id кубиков 0..63, иначе стикеры 0..95)</option>
            <option value="sticker">Всегда пары стикеров (как в spyral4 JSON)</option>
            <option value="cubie">Всегда id мини-кубиков 0..63 (1..64 если нет нуля)</option>
          </select>
        </label>
      </div>

      <div className="actions">
        <button type="button" disabled={disabled} onClick={() => onChange({ ...DEFAULT_SOLVER_SETTINGS })}>
          Сбросить настройки по умолчанию
        </button>
      </div>
    </div>
  );
}

export function toWorkerSearchOptions(form: SolverSettingsForm): Partial<SearchOptions> {
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
