import { useEffect, useMemo, useRef, useState } from "react";
import snapshotData from "../spyral4-assembly.json";
import doneData from "../done.json";
import { stateAtStep } from "./solver/playback";
import { getStickerPosition, parseSnapshotFile, stateFromSnapshot } from "./solver/state";
import { legalMoves } from "./solver/bandage";
import {
  FACE_ORDER,
  FACE_SIZE,
  type FaceName,
  type CubeState,
  type MoveName,
  type SearchProgress,
  type SearchResult,
  type SnapshotFile,
  type StickerColor
} from "./solver/types";
import { CubeView } from "./ui/CubeView";
import { SolverPanel } from "./ui/SolverPanel";
import { Cube3DView } from "./ui/Cube3DView";
import { DEFAULT_SOLVER_SETTINGS, SolverSettings, toWorkerSearchOptions, type SolverSettingsForm } from "./ui/SolverSettings";
import type { WorkerEvent, WorkerRequest } from "./ui/types";

const defaultSnapshot = parseSnapshotFile(snapshotData);
const defaultTargetSnapshot = parseSnapshotFile(doneData);
const PALETTE: StickerColor[] = ["W", "Y", "R", "O", "G", "B"];
const CONFIGS_STORAGE_KEY = "cubev1_saved_configs";
const SOLVED_FACE_COLORS: Record<FaceName, StickerColor> = {
  U: "W",
  D: "Y",
  F: "G",
  B: "B",
  R: "R",
  L: "O"
};

interface SavedCubeConfig {
  id: string;
  name: string;
  snapshot: SnapshotFile;
  updatedAt: string;
}

