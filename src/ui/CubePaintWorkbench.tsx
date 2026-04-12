import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { CubeState, SnapshotFile, StickerColor } from "../solver/types";
import { CubeView } from "./CubeView";
import { GlassTabBar } from "./GlassTabBar";
import { SpotlightCard } from "./SpotlightCard";
import { TiltedSurface } from "./react-bits/TiltedSurface";

const PALETTE: StickerColor[] = ["W", "Y", "R", "O", "G", "B"];
const SWATCH: Record<StickerColor, string> = {
  W: "#f1f5f9",
  Y: "#facc15",
  R: "#ef4444",
  O: "#fb923c",
  G: "#22c55e",
  B: "#3b82f6"
};

export interface SavedConfigEntry {
  id: string;
  name: string;
  snapshot: SnapshotFile;
  updatedAt: string;
}

export interface CubePaintWorkbenchProps {
  visibleState: CubeState;
  editorSnapshot: SnapshotFile;
  snapshot: SnapshotFile;
  selectedSticker: number | null;
  bondDragStartIndex: number | null;
  paintMode: boolean;
  activePaintColor: StickerColor;
  onStickerInteract: (index: number) => void;
  onBondDragStart: (index: number) => void;
  onBondDragEnd: (index: number) => void;
  onTogglePaintMode: () => void;
  onSelectPaintColor: (c: StickerColor) => void;
  onPaintAllSolved: () => void;
  onResetFromAppliedJson: () => void;
  onPushEditorToJson: () => void;
  onRemoveBond: (bondIndex: number) => void;
  formatSticker: (index: number) => string;
  savedConfigs: SavedConfigEntry[];
  selectedConfigId: string | null;
  configNameDraft: string;
  onConfigNameDraft: (v: string) => void;
  onCreateConfig: () => void;
  onUpdateConfig: () => void;
  onLoadConfig: () => void;
  onDeleteConfig: () => void;
  onSelectConfig: (id: string) => void;
}

const TABS = [
  { id: "grid", label: "Сетка & краска" },
  { id: "bonds", label: "Бандажи" },
  { id: "configs", label: "Конфиги" }
] as const;

type TabId = (typeof TABS)[number]["id"];

