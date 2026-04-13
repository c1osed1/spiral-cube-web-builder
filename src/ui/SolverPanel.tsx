import { motion } from "motion/react";
import type { MoveName, SearchProgress, SearchResult } from "../solver/types";
import { ScanlineOverlay } from "./ScanlineOverlay";

interface SolverPanelProps {
  running: boolean;
  /** Постоянный WS к солверу открыт и готов принять solve. */
  solverSocketReady: boolean;
  /** Подсказка под кнопками, пока сокет не open или ошибка сети. */
  solverSocketHint: string;
  progress: SearchProgress | null;
  result: SearchResult | null;
  onStart: () => void;
  onStop: () => void;
  playbackStep: number;
  playbackMax: number;
  onStepChange: (step: number) => void;
  solutionMoves: MoveName[];
  isAnimating: boolean;
  playbackSpeedMs: number;
  onToggleAnimation: () => void;
  onResetPlayback: () => void;
  onPlaybackSpeedChange: (speed: number) => void;
  legalMovesNow: MoveName[];
}

export function SolverPanel(props: SolverPanelProps): JSX.Element {
  const {
    running,
    solverSocketReady,
    solverSocketHint,
    progress,
    result,
    onStart,
    onStop,
    playbackStep,
    playbackMax,
    onStepChange,
    solutionMoves,
    isAnimating,
    playbackSpeedMs,
    onToggleAnimation,
    onResetPlayback,
    onPlaybackSpeedChange,
    legalMovesNow
  } = props;

  const progressPct =
    progress && progress.nodesExpanded > 0
      ? Math.min(100, (Math.log10(progress.nodesExpanded + 1) / 6) * 100)
      : running
        ? 8
        : 0;

  const idaLimit = progress?.idaDepthLimit;
  const idaPrefix = progress?.maxPrefixDepthThisIda;
  const idaBarPct =
    idaLimit != null && idaLimit > 0 && idaPrefix != null ? Math.min(100, (idaPrefix / idaLimit) * 100) : 0;

  const prunes = progress?.frequentPrunes ?? [];

  return (
    <div className="solver-cyber-wrap relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-slate-950/90 via-surface-900/95 to-violet-950/40 p-1 shadow-[0_0_40px_-10px_rgba(139,92,246,0.45)]">
      <div className="absolute inset-0 rounded-[22px] bg-[conic-gradient(from_180deg_at_50%_50%,transparent_0deg,rgba(139,92,246,0.12)_120deg,transparent_240deg)] opacity-60 blur-xl" />
      <ScanlineOverlay />
      <div className="relative z-[2] rounded-[22px] bg-slate-950/75 p-5 backdrop-blur-md sm:p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <motion.h2
              className="text-xl font-bold tracking-tight text-white sm:text-2xl"
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <span className="bg-gradient-to-r from-violet-200 via-white to-sky-200 bg-clip-text text-transparent">
                Солвер
              </span>
              {running ? (
                <motion.span
                  className="ml-2 inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]"
                  animate={{ opacity: [1, 0.35, 1], scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              ) : null}
            </motion.h2>
            <p className="mt-1 max-w-xl text-xs text-slate-500">
              Лучшая глубина — длина лучшего по score префикса. Лимит IDA — текущий потолок итерации полного поиска.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap gap-2">
            <motion.button
              type="button"
              className="ui-btn"
              onClick={onStart}
              disabled={running || !solverSocketReady}
              whileTap={{ scale: running || !solverSocketReady ? 1 : 0.97 }}
              whileHover={{ scale: running || !solverSocketReady ? 1 : 1.02 }}
            >
              Старт
            </motion.button>
            <motion.button
              type="button"
              className="ui-btn-secondary border-rose-500/25 text-rose-100 hover:border-rose-400/35 hover:bg-rose-950/35"
              onClick={onStop}
              disabled={!running}
              whileTap={{ scale: !running ? 1 : 0.97 }}
            >
              Стоп
            </motion.button>
            </div>
            {solverSocketHint ? (
              <p className="max-w-xs text-right text-[11px] text-slate-500">{solverSocketHint}</p>
            ) : null}
          </div>
        </div>

        {running ? (
          <div className="mb-4 space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-sky-400"
                initial={{ width: "0%" }}
                animate={{ width: `${progressPct}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
              />
            </div>
            <p className="text-[11px] text-slate-500">Активность по числу развёрнутых узлов (логарифмическая шкала)</p>
          </div>
        ) : null}

        {idaLimit != null ? (
          <div className="mb-6 rounded-2xl border border-sky-500/15 bg-sky-950/20 p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-sky-100/90">Итерация IDA</span>
              <span className="font-mono text-xs text-sky-300/80">
                лимит {idaLimit} · DFS до {idaPrefix ?? 0} по префиксу
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800/90">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300"
                initial={false}
                animate={{ width: `${idaBarPct}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 22 }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              Если полоска упирается в 100%, поиск в этой итерации доходит до полного лимита глубины. Если раньше
              находится цель — переход к следующей итерации.
            </p>
          </div>
        ) : null}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Metric label="Время" value={progress ? `${Math.round(progress.elapsedMs)} мс` : "—"} />
          <Metric label="Узлов" value={progress?.nodesExpanded != null ? String(progress.nodesExpanded) : "—"} />
          <Metric label="Frontier" value={progress?.frontierSize != null ? String(progress.frontierSize) : "—"} />
          <Metric label="Лучший score" value={progress?.bestScore != null ? String(progress.bestScore) : "—"} />
          <Metric label="Лучшая глубина" value={progress?.bestDepth != null ? String(progress.bestDepth) : "—"} />
          <Metric
            label="Транспозиции"
            value={progress?.transposePrunes != null ? String(progress.transposePrunes) : "—"}
            hint="длинный заход в уже известное состояние"
          />
          <Metric
            label="Циклы по пути"
            value={progress?.pathCyclePrunes != null ? String(progress.pathCyclePrunes) : "—"}
            hint="повтор на текущей ветке"
          />
          <Metric
            label="Beam seen"
            value={progress?.beamSeenPrunes != null ? String(progress.beamSeenPrunes) : "—"}
            hint="только режим луча"
          />
        </div>

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Лучший префикс (score)</h3>
        <div className="ui-log mb-6 border-violet-500/10">{progress?.bestPath.join(" ") || "(пусто)"}</div>

        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <span className="inline-block h-px w-6 bg-gradient-to-r from-violet-500 to-transparent" />
          Частые отсечения (топ по числу)
        </h3>
        {prunes.length === 0 ? (
          <p className="mb-6 rounded-xl border border-white/[0.06] bg-slate-900/40 px-3 py-3 text-sm text-slate-500">
            Пока нет данных: запустите поиск или дождитесь тика прогресса. Здесь — состояния, к которым чаще всего
            приходили «лишним» путём и их отрезала таблица транспозиций / seen.
          </p>
        ) : (
          <ul className="mb-6 grid gap-2 sm:grid-cols-2">
            {prunes.map((entry, i) => (
              <motion.li
                key={entry.stateId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-gradient-to-r from-slate-900/80 to-violet-950/30 px-3 py-2 font-mono text-xs text-slate-200"
              >
                <span className="text-violet-300/90">#{entry.stateId}</span>
                <span className="text-slate-400">
                  ×{entry.prunes}{" "}
                  <span className="text-slate-500">min {entry.minKnownDepth}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        )}

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Результат</h3>
        <div className="ui-log mb-2 border-emerald-500/10">
          {result
            ? `${result.solved ? "Собрано" : "Не финал"} (${reasonLabel(result.reason)}), ${result.moves.length} ходов, ${result.nodesExpanded} узлов`
            : "(результата пока нет)"}
        </div>
        {result && !result.solved ? (
          <p className="mb-4 rounded-xl border border-amber-500/25 bg-amber-950/30 px-3 py-2 text-sm text-amber-100/90">
            Не финальная сборка — ниже лучший кандидат на момент остановки.
          </p>
        ) : null}
        {result?.reason === "frontier_exhausted" && result.nodesExpanded === 0 ? (
          <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/35 px-3 py-2 text-sm text-rose-100">
            Нет допустимых ходов в режиме бандажей. Проверьте формат индексов <code className="font-mono">bonds</code>.
          </p>
        ) : null}

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {result?.solved ? "Проигрывание решения" : "Проигрывание кандидата"}
        </h3>
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className="ui-btn-secondary" onClick={onToggleAnimation} disabled={playbackMax === 0}>
            {isAnimating ? "Пауза" : "Анимация"}
          </button>
          <button type="button" className="ui-btn-secondary" onClick={onResetPlayback} disabled={playbackMax === 0}>
            Сброс
          </button>
        </div>
        <input
          type="range"
          className="ui-range mb-2"
          min={0}
          max={Math.max(0, playbackMax)}
          value={playbackStep}
          onChange={(event) => onStepChange(Number(event.target.value))}
          disabled={playbackMax === 0}
        />
        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-slate-400">
          <span>
            Шаг {playbackStep} / {playbackMax}
          </span>
          <label className="flex items-center gap-2">
            <span className="text-slate-500">Скорость</span>
            <input
              type="range"
              className="ui-range w-40"
              min={100}
              max={1200}
              step={50}
              value={playbackSpeedMs}
              onChange={(event) => onPlaybackSpeedChange(Number(event.target.value))}
            />
            <span className="font-mono text-slate-300">{playbackSpeedMs} мс</span>
          </label>
        </div>
        <div className="ui-log mb-6">{solutionMoves.join(" ") || "(ходов нет)"}</div>

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Допустимые ходы</h3>
        <div className="ui-log text-slate-300">{legalMovesNow.length > 0 ? legalMovesNow.join(" ") : "(нет)"}</div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2" title={hint}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-mono text-sm text-violet-100/95">{value}</p>
    </div>
  );
}

function reasonLabel(reason: SearchResult["reason"]): string {
  switch (reason) {
    case "solved":
      return "собрано";
    case "timeout":
      return "таймаут";
    case "depth_limit":
      return "лимит глубины";
    case "frontier_exhausted":
      return "фронтир исчерпан";
    case "aborted":
      return "остановлено";
    default:
      return reason;
  }
}
