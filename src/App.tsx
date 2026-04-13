import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
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
import { SolverPanel } from "./ui/SolverPanel";
import { Cube3DView } from "./ui/Cube3DView";
import { PageBackdrop } from "./ui/PageBackdrop";
import { SpotlightCard } from "./ui/SpotlightCard";
import { ShinyText } from "./ui/react-bits/ShinyText";
import { JsonMonacoPanel } from "./ui/JsonMonacoPanel";
import { CubePaintWorkbench } from "./ui/CubePaintWorkbench";
import { toSearchOptions } from "./solver/solverSettingsForm";
import { DEFAULT_SOLVER_SETTINGS, SolverSettings, type SolverSettingsForm } from "./ui/SolverSettings";
import { runSolveNdjsonStream } from "./ui/solverApiClient";

const defaultSnapshot = parseSnapshotFile(snapshotData);
const defaultTargetSnapshot = parseSnapshotFile(doneData);
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
  const solveAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      solveAbortRef.current?.abort();
    };
  }, []);

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

  async function startSolver(): Promise<void> {
    let snap: SnapshotFile;
    try {
      snap = parseSnapshotFile(JSON.parse(snapshotText));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Невалидный JSON снимка.");
      return;
    }
    const parsedState = stateFromSnapshot(snap);
    setSnapshot(snap);
    setEditorSnapshot(snap);
    setInitialState(parsedState);
    setSelectedSticker(null);
    setBondDragStartIndex(null);

    solveAbortRef.current?.abort();
    const ac = new AbortController();
    solveAbortRef.current = ac;

    setError("");
    setProgress(null);
    setResult(null);
    setPlaybackStep(0);
    setIsAnimating(false);
    setRunning(true);

    await runSolveNdjsonStream(
      {
        snapshot: snap,
        targetSnapshot,
        options: toSearchOptions(solverSettings)
      },
      {
        onProgress: (p) => setProgress(p),
        onDone: (payload) => {
          setRunning(false);
          setResult(payload);
          setPlaybackStep(0);
          setIsAnimating(payload.moves.length > 0);
          setProgress((current) => current ?? null);
          solveAbortRef.current = null;
        },
        onError: (msg) => {
          setRunning(false);
          setIsAnimating(false);
          solveAbortRef.current = null;
          if (msg) {
            setError(msg);
          }
        },
        onAborted: () => {
          setRunning(false);
          setIsAnimating(false);
          solveAbortRef.current = null;
        }
      },
      ac.signal
    );
  }

  function stopSolver(): void {
    solveAbortRef.current?.abort();
    solveAbortRef.current = null;
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

  const gridContainer = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.08 }
    }
  } as const;

  const gridItem = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 26 } }
  } as const;

  return (
    <div className="relative min-h-screen font-sans">
      <PageBackdrop />
      <main className="relative z-10 mx-auto max-w-[1680px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <motion.header
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mb-10 text-center lg:mb-14 lg:text-left"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/90">
            spiral-cube-web-builder
          </p>
          <h1 className="bg-gradient-to-br from-white via-violet-100 to-sky-200 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl lg:text-5xl">
            Бандажный 4×4 Spiral
          </h1>
          <div className="mx-auto mt-3 max-w-2xl text-pretty lg:mx-0">
            <ShinyText
              text="JSON → солвер на Node (ПК) через API → пошаговый playback. Визуальный редактор, связи и 3D."
              className="text-base sm:text-lg"
              color="#94a3b8"
              shineColor="#f1f5f9"
              speed={2.8}
              spread={110}
            />
          </div>
        </motion.header>

        <motion.div
          className="grid gap-6 lg:grid-cols-2 xl:grid-cols-12 xl:gap-7"
          variants={gridContainer}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={gridItem} className="xl:col-span-12">
            <JsonMonacoPanel
              value={snapshotText}
              onChange={setSnapshotText}
              onApply={applySnapshotFromText}
              onTargetDone={() => setTargetSnapshot(parseSnapshotFile(doneData))}
              onTargetCurrent={() => setTargetSnapshot(snapshot)}
              targetSavedAt={targetSnapshot.savedAt}
              error={error}
            />
          </motion.div>

          <motion.div variants={gridItem} className="xl:col-span-12">
            <CubePaintWorkbench
              visibleState={visibleState}
              editorSnapshot={editorSnapshot}
              snapshot={snapshot}
              selectedSticker={selectedSticker}
              bondDragStartIndex={bondDragStartIndex}
              paintMode={paintMode}
              activePaintColor={activePaintColor}
              onStickerInteract={onStickerInteract}
              onBondDragStart={onBondDragStart}
              onBondDragEnd={onBondDragEnd}
              onTogglePaintMode={() => setPaintMode((v) => !v)}
              onSelectPaintColor={selectPaintColor}
              onPaintAllSolved={paintAllFacesSolvedColors}
              onResetFromAppliedJson={resetEditorFromAppliedJson}
              onPushEditorToJson={applyEditorToJson}
              onRemoveBond={removeBond}
              formatSticker={stickerLabel}
              savedConfigs={savedConfigs}
              selectedConfigId={selectedConfigId}
              configNameDraft={configNameDraft}
              onConfigNameDraft={setConfigNameDraft}
              onCreateConfig={createEmptyConfig}
              onUpdateConfig={updateSelectedConfig}
              onLoadConfig={loadSelectedConfig}
              onDeleteConfig={deleteSelectedConfig}
              onSelectConfig={selectConfig}
            />
          </motion.div>

          <motion.div variants={gridItem} className="xl:col-span-7">
            <SpotlightCard className="h-full">
              <SolverSettings value={solverSettings} onChange={setSolverSettings} disabled={running} />
            </SpotlightCard>
          </motion.div>

          <motion.div variants={gridItem} className="xl:col-span-12">
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
          </motion.div>

          <motion.div variants={gridItem} className="xl:col-span-6">
            <SpotlightCard>
              <h2 className="mb-4 text-lg font-semibold text-white">3D</h2>
              <Cube3DView state={visibleState} />
            </SpotlightCard>
          </motion.div>
        </motion.div>
      </main>
    </div>
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
