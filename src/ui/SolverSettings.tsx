import type { BondInterpretation } from "../solver/types";
import {
  DEFAULT_SOLVER_SETTINGS,
  toSearchOptions,
  type SolverSettingsForm
} from "../solver/solverSettingsForm";

export type { SolverSettingsForm };
export { DEFAULT_SOLVER_SETTINGS };
/** @deprecated используйте toSearchOptions из solver/solverSettingsForm */
export const toWorkerSearchOptions = toSearchOptions;

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
    <div className="solver-settings">
      <h2 className="mb-1 text-lg font-semibold text-white">Настройки поиска</h2>
      <p className="hint">
        Поиск выполняется на локальном Node-сервере (<code className="text-slate-400">npm run server</code> или{" "}
        <code className="text-slate-400">npm run dev:full</code>), не во вкладке. Полный режим может идти долго;
        «Безлимит по времени» — остановите вручную «Стоп».
      </p>

      <div className="settings-grid">
        <label>
          Стратегия
          <select
            className="mt-0.5"
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

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="ui-btn-secondary" disabled={disabled} onClick={() => onChange({ ...DEFAULT_SOLVER_SETTINGS })}>
          Сбросить по умолчанию
        </button>
      </div>
    </div>
  );
}

