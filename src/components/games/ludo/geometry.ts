import { BASE, HOME, LAST_TRACK, TRACK, startOf, type Colour, type LudoState } from "@/lib/ludo/rules";

/**
 * Where everything sits on the 15×15 board, in board units (one square = 1, origin top-left).
 * Red's corner is drawn top-left; the other colours are the same drawing turned 90° clockwise each.
 */

export type Pt = { x: number; y: number };

/** [row, col] of each of the 52 track squares, starting at red's start square and going clockwise. */
export const TRACK_CELLS: [number, number][] = (() => {
  const cells: [number, number][] = [];
  const run = (r0: number, c0: number, dr: number, dc: number, n: number) => {
    for (let i = 0; i < n; i++) cells.push([r0 + dr * i, c0 + dc * i]);
  };
  run(6, 1, 0, 1, 5); // red arm, along row 6
  run(5, 6, -1, 0, 6); // up the left side of the top arm
  run(0, 7, 0, 1, 1);
  run(0, 8, 1, 0, 6); // down the right side of the top arm (green's start at row 1)
  run(6, 9, 0, 1, 6);
  run(7, 14, 0, 1, 1);
  run(8, 14, 0, -1, 6); // yellow's start at col 13
  run(9, 8, 1, 0, 6);
  run(14, 7, 0, 1, 1);
  run(14, 6, -1, 0, 6); // blue's start at row 13
  run(8, 5, 0, -1, 6);
  run(7, 0, 0, 1, 1);
  run(6, 0, 0, 1, 1);
  if (cells.length !== TRACK) throw new Error("Ludo track must have 52 squares");
  return cells;
})();

const C = 7.5;
/** Turns a point drawn for red's corner round to colour `c`'s corner. */
export function turn(p: Pt, c: number): Pt {
  let { x, y } = p;
  for (let i = 0; i < c; i++) [x, y] = [C - (y - C), C + (x - C)];
  return { x, y };
}

const centreOf = ([r, c]: [number, number]): Pt => ({ x: c + 0.5, y: r + 0.5 });

/** Red's four base spots; the other colours turn these. */
const BASE_SPOTS: Pt[] = [
  { x: 2, y: 2 },
  { x: 4, y: 2 },
  { x: 2, y: 4 },
  { x: 4, y: 4 },
];
/** Red's home triangle spots (the triangle's point is at the centre). */
const HOME_SPOTS: Pt[] = [
  { x: 6.42, y: 7.05 },
  { x: 6.42, y: 7.95 },
  { x: 6.85, y: 7.28 },
  { x: 6.85, y: 7.72 },
];

export const baseSpot = (c: Colour, token: number) => turn(BASE_SPOTS[token], c);
export const homeSpot = (c: Colour, token: number) => turn(HOME_SPOTS[token], c);
/** Centre of colour c's home column square k (0–4, outer to inner). */
export const columnCell = (c: Colour, k: number) => turn({ x: 1.5 + k, y: 7.5 }, c);
export const trackCell = (sq: number) => centreOf(TRACK_CELLS[sq]);

/** Centre of the square a token at `progress` stands on (not counting other tokens on it). */
export function spotOf(c: Colour, token: number, progress: number): Pt {
  if (progress === BASE) return baseSpot(c, token);
  if (progress >= HOME) return homeSpot(c, token);
  if (progress > LAST_TRACK) return columnCell(c, progress - LAST_TRACK - 1);
  return trackCell((startOf(c) + progress) % TRACK);
}

export type Placed = Pt & { scale: number };

/**
 * Every token's drawn position. Tokens sharing a square are nudged apart and shrunk so all of them
 * stay visible and tappable.
 */
export function layout(s: LudoState): Placed[][] {
  const groups = new Map<string, [number, number][]>();
  const raw = s.tokens.map((row, seat) =>
    row.map((p, t) => {
      const pt = spotOf(s.setup.colours[seat], t, p);
      if (p !== BASE && p < HOME) {
        const key = `${pt.x},${pt.y}`;
        groups.set(key, [...(groups.get(key) ?? []), [seat, t]]);
      }
      return { ...pt, scale: p >= HOME ? 0.62 : 1 };
    }),
  );
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const offsets =
      members.length === 2
        ? [
            [-0.17, -0.06],
            [0.17, 0.06],
          ]
        : [
            [-0.18, -0.18],
            [0.18, -0.18],
            [-0.18, 0.18],
            [0.18, 0.18],
          ];
    members.forEach(([seat, t], i) => {
      const [dx, dy] = offsets[i % offsets.length];
      const p = raw[seat][t];
      raw[seat][t] = { x: p.x + dx, y: p.y + dy, scale: members.length === 2 ? 0.78 : 0.64 };
    });
  }
  return raw;
}
