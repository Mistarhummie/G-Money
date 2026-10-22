import type { Guide } from "./types";

// Each tile keeps a rainbow colour by its number, as in the game.
const hueOf = (v: number, size: number) => Math.round(200 + ((v - 1) / (size * size - 2)) * 250) % 360;
const TEXT = "#e2e8f0";

/** HSL to a hex colour (hex works in every SVG renderer). */
function hsl(h: number, s: number, l: number) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const MUTED = "#94a3b8";

function Label({ x, y, children, color = TEXT, anchor = "start", size = 7 }: { x: number; y: number; children: string; color?: string; anchor?: "start" | "middle"; size?: number }) {
  return (
    <text x={x} y={y} fill={color} fontSize={size} textAnchor={anchor} fontFamily="inherit">
      {children}
    </text>
  );
}

/**
 * A board drawn from its cells, row by row (0 is the gap). `n` sets the colours (the board's real
 * size), so a part of a 4×4 board can be drawn with the 4×4 colours.
 */
function Board({
  x,
  y,
  s,
  cells,
  cols,
  n = cols,
  dim = [],
  home = false,
}: {
  x: number;
  y: number;
  s: number;
  cells: number[];
  cols: number;
  n?: number;
  dim?: number[];
  /** Ring the tiles that are in their solved spot. */
  home?: boolean;
}) {
  const rows = Math.ceil(cells.length / cols);
  return (
    <g>
      <rect x={x - 2} y={y - 2} width={cols * s + 4} height={rows * s + 4} rx={s * 0.22} fill="#1a1238" stroke="rgba(255,255,255,0.12)" />
      {cells.map((v, i) => {
        if (!v) return null;
        const tx = x + (i % cols) * s;
        const ty = y + Math.floor(i / cols) * s;
        const h = hueOf(v, n);
        const atHome = home && v === Math.floor(i / cols) * n + (i % cols) + 1;
        return (
          <g key={v} opacity={dim.includes(v) ? 0.35 : 1}>
            <rect x={tx + 1} y={ty + 1} width={s - 2} height={s - 2} rx={s * 0.18} fill={hsl(h, 85, 55)} />
            {atHome && <rect x={tx + 1.6} y={ty + 1.6} width={s - 3.2} height={s - 3.2} rx={s * 0.16} fill="none" stroke="#fff" strokeOpacity={0.8} strokeWidth={1} />}
            <text x={tx + s / 2} y={ty + s / 2} dy="0.36em" fill="#fff" fontSize={s * 0.45} fontWeight={800} textAnchor="middle" fontFamily="inherit">
              {v}
            </text>
          </g>
        );
      })}
    </g>
  );
}

const arrow = (x1: number, y1: number, x2: number, y2: number, color = TEXT) => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p = (t: number) => `${x2 - 4 * Math.cos(a + t)} ${y2 - 4 * Math.sin(a + t)}`;
  return (
    <g>
      <path d={`M${x1} ${y1}L${x2} ${y2}`} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <path d={`M${x2} ${y2}L${p(0.5)}L${p(-0.5)}Z`} fill={color} />
    </g>
  );
};

const GoalPicture = (
  <svg viewBox="0 0 200 84" width="100%" role="img" aria-label="A shuffled 3 by 3 board and the same board solved: 1 to 8 in order with the gap bottom-right">
    <Board x={8} y={6} s={22} cols={3} cells={[4, 1, 3, 7, 2, 5, 0, 8, 6]} />
    {arrow(84, 39, 112, 39)}
    <Board x={124} y={6} s={22} cols={3} cells={[1, 2, 3, 4, 5, 6, 7, 8, 0]} home />
    <Label x={41} y={82} anchor="middle" color={MUTED}>Shuffled</Label>
    <Label x={157} y={82} anchor="middle">Solved</Label>
  </svg>
);

const MovePicture = (() => {
  const S = 24;
  const X = 6;
  const Y = 6;
  const c = (i: number): [number, number] => [X + (i % 3) * S + S / 2, Y + Math.floor(i / 3) * S + S / 2];
  const [gx, gy] = c(4);
  return (
    <svg viewBox="0 0 200 84" width="100%" role="img" aria-label="Only the tiles touching the gap, above, below, left or right, can slide into it">
      <Board x={X} y={Y} s={S} cols={3} cells={[6, 2, 8, 1, 0, 3, 7, 5, 4]} dim={[6, 8, 7, 4]} />
      {[1, 3, 5, 7].map((i) => {
        const [tx, ty] = c(i);
        return <g key={i}>{arrow(tx + (gx - tx) * 0.45, ty + (gy - ty) * 0.45, tx + (gx - tx) * 0.8, ty + (gy - ty) * 0.8, "#fde047")}</g>;
      })}
      <Label x={88} y={22}>Tiles touching the gap</Label>
      <Label x={88} y={31}>(above, below, left, right)</Label>
      <Label x={88} y={40}>can slide in. Tap one.</Label>
      <Label x={88} y={58} color={MUTED}>Corner tiles (faded) don&apos;t</Label>
      <Label x={88} y={67} color={MUTED}>touch the gap, so they</Label>
      <Label x={88} y={76} color={MUTED}>can&apos;t move yet.</Label>
    </svg>
  );
})();

