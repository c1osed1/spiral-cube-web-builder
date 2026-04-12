import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { getStickerPosition, netFromState } from "../solver/state";
import { FACE_ORDER, FACE_SIZE, type CubeState, type FaceName, type StickerColor } from "../solver/types";

interface Cube3DViewProps {
  state: CubeState | null;
}

const COLOR_MAP: Record<StickerColor, string> = {
  W: "#f1f5f9",
  Y: "#facc15",
  R: "#ef4444",
  O: "#fb923c",
  G: "#22c55e",
  B: "#3b82f6"
};

export function Cube3DView({ state }: Cube3DViewProps): JSX.Element {
  const [rotX, setRotX] = useState(-26);
  const [rotY, setRotY] = useState(34);
  const [rotZ, setRotZ] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; rotX: number; rotY: number; rotZ: number } | null>(
    null
  );

  const net = useMemo(() => (state ? netFromState(state) : null), [state]);
  const faceBonds = useMemo(() => (state ? buildFaceBondDecor(state) : null), [state]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    setDragging(true);
    setDragStart({
      x: event.clientX,
      y: event.clientY,
      rotX,
      rotY,
      rotZ
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragging || !dragStart) {
      return;
    }
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    if (event.shiftKey) {
      setRotZ(dragStart.rotZ + dx * 0.45);
      return;
    }
    setRotY(dragStart.rotY + dx * 0.35);
    setRotX(clamp(dragStart.rotX - dy * 0.35, -89, 89));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    setDragging(false);
    setDragStart(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (!state || !net) {
    return <div className="panel">3D вид недоступен: куб не загружен.</div>;
  }

  return (
    <div>
      <div className="actions">
        <button type="button" onClick={() => {
          setRotX(-26);
          setRotY(34);
          setRotZ(0);
        }}>
          Сбросить ракурс
        </button>
      </div>
      <div
        className="cube3d-scene"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="cube3d" style={{ transform: `rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)` }}>
          <Face sideClass="cube3d-front" stickers={net.F.flat()} label="F" bonded={faceBonds?.F.bonded ?? new Set()} lines={faceBonds?.F.lines ?? []} />
          <Face sideClass="cube3d-back" stickers={net.B.flat()} label="B" bonded={faceBonds?.B.bonded ?? new Set()} lines={faceBonds?.B.lines ?? []} />
          <Face sideClass="cube3d-right" stickers={net.R.flat()} label="R" bonded={faceBonds?.R.bonded ?? new Set()} lines={faceBonds?.R.lines ?? []} />
          <Face sideClass="cube3d-left" stickers={net.L.flat()} label="L" bonded={faceBonds?.L.bonded ?? new Set()} lines={faceBonds?.L.lines ?? []} />
          <Face sideClass="cube3d-top" stickers={net.U.flat()} label="U" bonded={faceBonds?.U.bonded ?? new Set()} lines={faceBonds?.U.lines ?? []} />
          <Face sideClass="cube3d-bottom" stickers={net.D.flat()} label="D" bonded={faceBonds?.D.bonded ?? new Set()} lines={faceBonds?.D.lines ?? []} />
        </div>
      </div>
      <p>ЛКМ + тянуть: вверх/вниз/влево/вправо. Shift + тянуть влево/вправо: прокрутка куба (roll).</p>
    </div>
  );
}

function Face({
  stickers,
  sideClass,
  label,
  bonded,
  lines
}: {
  stickers: StickerColor[];
  sideClass: string;
  label: FaceName;
  bonded: Set<number>;
  lines: BondLine[];
}): JSX.Element {
  const baseOffset = FACE_ORDER.indexOf(label) * FACE_SIZE * FACE_SIZE;
  return (
    <div className={`cube3d-face ${sideClass}`}>
      <div className="cube3d-label">{label}</div>
      <div className="cube3d-face-wrap">
      <div className="cube3d-grid">
        {stickers.map((color, idx) => (
          <span
            key={`${label}-${idx}`}
            className={`cube3d-sticker ${bonded.has(baseOffset + idx) ? "cube3d-sticker-bonded" : ""}`}
            style={{ backgroundColor: COLOR_MAP[color] }}
          />
        ))}
      </div>
        <svg className="cube3d-bond-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          {lines.map((line, idx) => (
            <line key={`${label}-line-${idx}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} className="cube3d-bond-line" />
          ))}
        </svg>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface BondLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function buildFaceBondDecor(
  state: CubeState
): Record<FaceName, { lines: BondLine[]; bonded: Set<number> }> {
  const initial = Object.fromEntries(
    FACE_ORDER.map((face) => [face, { lines: [] as BondLine[], bonded: new Set<number>() }])
  ) as Record<FaceName, { lines: BondLine[]; bonded: Set<number> }>;

  for (const [a, b] of state.bonds) {
    let pa: { face: FaceName; row: number; col: number };
    let pb: { face: FaceName; row: number; col: number };
    try {
      pa = getStickerPosition(a);
      pb = getStickerPosition(b);
    } catch {
      continue;
    }
    initial[pa.face].bonded.add(a);
    initial[pb.face].bonded.add(b);
    if (pa.face !== pb.face) {
      continue;
    }
    initial[pa.face].lines.push({
      x1: toSvgCoord(pa.col),
      y1: toSvgCoord(pa.row),
      x2: toSvgCoord(pb.col),
      y2: toSvgCoord(pb.row)
    });
  }

  return initial;
}

function toSvgCoord(cell: number): number {
  return ((cell + 0.5) / FACE_SIZE) * 100;
}
