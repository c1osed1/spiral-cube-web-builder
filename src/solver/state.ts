import {
  FACE_ORDER,
  FACE_SIZE,
  STICKERS_PER_FACE,
  TOTAL_STICKERS,
  type Bond,
  type CubeNet,
  type CubeState,
  type FaceName,
  type SnapshotFile,
  type StickerColor
} from "./types";

const VALID_COLORS = new Set<StickerColor>(["W", "Y", "R", "O", "G", "B"]);

export function getStickerIndex(face: FaceName, row: number, col: number): number {
  const faceOffset = FACE_ORDER.indexOf(face) * STICKERS_PER_FACE;
  return faceOffset + row * FACE_SIZE + col;
}

export function getStickerPosition(index: number): { face: FaceName; row: number; col: number } {
  if (!Number.isInteger(index) || index < 0 || index >= TOTAL_STICKERS) {
    throw new Error(`Sticker index out of bounds: ${index}`);
  }
  const faceIdx = Math.floor(index / STICKERS_PER_FACE);
  const local = index % STICKERS_PER_FACE;
  const row = Math.floor(local / FACE_SIZE);
  const col = local % FACE_SIZE;
  return {
    face: FACE_ORDER[faceIdx],
    row,
    col
  };
}

export function parseSnapshotFile(input: unknown): SnapshotFile {
  if (!input || typeof input !== "object") {
    throw new Error("Snapshot must be an object.");
  }

  const snapshot = input as Partial<SnapshotFile>;
  if (!snapshot.net || !snapshot.bonds) {
    throw new Error("Snapshot must include net and bonds.");
  }

  validateNet(snapshot.net);
  validateBonds(snapshot.bonds);

  return {
    v: typeof snapshot.v === "number" ? snapshot.v : 1,
    savedAt: typeof snapshot.savedAt === "string" ? snapshot.savedAt : new Date().toISOString(),
    net: snapshot.net,
    bonds: snapshot.bonds
  };
}

export function stateFromSnapshot(snapshot: SnapshotFile): CubeState {
  const stickers: StickerColor[] = [];
  for (const face of FACE_ORDER) {
    const grid = snapshot.net[face];
    for (let row = 0; row < FACE_SIZE; row += 1) {
      for (let col = 0; col < FACE_SIZE; col += 1) {
        stickers.push(grid[row][col]);
      }
    }
  }

  if (stickers.length !== TOTAL_STICKERS) {
    throw new Error(`Expected ${TOTAL_STICKERS} stickers, received ${stickers.length}.`);
  }

  return {
    stickers,
    bonds: snapshot.bonds
  };
}

export function netFromState(state: CubeState): CubeNet {
  const net = {} as CubeNet;
  for (const face of FACE_ORDER) {
    const faceOffset = FACE_ORDER.indexOf(face) * STICKERS_PER_FACE;
    const grid: StickerColor[][] = [];
    for (let row = 0; row < FACE_SIZE; row += 1) {
      const currentRow: StickerColor[] = [];
      for (let col = 0; col < FACE_SIZE; col += 1) {
        currentRow.push(state.stickers[faceOffset + row * FACE_SIZE + col]);
      }
      grid.push(currentRow);
    }
    net[face] = grid;
  }
  return net;
}

export function serializeState(state: CubeState): string {
  return `${serializeStickerState(state)}|${serializeBondState(state)}`;
}

export function serializeStickerState(state: CubeState): string {
  return state.stickers.join("");
}

export function serializeBondState(state: CubeState): string {
  const normalized = state.bonds
    .map(([a, b]) => (a < b ? [a, b] : [b, a]))
    .sort(([a1, b1], [a2, b2]) => a1 - a2 || b1 - b2);
  return normalized.map(([a, b]) => `${a}-${b}`).join(",");
}

export function isFaceUniform(state: CubeState, face: FaceName): boolean {
  const start = FACE_ORDER.indexOf(face) * STICKERS_PER_FACE;
  const first = state.stickers[start];
  for (let idx = start + 1; idx < start + STICKERS_PER_FACE; idx += 1) {
    if (state.stickers[idx] !== first) {
      return false;
    }
  }
  return true;
}

export function isSolved(state: CubeState): boolean {
  return FACE_ORDER.every((face) => isFaceUniform(state, face));
}

export function scoreState(state: CubeState): number {
  let score = 0;
  for (const face of FACE_ORDER) {
    const start = FACE_ORDER.indexOf(face) * STICKERS_PER_FACE;
    const counts = new Map<StickerColor, number>();
    for (let idx = start; idx < start + STICKERS_PER_FACE; idx += 1) {
      const color = state.stickers[idx];
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
    let maxCount = 0;
    for (const value of counts.values()) {
      if (value > maxCount) {
        maxCount = value;
      }
    }
    score += STICKERS_PER_FACE - maxCount;
  }
  return score;
}

function validateNet(net: Partial<CubeNet>): void {
  for (const face of FACE_ORDER) {
    const grid = net[face];
    if (!Array.isArray(grid) || grid.length !== FACE_SIZE) {
      throw new Error(`Face ${face} must be a 4x4 matrix.`);
    }
    for (const row of grid) {
      if (!Array.isArray(row) || row.length !== FACE_SIZE) {
        throw new Error(`Face ${face} contains an invalid row.`);
      }
      for (const color of row) {
        if (!VALID_COLORS.has(color as StickerColor)) {
          throw new Error(`Face ${face} contains unsupported color "${String(color)}".`);
        }
      }
    }
  }
}

function validateBonds(bonds: Bond[]): void {
  if (!Array.isArray(bonds)) {
    throw new Error("bonds must be an array.");
  }
  for (const entry of bonds) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error("Each bond must have exactly two indices.");
    }
    const [a, b] = entry;
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 0 ||
      b < 0 ||
      a >= TOTAL_STICKERS ||
      b >= TOTAL_STICKERS
    ) {
      throw new Error(`Invalid bond indices: [${a}, ${b}]`);
    }
  }
}