function App(): JSX.Element {
  const workerRef = useRef<Worker | null>(null);
  const [snapshotText, setSnapshotText] = useState<string>(JSON.stringify(defaultSnapshot, null, 2));
  const [snapshot, setSnapshot] = useState<SnapshotFile>(defaultSnapshot);
  const [editorSnapshot, setEditorSnapshot] = useState<SnapshotFile>(defaultSnapshot);
  const [targetSnapshot, setTargetSnapshot] = useState<SnapshotFile>(defaultTargetSnapshot);
  const [initialState, setInitialState] = useState<CubeState>(stateFromSnapshot(defaultSnapshot));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string>("");
  const [playbackStep, setPlaybackStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [playbackSpeedMs, setPlaybackSpeedMs] = useState(350);
  const [selectedSticker, setSelectedSticker] = useState<number | null>(null);
  const [bondDragStartIndex, setBondDragStartIndex] = useState<number | null>(null);
  const [paintMode, setPaintMode] = useState(false);
  const [activePaintColor, setActivePaintColor] = useState<StickerColor>("W");
  const [savedConfigs, setSavedConfigs] = useState<SavedCubeConfig[]>(() => loadSavedConfigs());
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [configNameDraft, setConfigNameDraft] = useState("Новый конфиг");
  const [solverSettings, setSolverSettings] = useState<SolverSettingsForm>(() => ({ ...DEFAULT_SOLVER_SETTINGS }));

  useEffect(() => {
    const worker = new Worker(new URL("./worker/solver.worker.ts", import.meta.url), {
      type: "module"
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const message = event.data;
      if (message.type === "progress") {
        setProgress(message.payload);
      } else if (message.type === "done") {
        setRunning(false);
        setResult(message.payload);
        setPlaybackStep(0);
        setIsAnimating(message.payload.moves.length > 0);
        setProgress((current) => current ?? null);
      } else if (message.type === "error") {
        setRunning(false);
        setIsAnimating(false);
        setError(message.payload.message);
      } else if (message.type === "stopped") {
        setRunning(false);
        setIsAnimating(false);
      }
    };

    return () => {
      worker.terminate();
    };
  }, []);

  const solutionMoves = useMemo<MoveName[]>(() => result?.moves ?? [], [result]);
  const editorState = useMemo(() => stateFromSnapshot(editorSnapshot), [editorSnapshot]);
  const playbackState = useMemo(
    () => stateAtStep(initialState, solutionMoves, playbackStep),
    [initialState, solutionMoves, playbackStep]
  );
  const visibleState = isAnimating || playbackStep > 0 ? playbackState : editorState;
  const visibleLegalMoves = useMemo(
    () => legalMoves(visibleState, undefined, solverSettings.bondMode ?? "auto"),
    [visibleState, solverSettings.bondMode]
  );

  useEffect(() => {
    persistSavedConfigs(savedConfigs);
  }, [savedConfigs]);

  useEffect(() => {
    const resetBondDrag = () => setBondDragStartIndex(null);
    window.addEventListener("mouseup", resetBondDrag);
    return () => {
      window.removeEventListener("mouseup", resetBondDrag);
    };
  }, []);

  useEffect(() => {
    if (!isAnimating || solutionMoves.length === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setPlaybackStep((current) => {
        if (current >= solutionMoves.length) {
          setIsAnimating(false);
          return current;
        }
        return current + 1;
      });
    }, playbackSpeedMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [isAnimating, playbackSpeedMs, solutionMoves.length]);

  function applySnapshotFromText(): void {
    try {
      const parsed = parseSnapshotFile(JSON.parse(snapshotText));
      const parsedState = stateFromSnapshot(parsed);
      setSnapshot(parsed);
      setEditorSnapshot(parsed);
      setInitialState(parsedState);
      setProgress(null);
      setResult(null);
      setPlaybackStep(0);
      setIsAnimating(false);
      setError("");
      setSelectedSticker(null);
      setBondDragStartIndex(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Невалидный JSON снимка.");
    }
  }

  function startSolver(): void {
    if (!workerRef.current) {
      return;
    }
    const payload: WorkerRequest = {
      type: "solve",
      payload: {
        snapshot,
        targetSnapshot,
        options: toWorkerSearchOptions(solverSettings)
      }
    };

    setError("");
    setProgress(null);
    setResult(null);
    setPlaybackStep(0);
    setIsAnimating(false);
    setRunning(true);
    workerRef.current.postMessage(payload);
  }

  function stopSolver(): void {
    if (!workerRef.current) {
      return;
    }
    workerRef.current.postMessage({ type: "stop" } satisfies WorkerRequest);
    setRunning(false);
    setIsAnimating(false);
  }

  function toggleAnimation(): void {
    if (solutionMoves.length === 0) {
      return;
    }
    if (playbackStep >= solutionMoves.length) {
      setPlaybackStep(0);
    }
    setIsAnimating((value) => !value);
  }

  function resetPlayback(): void {
    setPlaybackStep(0);
    setIsAnimating(false);
  }

  function onManualStepChange(step: number): void {
    setPlaybackStep(step);
    setIsAnimating(false);
  }

  function selectSticker(index: number): void {
    setSelectedSticker(index);
  }

  function paintSticker(index: number, color: StickerColor): void {
    const pos = getStickerPosition(index);
    setEditorSnapshot((current) => {
      const next: SnapshotFile = {
        ...current,
        net: cloneNet(current.net)
      };
      next.net[pos.face][pos.row][pos.col] = color;
      return next;
    });
  }

  function colorSelectedSticker(color: StickerColor): void {
    if (selectedSticker === null) {
      return;
    }
    paintSticker(selectedSticker, color);
  }

  function toggleBondBetween(a: number, b: number): void {
    if (a === b) {
      return;
    }
    const pair = a < b ? [a, b] : [b, a];
    setEditorSnapshot((current) => {
      const exists = current.bonds.some(([x, y]) => (x === pair[0] && y === pair[1]) || (x === pair[1] && y === pair[0]));
      const bonds = exists
        ? current.bonds.filter(([x, y]) => !((x === pair[0] && y === pair[1]) || (x === pair[1] && y === pair[0])))
        : [...current.bonds, [pair[0], pair[1]] as [number, number]];
      return { ...current, bonds };
    });
  }

  function onBondDragStart(index: number): void {
    if (paintMode) {
      return;
    }
    setSelectedSticker(index);
    setBondDragStartIndex(index);
  }

  function onBondDragEnd(index: number): void {
    if (paintMode) {
      return;
    }
    if (bondDragStartIndex !== null) {
      toggleBondBetween(bondDragStartIndex, index);
    }
    setBondDragStartIndex(null);
  }

  function onStickerInteract(index: number): void {
    if (paintMode) {
      paintSticker(index, activePaintColor);
      return;
    }
    selectSticker(index);
  }

  function selectPaintColor(color: StickerColor): void {
    setActivePaintColor(color);
    if (!paintMode) {
      colorSelectedSticker(color);
    }
  }

  function paintAllFacesSolvedColors(): void {
    setEditorSnapshot((current) => {
      const next: SnapshotFile = {
        ...current,
        net: cloneNet(current.net)
      };
      for (const face of FACE_ORDER) {
        const color = SOLVED_FACE_COLORS[face];
        next.net[face] = Array.from({ length: FACE_SIZE }, () =>
          Array.from({ length: FACE_SIZE }, () => color)
        );
      }
      return next;
    });
    setSelectedSticker(null);
    setBondDragStartIndex(null);
  }

  function removeBond(index: number): void {
    setEditorSnapshot((current) => ({
      ...current,
      bonds: current.bonds.filter((_, idx) => idx !== index)
    }));
  }

  function applyEditorToJson(): void {
    try {
      const normalized: SnapshotFile = {
        ...editorSnapshot,
        savedAt: new Date().toISOString()
      };
      const parsed = parseSnapshotFile(normalized);
      const parsedState = stateFromSnapshot(parsed);
      const text = JSON.stringify(parsed, null, 2);
      setSnapshot(parsed);
      setSnapshotText(text);
      setInitialState(parsedState);
      setProgress(null);
      setResult(null);
      setPlaybackStep(0);
      setIsAnimating(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось применить состояние из редактора.");
    }
  }

  function resetEditorFromAppliedJson(): void {
    setEditorSnapshot(snapshot);
    setSelectedSticker(null);
    setBondDragStartIndex(null);
  }

  function createEmptyConfig(): void {
    const name = configNameDraft.trim() || `Конфиг ${savedConfigs.length + 1}`;
    const created: SavedCubeConfig = {
      id: `cfg-${Date.now()}`,
      name,
      snapshot: editorSnapshot,
      updatedAt: new Date().toISOString()
    };
    setSavedConfigs((prev) => [created, ...prev]);
    setSelectedConfigId(created.id);
  }

  function updateSelectedConfig(): void {
    if (!selectedConfigId) {
      return;
    }
    setSavedConfigs((prev) =>
      prev.map((cfg) =>
        cfg.id === selectedConfigId
          ? {
              ...cfg,
              name: configNameDraft.trim() || cfg.name,
              snapshot: editorSnapshot,
              updatedAt: new Date().toISOString()
            }
          : cfg
      )
    );
  }

  function loadSelectedConfig(): void {
    if (!selectedConfigId) {
      return;
    }
    const selected = savedConfigs.find((cfg) => cfg.id === selectedConfigId);
    if (!selected) {
      return;
    }
    setEditorSnapshot(selected.snapshot);
    setConfigNameDraft(selected.name);
    setSelectedSticker(null);
    setBondDragStartIndex(null);
  }

  function deleteSelectedConfig(): void {
    if (!selectedConfigId) {
      return;
    }
    setSavedConfigs((prev) => prev.filter((cfg) => cfg.id !== selectedConfigId));
    setSelectedConfigId(null);
  }

  function selectConfig(configId: string): void {
    setSelectedConfigId(configId);
    const selected = savedConfigs.find((cfg) => cfg.id === configId);
    if (selected) {
      setConfigNameDraft(selected.name);
    }
  }

  const selectedLabel = selectedSticker !== null ? stickerLabel(selectedSticker) : "-";
  const dragFromLabel = bondDragStartIndex !== null ? stickerLabel(bondDragStartIndex) : "-";

  return (
    <main className="layout">
      <section className="panel">
        <h1>Солвер бандажного 4x4 Spiral</h1>
        <p>Загрузите/измените JSON снимка, запустите поиск к целевому состоянию и просматривайте шаги решения.</p>
        <textarea value={snapshotText} onChange={(event) => setSnapshotText(event.target.value)} rows={16} />
        <div className="actions">
          <button onClick={applySnapshotFromText}>Применить JSON</button>
          <button onClick={() => setTargetSnapshot(parseSnapshotFile(doneData))}>Цель: done.json</button>
          <button onClick={() => setTargetSnapshot(snapshot)}>Цель: текущий JSON</button>
        </div>
        <p>Текущая цель: {targetSnapshot.savedAt}</p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel">
        <h2>Визуальный редактор JSON</h2>
        <div className="editor-grid">
          <p>Выбранный стикер: {selectedLabel}</p>
          <p>Тянем бандаж от: {dragFromLabel}</p>
          <p>Режим окрашивания: {paintMode ? "включен" : "выключен"} (текущий цвет {activePaintColor})</p>
          <p>Зажмите левую кнопку на стикере и протяните к другому, чтобы создать или снять бандаж (вне режима окрашивания).</p>
          <div className="palette">
            {PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className={`chip ${activePaintColor === color ? "active" : ""}`}
                onClick={() => selectPaintColor(color)}
              >
                Красить в {color}
              </button>
            ))}
          </div>
          <div className="actions">
            <button type="button" onClick={() => setPaintMode((v) => !v)}>
              {paintMode ? "Выключить режим окрашивания" : "Включить режим окрашивания"}
            </button>
            <button type="button" onClick={paintAllFacesSolvedColors}>
              Покрасить все стороны в базовые цвета
            </button>
            <button type="button" onClick={resetEditorFromAppliedJson}>
              Откатить редактор к примененному JSON
            </button>
            <button type="button" onClick={applyEditorToJson}>
              Применить редактор в JSON
            </button>
          </div>
          <div className="log">
            {editorSnapshot.bonds.length === 0
              ? "(бандажей нет)"
              : editorSnapshot.bonds
                  .map(
                    ([a, b], idx) =>
                      `${idx + 1}. ${stickerLabel(a)} <-> ${stickerLabel(b)}`
                  )
                  .join("\n")}
          </div>
          <div className="bond-list">
            {editorSnapshot.bonds.map(([a, b], idx) => (
              <div key={`${a}-${b}-${idx}`} className="bond-row">
                <span>
                  {idx + 1}. {stickerLabel(a)} {" <-> "} {stickerLabel(b)}
                </span>
                <button type="button" className="chip" onClick={() => removeBond(idx)}>
                  Удалить
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>История конфигов</h2>
        <div className="editor-grid">
          <input
            value={configNameDraft}
            onChange={(event) => setConfigNameDraft(event.target.value)}
            placeholder="Название конфига"
          />
          <div className="actions">
            <button type="button" onClick={createEmptyConfig}>
              Сохранить как новый
            </button>
            <button type="button" onClick={updateSelectedConfig} disabled={!selectedConfigId}>
              Обновить выбранный
            </button>
            <button type="button" onClick={loadSelectedConfig} disabled={!selectedConfigId}>
              Загрузить выбранный
            </button>
            <button type="button" onClick={deleteSelectedConfig} disabled={!selectedConfigId}>
              Удалить выбранный
            </button>
          </div>
          <div className="bond-list">
            {savedConfigs.length === 0 ? (
              <p>Сохраненных конфигов пока нет.</p>
            ) : (
              savedConfigs.map((cfg) => (
                <button
                  type="button"
                  key={cfg.id}
                  className={`chip ${selectedConfigId === cfg.id ? "active" : ""}`}
                  onClick={() => selectConfig(cfg.id)}
                >
                  {cfg.name} ({new Date(cfg.updatedAt).toLocaleString("ru-RU")})
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <SolverSettings value={solverSettings} onChange={setSolverSettings} disabled={running} />

      <SolverPanel
        running={running}
        progress={progress}
        result={result}
        onStart={startSolver}
        onStop={stopSolver}
        playbackStep={playbackStep}
        playbackMax={solutionMoves.length}
        onStepChange={onManualStepChange}
        solutionMoves={solutionMoves}
        isAnimating={isAnimating}
        playbackSpeedMs={playbackSpeedMs}
        onToggleAnimation={toggleAnimation}
        onResetPlayback={resetPlayback}
        onPlaybackSpeedChange={setPlaybackSpeedMs}
        legalMovesNow={visibleLegalMoves}
      />

      <section className="panel">
        <h2>Вид куба</h2>
        <p>
          Версия снимка: {snapshot.v}, сохранен: {snapshot.savedAt}
        </p>
        <CubeView
          state={visibleState}
          selectedIndex={selectedSticker}
          onStickerClick={onStickerInteract}
          bondDragStartIndex={bondDragStartIndex}
          onBondDragStart={onBondDragStart}
          onBondDragEnd={onBondDragEnd}
        />
      </section>

      <section className="panel">
        <h2>3D вид куба</h2>
        <Cube3DView state={visibleState} />
      </section>
    </main>
  );
}

function cloneNet(snapshotNet: SnapshotFile["net"]): SnapshotFile["net"] {
  return Object.fromEntries(
    FACE_ORDER.map((face) => [face, snapshotNet[face].map((row) => [...row])])
  ) as SnapshotFile["net"];
}

function stickerLabel(index: number): string {
  if (index < 0 || index >= FACE_ORDER.length * FACE_SIZE * FACE_SIZE) {
    return `#${index}`;
  }
  const faceIndex = Math.floor(index / (FACE_SIZE * FACE_SIZE));
  const local = index % (FACE_SIZE * FACE_SIZE);
  const row = Math.floor(local / FACE_SIZE);
  const col = local % FACE_SIZE;
  const face = FACE_ORDER[faceIndex];
  return `${face}[${row},${col}] (#${index})`;
}

export default App;

function loadSavedConfigs(): SavedCubeConfig[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(CONFIGS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SavedCubeConfig[];
    return parsed
      .map((entry) => ({
        ...entry,
        snapshot: parseSnapshotFile(entry.snapshot)
      }))
      .filter((entry) => !!entry.id && !!entry.name);
  } catch {
    return [];
  }
}

function persistSavedConfigs(configs: SavedCubeConfig[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CONFIGS_STORAGE_KEY, JSON.stringify(configs));
}
