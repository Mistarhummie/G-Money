import { slideBoard, type Board, type Dir } from "@/lib/games/arcade/g2048";

/**
 * Tiles with identities, so the board can show each tile sliding from where it was.
 * Purely visual: the game itself is played with `move` from the shared rules, and every
 * result here is checked against that board, falling back to a plain redraw if they ever differ.
 */

export type TileKind = "stay" | "move" | "merged" | "new" | "ghost";
/** `from` is where the tile starts this move's animation; `cell` is where it ends. Ghosts are the two halves of a merge. */
export type Tile = { id: number; value: number; cell: number; from: number; kind: TileKind };

const LINES: Record<Dir, number[][]> = {
  L: [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => r * 4 + c)),
  R: [0, 1, 2, 3].map((r) => [3, 2, 1, 0].map((c) => r * 4 + c)),
  U: [0, 1, 2, 3].map((c) => [0, 1, 2, 3].map((r) => r * 4 + c)),
  D: [0, 1, 2, 3].map((c) => [3, 2, 1, 0].map((r) => r * 4 + c)),
};

let nextId = 1;
const id = () => nextId++;

/** Every tile of a board, appearing as new (or standing still). */
export function tilesFor(board: Board, kind: TileKind = "new"): Tile[] {
  const out: Tile[] = [];
  board.forEach((value, cell) => {
    if (value) out.push({ id: id(), value, cell, from: cell, kind });
  });
  return out;
}

/** The tiles after sliding `dir` and the new tile landing, given the board the game produced. */
export function slideTiles(prev: Tile[], dir: Dir, next: Board): { tiles: Tile[]; merges: number[] } {
  const live = prev.filter((t) => t.kind !== "ghost");
  const byCell = new Map(live.map((t) => [t.cell, t]));
  const tiles: Tile[] = [];
  const merges: number[] = [];
  const slid: number[] = Array(16).fill(0);
  for (const line of LINES[dir]) {
    const ts = line.map((i) => byCell.get(i)).filter((t): t is Tile => !!t);
    let j = 0;
    for (let k = 0; k < ts.length; k++, j++) {
      const to = line[j];
      if (k + 1 < ts.length && ts[k].value === ts[k + 1].value) {
        const value = ts[k].value * 2;
        tiles.push({ ...ts[k], from: ts[k].cell, cell: to, kind: "ghost" }, { ...ts[k + 1], from: ts[k + 1].cell, cell: to, kind: "ghost" });
        tiles.push({ id: id(), value, cell: to, from: to, kind: "merged" });
        merges.push(value);
        slid[to] = value;
        k++;
      } else {
        tiles.push({ ...ts[k], from: ts[k].cell, cell: to, kind: ts[k].cell === to ? "stay" : "move" });
        slid[to] = ts[k].value;
      }
    }
  }
  // Check against the real rules; if anything disagrees, just show the new board.
  const prevBoard: number[] = Array(16).fill(0);
  for (const t of live) prevBoard[t.cell] = t.value;
  const real = slideBoard(prevBoard, dir);
  if (!real || real.board.some((v, i) => v !== slid[i])) return { tiles: tilesFor(next, "stay"), merges: [] };
  next.forEach((v, i) => {
    if (v && !slid[i]) tiles.push({ id: id(), value: v, cell: i, from: i, kind: "new" });
  });
  return { tiles, merges };
}

/** Neon look for each value: gradient, text colour and glow. */
export function tileStyle(v: number): { background: string; color: string; boxShadow: string } {
  const look: Record<number, [string, string, string, string]> = {
    2: ["#e0f2fe", "#bae6fd", "#0c4a6e", "56,189,248"],
    4: ["#d1fae5", "#6ee7b7", "#064e3b", "52,211,153"],
    8: ["#fef3c7", "#fbbf24", "#78350f", "251,191,36"],
    16: ["#fed7aa", "#f97316", "#ffffff", "249,115,22"],
    32: ["#fecdd3", "#f43f5e", "#ffffff", "244,63,94"],
    64: ["#fbcfe8", "#db2777", "#ffffff", "236,72,153"],
    128: ["#e9d5ff", "#9333ea", "#ffffff", "168,85,247"],
    256: ["#c7d2fe", "#4f46e5", "#ffffff", "99,102,241"],
    512: ["#bae6fd", "#0284c7", "#ffffff", "14,165,233"],
    1024: ["#99f6e4", "#0d9488", "#ffffff", "20,184,166"],
    2048: ["#fef9c3", "#f59e0b", "#422006", "250,204,21"],
  };
  const glow = (rgb: string) => {
    const k = Math.log2(v);
    return `0 0 ${4 + k * 2.2}px rgba(${rgb},${Math.min(0.85, 0.25 + k * 0.06)}), inset 0 2px 0 rgba(255,255,255,0.35)`;
  };
  const l = look[v];
  if (l) return { background: `linear-gradient(145deg, ${l[0]}, ${l[1]} 60%)`, color: l[2], boxShadow: glow(l[3]) };
  return {
    background: "linear-gradient(135deg, #f472b6, #facc15 35%, #34d399 65%, #38bdf8)",
    color: "#1e1b4b",
    boxShadow: glow("244,114,182"),
  };
}
