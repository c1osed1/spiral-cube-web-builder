import { Suspense, lazy, useCallback, useRef } from "react";
import { motion } from "motion/react";
import type { editor } from "monaco-editor";
import { ShinyText } from "./react-bits/ShinyText";
import { SpotlightCard } from "./SpotlightCard";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

interface JsonMonacoPanelProps {
  value: string;
  onChange: (next: string) => void;
  onApply: () => void;
  onTargetDone: () => void;
  onTargetCurrent: () => void;
  targetSavedAt: string;
  /** Текст ошибки парсинга / валидации */
  error?: string;
}

export function JsonMonacoPanel({
  value,
  onChange,
  onApply,
  onTargetDone,
  onTargetCurrent,
  targetSavedAt,
  error
}: JsonMonacoPanelProps): JSX.Element {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleFormat = useCallback(() => {
    void editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }, []);

  return (
    <SpotlightCard className="overflow-hidden border-cyan-500/15">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="relative">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">Снимок · Monaco JSON</h2>
            <div className="mt-1 max-w-xl">
              <ShinyText
                text="Подсветка, миникарта, форматирование. Старт солвера читает этот текст без «Применить»."
                className="text-sm"
                color="#64748b"
                shineColor="#e2e8f0"
                speed={3.2}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <motion.button type="button" className="ui-btn" onClick={onApply} whileTap={{ scale: 0.98 }}>
              Применить в куб
            </motion.button>
            <motion.button type="button" className="ui-btn-secondary" onClick={handleFormat} whileTap={{ scale: 0.98 }}>
              Формат JSON
            </motion.button>
          </div>
        </div>

        <div className="monaco-shell overflow-hidden rounded-xl border border-white/[0.09] bg-[#0d1117] shadow-inner">
          <Suspense
            fallback={
              <div className="flex h-[440px] items-center justify-center text-sm text-slate-500">
                Загрузка Monaco Editor…
              </div>
            }
          >
            <MonacoEditor
              height="440px"
              language="json"
              theme="vs-dark"
              path="snapshot.json"
              value={value}
              onChange={(v) => onChange(v ?? "")}
              onMount={(ed) => {
                editorRef.current = ed;
              }}
              options={{
                minimap: { enabled: true, scale: 0.9 },
                fontSize: 13,
                fontLigatures: true,
                tabSize: 2,
                insertSpaces: true,
                formatOnPaste: true,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                smoothScrolling: true,
                cursorBlinking: "smooth",
                padding: { top: 12, bottom: 12 },
                bracketPairColorization: { enabled: true },
                automaticLayout: true,
                renderLineHighlight: "line"
              }}
            />
          </Suspense>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            className="ui-btn-secondary text-xs sm:text-sm"
            onClick={onTargetDone}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Цель: done.json
          </motion.button>
          <motion.button
            type="button"
            className="ui-btn-secondary text-xs sm:text-sm"
            onClick={onTargetCurrent}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Цель: текущий снимок
          </motion.button>
          <span className="ml-auto font-mono text-xs text-slate-500">
            цель <span className="text-cyan-300/90">{targetSavedAt}</span>
          </span>
        </div>

        {error ? (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-xl border border-rose-500/35 bg-rose-950/45 px-3 py-2 font-mono text-xs text-rose-100"
          >
            {error}
          </motion.p>
        ) : null}
      </div>
    </SpotlightCard>
  );
}