const PlanPicture = (() => {
  const S = 18;
  const X = 6;
  const Y = 6;
  return (
    <svg viewBox="0 0 200 84" width="100%" role="img" aria-label="On a 4 by 4 board, finish the top row and the left column, and what is left is a 3 by 3 puzzle">
      <Board x={X} y={Y} s={S} cols={4} cells={[1, 2, 3, 4, 5, 11, 7, 12, 9, 6, 0, 8, 13, 15, 10, 14]} home />
      <rect x={X + S - 0.5} y={Y + S - 0.5} width={3 * S + 1} height={3 * S + 1} rx={4} fill="none" stroke="#fde047" strokeWidth={1.2} strokeDasharray="3 2" />
      <Label x={90} y={18}>1. Finish the top row.</Label>
      <Label x={90} y={30}>2. Then the left column.</Label>
      <Label x={90} y={46}>3. What&apos;s left (dotted) is a</Label>
      <Label x={90} y={55}>smaller puzzle. Solve it the</Label>
      <Label x={90} y={64}>same way, and never move the</Label>
      <Label x={90} y={73}>finished tiles again.</Label>
    </svg>
  );
})();

const LastTwoPicture = (() => {
  const S = 18;
  return (
    <svg viewBox="0 0 200 64" width="100%" role="img" aria-label="Put 4 where 3 goes and 3 under it, then slide 4 right and 3 up">
      <Board x={6} y={6} s={S} cols={4} n={4} cells={[1, 2, 4, 0, 9, 7, 3, 5]} home />
      {arrow(6 + 3 * S + 1, 6 + S / 2, 6 + 3 * S + 13, 6 + S / 2, "#fde047")}
      <Label x={42} y={60} anchor="middle" color={MUTED}>4 then 3: two taps</Label>
      {arrow(88, 24, 108, 24)}
      <Board x={118} y={6} s={S} cols={4} n={4} cells={[1, 2, 3, 4, 9, 7, 0, 5]} home />
      <Label x={154} y={60} anchor="middle">Top row done</Label>
    </svg>
  );
})();

const guide: Guide = {
  intro:
    "The numbered tiles have been mixed up. Slide them one at a time into the empty space until they are back in order: 1, 2, 3… left to right, top to bottom, with the gap in the bottom-right corner.",
  sections: [
    {
      title: "The goal",
      body: [
        "The board has one empty space (the gap). Tiles can only move by sliding into it.",
        "Put the numbers back in order, reading like a book: the top row first, left to right, then the next row, and so on.",
        "The finished board has the gap in the bottom-right corner.",
        "A tile in its correct spot gets a white glow. The counter above the board shows how many tiles are home, for example 5/8 home.",
        "Every board can be solved: it was mixed up using real slides from the solved position.",
      ],
      picture: GoalPicture,
      caption: "A mixed-up 3 × 3 board, and what it looks like solved.",
    },
    {
      title: "How to move",
      body: [
        "Tap a tile that is right next to the gap (above, below, left or right of it). It slides into the gap, and the gap moves to where the tile was.",
        "Tapping a tile that isn't touching the gap does nothing. Tiles never move diagonally, and only one tile moves at a time.",
        "On a computer, the arrow keys push a tile into the gap in that direction. For example ← slides the tile to the right of the gap into it.",
        "Each slide counts as one move. The move counter is above the board.",
      ],
      picture: MovePicture,
      caption: "The gap is in the middle. Only 2, 1, 3 and 5 can move into it.",
    },
    {
      title: "Solve it step by step",
      body: [
        "Don't try to fix everything at once. Finish the top row first, then leave it alone.",
        "On a 4 × 4 or 5 × 5 board, finish the left column next. What's left is a smaller board, which you solve the same way.",
        "On a 3 × 3 board, after the top row, solve the left column (4 and 7), then turn the last four tiles around until they fit.",
        "To move a tile somewhere, first walk the gap around to the spot in front of it, then slide the tile into the gap, step by step.",
      ],
      picture: PlanPicture,
      caption: "Top row and left column done: the rest is a 3 × 3 puzzle.",
    },
    {
      title: "The last two tiles of a row",
      body: [
        "The last two tiles of a row are the tricky part, because putting one in place often knocks the other out.",
        "The trick (shown on a 4 × 4 board): put the 4 where the 3 should go, and put the 3 straight under it.",
        "Then bring the gap to the top-right corner. Slide 4 right into the corner, then slide 3 up. The row is done.",
        "The same trick works for the last two tiles of a column, turned on its side.",
      ],
      picture: LastTwoPicture,
      caption: "Left: 4 sits in 3's spot with 3 below. Slide 4 right, then 3 up.",
    },
    {
      title: "Stages, time and moves",
      body: [
        "1. 3 × 3. 2. 3 × 3 sprint: solve it in 45 seconds. 3. 4 × 4. 4. 4 × 4 sprint: solve it in 2½ minutes. 5. 5 × 5.",
        "The ⏱ clock at the top starts when the board appears. On sprint stages you get a warning 10 seconds before the time is up.",
        "On a sprint you can keep playing after the time is up, but a late solve doesn't clear the stage.",
        "The game ends by itself the moment the board is solved. Give up ends it without clearing.",
        "Every game must be finished within 15 minutes.",
        "In tournaments the fastest solve wins; if two times tie, the one with fewer moves wins.",
      ],
    },
  ],
  tips: [
    "Plan the route of the gap, not the tile: the gap has to go around a tile to push it where you want.",
    "Once a row or column is finished, don't break it up again. Do the rest of the work below and to the right of it.",
    "Practise the normal stage first. The sprint is the same puzzle size with a clock, so the moves you learn carry over.",
    "Fast, small taps beat long thinking on the sprints. Most solves follow the same pattern every time.",
  ],
};

export default guide;
