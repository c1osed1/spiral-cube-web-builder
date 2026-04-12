import { FACE_ORDER, FACE_SIZE, type CubeState, type StickerColor } from "../solver/types";
import { getStickerPosition, netFromState } from "../solver/state";

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
    return <div className="panel">Куб не загружен.</div>;
  }

  const net = netFromState(state);
  const bondsByFace = buildFaceBondLines(state);
  const bondedStickerKeys = new Set<string>();
  for (const [a, b] of state.bonds) {
    const pa = getStickerPosition(a);
    const pb = getStickerPosition(b);
    bondedStickerKeys.add(`${pa.face}-${pa.row}-${pa.col}`);
    bondedStickerKeys.add(`${pb.face}-${pb.row}-${pb.col}`);
  }

  return (
    <div className="cube-net">
      {FACE_ORDER.map((face) => (
        <section key={face} className="face-block">
          <header>{face}</header>
          <div className="face-wrap">
            <div className="face-grid" style={{ gridTemplateColumns: `repeat(${FACE_SIZE}, 1fr)` }}>
              {net[face].flat().map((color, idx) => {
                const row = Math.floor(idx / FACE_SIZE);
                const col = idx % FACE_SIZE;
                const bonded = bondedStickerKeys.has(`${face}-${row}-${col}`);
                const absoluteIndex = FACE_ORDER.indexOf(face) * FACE_SIZE * FACE_SIZE + idx;
                const selected = selectedIndex === absoluteIndex;
                const dragStart = bondDragStartIndex === absoluteIndex;
                return (
                  <button
                    key={`${face}-${idx}`}
                    type="button"
                    className={`sticker ${bonded ? "sticker-bonded" : ""} ${selected ? "sticker-selected" : ""} ${dragStart ? "sticker-drag-start" : ""}`}
                    style={{ backgroundColor: COLOR_MAP[color] }}
                    title={`${face}:${idx}`}
                    onClick={() => onStickerClick?.(absoluteIndex)}
                    onMouseDown={(event) => {
                      if (event.button !== 0) {
                        return;
                      }
                      onBondDragStart?.(absoluteIndex);
                    }}
                    onMouseUp={() => onBondDragEnd?.(absoluteIndex)}
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

interface BondLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function buildFaceBondLines(state: CubeState): Record<(typeof FACE_ORDER)[number], BondLine[]> {
  const lines = Object.fromEntries(FACE_ORDER.map((face) => [face, [] as BondLine[]])) as Record<
    (typeof FACE_ORDER)[number],
    BondLine[]
  >;

  for (const [a, b] of state.bonds) {
    const pa = getStickerPosition(a);
    const pb = getStickerPosition(b);
    if (pa.face !== pb.face) {
      continue;
    }
    lines[pa.face].push({
      x1: toSvgCoord(pa.col),
      y1: toSvgCoord(pa.row),
      x2: toSvgCoord(pb.col),
      y2: toSvgCoord(pb.row)
    });
  }

  return lines;
}

function toSvgCoord(cell: number): number {
  return ((cell + 0.5) / FACE_SIZE) * 100;
}