export function CubePaintWorkbench(props: CubePaintWorkbenchProps): JSX.Element {
  const [tab, setTab] = useState<TabId>("grid");
  const selectedLabel = props.selectedSticker !== null ? props.formatSticker(props.selectedSticker) : "—";
  const dragFromLabel = props.bondDragStartIndex !== null ? props.formatSticker(props.bondDragStartIndex) : "—";

  return (
    <SpotlightCard className="relative overflow-hidden border-fuchsia-500/10">
      <div className="workbench-aurora pointer-events-none absolute inset-0 opacity-90" />
      <div className="relative z-[1]">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Мастерская куба</h2>
          </div>
          <div className="max-w-md flex-1 lg:max-w-lg">
            <GlassTabBar tabs={[...TABS]} active={tab} onChange={(id) => setTab(id as TabId)} />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <TiltedSurface className="origin-center">
              <div className="rounded-2xl border border-white/[0.08] bg-slate-950/70 p-4 shadow-2xl shadow-violet-950/30 backdrop-blur-sm">
                <p className="mb-3 text-center text-xs text-slate-500">
                  v{props.snapshot.v} · {props.snapshot.savedAt}
                </p>
                <CubeView
                  state={props.visibleState}
                  selectedIndex={props.selectedSticker}
                  onStickerClick={props.onStickerInteract}
                  bondDragStartIndex={props.bondDragStartIndex}
                  onBondDragStart={props.onBondDragStart}
                  onBondDragEnd={props.onBondDragEnd}
                />
              </div>
            </TiltedSurface>
          </div>

          <div className="flex min-h-[280px] flex-col lg:col-span-5">
            <AnimatePresence mode="wait">
              {tab === "grid" ? (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-1 flex-col gap-4"
                >
                  <div className="rounded-xl border border-white/[0.06] bg-slate-900/40 p-3 text-sm text-slate-300">
                    <p>
                      Стикер: <span className="font-mono text-sky-200/90">{selectedLabel}</span>
                    </p>
                    <p className="mt-1 text-slate-500">
                      Режим краски:{" "}
                      <span className={props.paintMode ? "text-fuchsia-300" : "text-slate-400"}>
                        {props.paintMode ? "вкл." : "выкл."}
                      </span>
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Палитра</p>
                    <div className="flex flex-wrap gap-3">
                      {PALETTE.map((color) => {
                        const active = props.activePaintColor === color;
                        return (
                          <motion.button
                            key={color}
                            type="button"
                            title={color}
                            onClick={() => props.onSelectPaintColor(color)}
                            className="relative h-12 w-12 rounded-full border-2 border-white/10 shadow-lg"
                            style={{ backgroundColor: SWATCH[color] }}
                            whileHover={{ scale: 1.08 }}
                            whileTap={{ scale: 0.92 }}
                            animate={{
                              boxShadow: active
                                ? "0 0 0 3px rgba(217,70,239,0.7), 0 0 28px rgba(139,92,246,0.45)"
                                : "0 4px 14px rgba(0,0,0,0.35)"
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="ui-btn-secondary" onClick={props.onTogglePaintMode}>
                      {props.paintMode ? "Выключить краску" : "Режим краски"}
                    </button>
                    <button type="button" className="ui-btn-secondary" onClick={props.onPaintAllSolved}>
                      Базовые цвета граней
                    </button>
                    <button type="button" className="ui-btn-secondary" onClick={props.onResetFromAppliedJson}>
                      Сброс к JSON
                    </button>
                    <button type="button" className="ui-btn" onClick={props.onPushEditorToJson}>
                      В Monaco JSON
                    </button>
                  </div>
                </motion.div>
              ) : null}

              {tab === "bonds" ? (
                <motion.div
                  key="bonds"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-1 flex-col gap-3"
                >
                  <p className="text-sm text-slate-400">
                    Тяните <span className="font-mono text-sky-200/90">{dragFromLabel}</span> → другой стикер (без
                    режима краски), чтобы переключить связь.
                  </p>
                  <div className="ui-log max-h-36 overflow-auto text-xs">
                    {props.editorSnapshot.bonds.length === 0
                      ? "(бандажей нет)"
                      : props.editorSnapshot.bonds
                          .map(([a, b], idx) => `${idx + 1}. ${props.formatSticker(a)} ↔ ${props.formatSticker(b)}`)
                          .join("\n")}
                  </div>
                  <div className="bond-list max-h-64">
                    {props.editorSnapshot.bonds.map(([a, b], idx) => (
                      <div key={`${a}-${b}-${idx}`} className="bond-row">
                        <span>
                          {idx + 1}. {props.formatSticker(a)} {" ↔ "} {props.formatSticker(b)}
                        </span>
                        <button type="button" className="ui-btn-danger shrink-0 py-1.5 text-xs" onClick={() => props.onRemoveBond(idx)}>
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : null}

              {tab === "configs" ? (
                <motion.div
                  key="configs"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-1 flex-col gap-3"
                >
                  <input
                    className="ui-input"
                    value={props.configNameDraft}
                    onChange={(e) => props.onConfigNameDraft(e.target.value)}
                    placeholder="Имя конфига"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="ui-btn" onClick={props.onCreateConfig}>
                      Новый
                    </button>
                    <button type="button" className="ui-btn-secondary" onClick={props.onUpdateConfig} disabled={!props.selectedConfigId}>
                      Обновить
                    </button>
                    <button type="button" className="ui-btn-secondary" onClick={props.onLoadConfig} disabled={!props.selectedConfigId}>
                      Загрузить
                    </button>
                    <button type="button" className="ui-btn-danger" onClick={props.onDeleteConfig} disabled={!props.selectedConfigId}>
                      Удалить
                    </button>
                  </div>
                  <div className="bond-list max-h-72">
                    {props.savedConfigs.length === 0 ? (
                      <p className="text-sm text-slate-500">Пусто — сохраните сетку из вкладки «Сетка».</p>
                    ) : (
                      props.savedConfigs.map((cfg) => (
                        <button
                          type="button"
                          key={cfg.id}
                          className={`chip block w-full text-left ${props.selectedConfigId === cfg.id ? "active" : ""}`}
                          onClick={() => props.onSelectConfig(cfg.id)}
                        >
                          <span className="font-medium text-slate-100">{cfg.name}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {new Date(cfg.updatedAt).toLocaleString("ru-RU")}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}
