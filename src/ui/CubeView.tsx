import type { CSSProperties } from "react";
import { FACE_ORDER, FACE_SIZE, type CubeState, type StickerColor } from "../solver/types";
import { getStickerPosition, netFromState } from "../solver/state";
import { buildFaceDominoes, buildSameFaceBondLines, cellKey } from "./cubeDomino";

interface CubeViewProps {
  state: CubeState | null;
  selectedIndex?: number | null;
  onStickerClick?: (index: number) => void;
  bondDragStartIndex?: number | null;
  onBondDragStart?: (index: number) => void;
  onBondDragEnd?: (index: number) => void;
}

const COLOR_MAP: Record<StickerColor, string> = {
  W: "#f1f5f9",
  Y: "#facc15",
  R: "#ef4444",
  O: "#fb923c",
  G: "#22c55e",
  B: "#3b82f6"
};

export function CubeView({
  state,
  selectedIndex = null,
  onStickerClick,
  bondDragStartIndex = null,
  onBondDragStart,
  onBondDragEnd
}: CubeViewProps): JSX.Element {
  if (!state) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-slate-950/50 px-4 py-6 text-center text-sm text-slate-400">
        Куб не загружен.
      </div>
    );
  }

  const net = netFromState(state);
  const { slaves, dominoes, dominoPairKeys } = buildFaceDominoes(state);
  const bondsByFace = buildSameFaceBondLines(state, dominoPairKeys);
  const bondedStickerKeys = new Set<string>();
  for (const [a, b] of state.bonds) {
    try {
      const pa = getStickerPosition(a);
      const pb = getStickerPosition(b);
      bondedStickerKeys.add(cellKey(pa.face, pa.row, pa.col));
      bondedStickerKeys.add(cellKey(pb.face, pb.row, pb.col));
    } catch {
      /* пропускаем битый индекс */
    }
  }

  return (
    <div className="cube-net">
      {FACE_ORDER.map((face) => (
        <section key={face} className="face-block">
          <header>{face}</header>
          <div className="face-wrap">
            <div
              className="face-grid face-grid-explicit"
              style={{
                gridTemplateColumns: `repeat(${FACE_SIZE}, 1fr)`,
                gridTemplateRows: `repeat(${FACE_SIZE}, 1fr)`
              }}
            >
              {Array.from({ length: FACE_SIZE * FACE_SIZE }, (_, idx) => {
                const row = Math.floor(idx / FACE_SIZE);
                const col = idx % FACE_SIZE;
                const color = net[face][row][col];
                const ck = cellKey(face, row, col);
                if (slaves.has(ck)) {
                  return null;
                }
                const absoluteIndex = FACE_ORDER.indexOf(face) * FACE_SIZE * FACE_SIZE + idx;
                const dom = dominoes.get(ck);
                const bonded = bondedStickerKeys.has(ck);
                const selected =
                  selectedIndex === absoluteIndex ||
                  (dom !== undefined &&
                    (selectedIndex === dom.primaryIndex || selectedIndex === dom.secondaryIndex));
                const dragStart =
                  bondDragStartIndex === absoluteIndex ||
                  (dom !== undefined &&
                    (bondDragStartIndex === dom.primaryIndex || bondDragStartIndex === dom.secondaryIndex));

                const gridStyle: CSSProperties = dom
                  ? {
                      gridRow: `${row + 1} / span ${dom.spanRows}`,
                      gridColumn: `${col + 1} / span ${dom.spanCols}`
                    }
                  : {
                      gridRow: row + 1,
                      gridColumn: col + 1
                    };

                const clickIndex = dom ? dom.primaryIndex : absoluteIndex;

                return (
                  <button
                    key={`${face}-${row}-${col}`}
                    type="button"
                    className={`sticker sticker-domino ${dom ? "sticker-domino-merged" : ""} ${bonded ? "sticker-bonded" : ""} ${selected ? "sticker-selected" : ""} ${dragStart ? "sticker-drag-start" : ""}`}
                    style={{ ...gridStyle, backgroundColor: COLOR_MAP[color] }}
                    title={dom ? `${face}:${dom.primaryIndex}+${dom.secondaryIndex}` : `${face}:${idx}`}
                    onClick={() => onStickerClick?.(clickIndex)}
                    onMouseDown={(event) => {
                      if (event.button !== 0) {
                        return;
                      }
                      onBondDragStart?.(clickIndex);
                    }}
                    onMouseUp={() => onBondDragEnd?.(clickIndex)}
                    onDragStart={(event) => event.preventDefault()}
                  />
                );
              })}
            </div>
            <svg className="bond-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
              {bondsByFace[face].map((line, idx) => (
                <line
                  key={`${face}-bond-${idx}`}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  className="bond-line"
                />
              ))}
            </svg>
          </div>
        </section>
      ))}
    </div>
  );
}
