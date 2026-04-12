import { motion } from "motion/react";

export interface GlassTab {
  id: string;
  label: string;
}

interface GlassTabBarProps {
  tabs: GlassTab[];
  active: string;
  onChange: (id: string) => void;
}

/** Плавающий индикатор в стиле React Bits / motion layoutId. */
export function GlassTabBar({ tabs, active, onChange }: GlassTabBarProps): JSX.Element {
  return (
    <div className="relative flex rounded-2xl border border-white/[0.08] bg-slate-950/50 p-1 shadow-inner shadow-black/40 backdrop-blur-md">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className="relative z-10 flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors"
        >
          {active === tab.id ? (
            <motion.div
              layoutId="workbench-tab-pill"
              className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-600/45 via-fuchsia-600/25 to-sky-600/35 shadow-lg shadow-violet-900/20"
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            />
          ) : null}
          <span
            className={`relative z-[1] ${active === tab.id ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
}
