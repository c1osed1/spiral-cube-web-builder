/** Лёгкий CRT/scanline слой — декор без логики. */
export function ScanlineOverlay(): JSX.Element {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[inherit] opacity-[0.07]"
      aria-hidden
    >
      <div className="scanlines absolute inset-0" />
    </div>
  );
}
