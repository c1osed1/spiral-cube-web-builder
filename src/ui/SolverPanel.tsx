import type { MoveName, SearchProgress, SearchResult } from "../solver/types";

interface SolverPanelProps {
  running: boolean;
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

  return (
    <div className="panel">
      <h2>Прогресс солвера</h2>
      <div className="actions">
        <button onClick={onStart} disabled={running}>
          Старт
        </button>
        <button onClick={onStop} disabled={!running}>
          Стоп
        </button>
      </div>

      <div className="metrics">
        <p>Время: {progress ? `${Math.round(progress.elapsedMs)} мс` : "-"}</p>
        <p>Просмотрено узлов: {progress?.nodesExpanded ?? "-"}</p>
        <p>Frontier: {progress?.frontierSize ?? "-"}</p>
        <p>Лучший score: {progress?.bestScore ?? "-"}</p>
        <p>Лучшая глубина: {progress?.bestDepth ?? "-"}</p>
      </div>

      <h3>Лучший префикс пути</h3>
      <div className="log">{progress?.bestPath.join(" ") || "(пусто)"}</div>

      <h3>Результат</h3>
      <div className="log">
        {result
          ? `${result.solved ? "Собрано" : "Остановлено"} (${reasonLabel(result.reason)}), ${result.moves.length} ходов, ${result.nodesExpanded} узлов`
          : "(результата пока нет)"}
      </div>
      {result && !result.solved ? (
        <p className="error">
          Это не финальная сборка. Ниже показан лучший найденный кандидат на момент остановки поиска.
        </p>
      ) : null}
      {result?.reason === "frontier_exhausted" && result.nodesExpanded === 0 ? (
        <p className="error">
          Для этого снимка нет допустимых ходов в строгом режиме бандажей. Возможно, индексы `bonds` имеют другой формат.
        </p>
      ) : null}

      <h3>{result?.solved ? "Проигрывание решения" : "Проигрывание лучшего кандидата"}</h3>
      <div className="actions">
        <button onClick={onToggleAnimation} disabled={playbackMax === 0}>
          {isAnimating ? "Пауза анимации" : "Запустить анимацию"}
        </button>
        <button onClick={onResetPlayback} disabled={playbackMax === 0}>
          Сброс
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={playbackMax}
        value={playbackStep}
        onChange={(event) => onStepChange(Number(event.target.value))}
      />
      <p>
        Скорость:{" "}
        <input
          type="range"
          min={100}
          max={1200}
          step={50}
          value={playbackSpeedMs}
          onChange={(event) => onPlaybackSpeedChange(Number(event.target.value))}
        />{" "}
        {playbackSpeedMs} мс/шаг
      </p>
      <p>
        Шаг {playbackStep} / {playbackMax}
      </p>
      <div className="log">
        {solutionMoves.join(" ") || "(ходов нет)"}
      </div>

      <h3>Допустимые ходы сейчас</h3>
      <div className="log">{legalMovesNow.length > 0 ? legalMovesNow.join(" ") : "(нет допустимых ходов)"}</div>
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
