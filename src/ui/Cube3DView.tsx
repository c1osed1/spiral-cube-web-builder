import type { CSSProperties } from "react";
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { netFromState } from "../solver/state";
import { FACE_ORDER, FACE_SIZE, type CubeState, type FaceName, type StickerColor } from "../solver/types";
import { buildFaceDominoes, buildSameFaceBondLines, cellKey, type BondLineSvg, type FaceDomino } from "./cubeDomino";

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
  const layoutPack = useMemo(() => {
    if (!state) {
      return null;
    }
    const dominoPack = buildFaceDominoes(state);
    const bondLinesByFace = buildSameFaceBondLines(state, dominoPack.dominoPairKeys);
    return { dominoPack, bondLinesByFace };
  }, [state]);
  const bondedBySticker = useMemo(() => {
    if (!state) return null;
    const s = new Set<number>();
    for (const [a, b] of state.bonds) {
      s.add(a);
      s.add(b);
    }
    return s;
  }, [state]);

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

  if (!state || !net || !layoutPack || !bondedBySticker) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-slate-950/50 px-4 py-6 text-center text-sm text-slate-400">
        3D недоступен: куб не загружен.
      </div>
    );
  }

  const { dominoPack, bondLinesByFace } = layoutPack;
  const { slaves, dominoes } = dominoPack;

  return (
    <div>
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            setRotX(-26);
            setRotY(34);
            setRotZ(0);
          }}
        >
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
          <Face
            sideClass="cube3d-front"
            face="F"
            stickers={net.F.flat()}
            slaves={slaves}
            dominoes={dominoes}
            lines={bondLinesByFace.F}
            bonded={bondedBySticker}
          />
          <Face
            sideClass="cube3d-back"
            face="B"
            stickers={net.B.flat()}
            slaves={slaves}
            dominoes={dominoes}
            lines={bondLinesByFace.B}
            bonded={bondedBySticker}
          />
          <Face
            sideClass="cube3d-right"
            face="R"
            stickers={net.R.flat()}
            slaves={slaves}
            dominoes={dominoes}
            lines={bondLinesByFace.R}
            bonded={bondedBySticker}
          />
          <Face
            sideClass="cube3d-left"
            face="L"
            stickers={net.L.flat()}
            slaves={slaves}
            dominoes={dominoes}
            lines={bondLinesByFace.L}
            bonded={bondedBySticker}
          />
          <Face
            sideClass="cube3d-top"
            face="U"
            stickers={net.U.flat()}
            slaves={slaves}
            dominoes={dominoes}
            lines={bondLinesByFace.U}
            bonded={bondedBySticker}
          />
          <Face
            sideClass="cube3d-bottom"
            face="D"
            stickers={net.D.flat()}
            slaves={slaves}
            dominoes={dominoes}
            lines={bondLinesByFace.D}
            bonded={bondedBySticker}
          />
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-500">ЛКМ + тянуть. Shift + влево/вправо: roll.</p>
    </div>
  );
}

function Face({
  stickers,
  sideClass,
  face,
  slaves,
  dominoes,
  lines,
  bonded
}: {
  stickers: StickerColor[];
  face: FaceName;
  sideClass: string;
  slaves: Set<string>;
  dominoes: Map<string, FaceDomino>;
  lines: BondLineSvg[];
  bonded: Set<number>;
}): JSX.Element {
  const baseOffset = FACE_ORDER.indexOf(face) * FACE_SIZE * FACE_SIZE;

  return (
    <div className={`cube3d-face ${sideClass}`}>
      <div className="cube3d-label">{face}</div>
      <div className="cube3d-face-wrap">
        <div
          className="cube3d-grid cube3d-grid-explicit"
          style={{
            gridTemplateColumns: `repeat(${FACE_SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${FACE_SIZE}, 1fr)`
          }}
        >
          {Array.from({ length: FACE_SIZE * FACE_SIZE }, (_, idx) => {
            const row = Math.floor(idx / FACE_SIZE);
            const col = idx % FACE_SIZE;
            const color = stickers[row * FACE_SIZE + col];
            const ck = cellKey(face, row, col);
            if (slaves.has(ck)) {
              return null;
            }
            const absoluteIndex = baseOffset + idx;
            const dom = dominoes.get(ck);
            const gridStyle: CSSProperties = dom
              ? {
                  gridRow: `${row + 1} / span ${dom.spanRows}`,
                  gridColumn: `${col + 1} / span ${dom.spanCols}`
                }
              : {
                  gridRow: row + 1,
                  gridColumn: col + 1
                };
            const isBonded =
              bonded.has(absoluteIndex) ||
              (dom !== undefined && (bonded.has(dom.primaryIndex) || bonded.has(dom.secondaryIndex)));

            return (
              <span
                key={`${face}-${row}-${col}`}
                className={`cube3d-sticker cube3d-sticker-domino ${dom ? "cube3d-sticker-domino-merged" : ""} ${isBonded ? "cube3d-sticker-bonded" : ""}`}
                style={{ ...gridStyle, backgroundColor: COLOR_MAP[color] }}
              />
            );
          })}
        </div>
        <svg className="cube3d-bond-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          {lines.map((line, idx) => (
            <line key={`${face}-line-${idx}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} className="cube3d-bond-line" />
          ))}
        </svg>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
