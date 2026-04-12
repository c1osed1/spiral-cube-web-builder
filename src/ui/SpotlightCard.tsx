import { useRef, type ReactNode, type MouseEvent } from "react";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
}

/** Карточка с мягким spotlight при наведении — паттерн в духе React Bits / современных UI-kit. */
export function SpotlightCard({ children, className = "" }: SpotlightCardProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  function onMouseMove(event: MouseEvent<HTMLDivElement>): void {
    const el = ref.current;
    if (!el) return;
    const { left, top } = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${event.clientX - left}px`);
    el.style.setProperty("--spot-y", `${event.clientY - top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      className={`group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-xl ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(520px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(139, 92, 246, 0.12), transparent 45%)"
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
