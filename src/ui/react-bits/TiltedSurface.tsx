/**
 * 3D-наклон контейнера при движении мыши — идея из TiltedCard (React Bits / DavidHDev/react-bits, MIT).
 */
import { useRef, type ReactNode } from "react";
import type { SpringOptions } from "motion/react";
import { motion, useSpring } from "motion/react";

const spring: SpringOptions = {
  damping: 26,
  stiffness: 140,
  mass: 1.6
};

interface TiltedSurfaceProps {
  children: ReactNode;
  className?: string;
  /** Градусы максимального наклона */
  rotateAmplitude?: number;
}

export function TiltedSurface({
  children,
  className = "",
  rotateAmplitude = 11
}: TiltedSurfaceProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(0, spring);
  const rotateY = useSpring(0, spring);
  const scale = useSpring(1, spring);

  function onMove(e: React.MouseEvent<HTMLDivElement>): void {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -rotateAmplitude);
    rotateY.set((offsetX / (rect.width / 2)) * rotateAmplitude);
    scale.set(1.02);
  }

  function onLeave(): void {
    rotateX.set(0);
    rotateY.set(0);
    scale.set(1);
  }

  return (
    <div
      ref={ref}
      className={`perspective-[1100px] ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <motion.div
        className="transform-gpu rounded-2xl will-change-transform"
        style={{ rotateX, rotateY, scale, transformStyle: "preserve-3d" }}
      >
        {children}
      </motion.div>
    </div>
  );
}
