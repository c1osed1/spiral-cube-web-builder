import { motion } from "motion/react";

export function PageBackdrop(): JSX.Element {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[size:48px_48px] bg-grid-fade opacity-40" />
      <motion.div
        className="absolute -left-1/4 top-0 h-[520px] w-[520px] rounded-full bg-violet-600/20 blur-[120px]"
        animate={{ x: [0, 40, 0], y: [0, 24, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-1/4 bottom-0 h-[480px] w-[480px] rounded-full bg-sky-500/15 blur-[100px]"
        animate={{ x: [0, -32, 0], y: [0, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-surface-950 via-transparent to-surface-950" />
    </div>
  );
}
