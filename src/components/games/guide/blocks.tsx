import type { Guide } from "./types";

// Piece colours match the game (I, O, T, S, Z, J, L).
const COLORS = ["#22d3ee", "#facc15", "#d946ef", "#4ade80", "#f43f5e", "#3b82f6", "#fb923c"];
const NAMES = ["I", "O", "T", "S", "Z", "J", "L"];
// Each piece as it first appears, [row, col].
const SHAPES: [number, number][][] = [
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 1], [1, 0], [1, 1], [1, 2]],
  [[0, 1], [0, 2], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 1], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [1, 2]],
  [[0, 2], [1, 0], [1, 1], [1, 2]],
];
const BOARD = "#0b1430";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";

type Cell = [row: number, col: number, type: number];

function Board({ x, y, cols, rows, size, cells }: { x: number; y: number; cols: number; rows: number; size: number; cells: Cell[] }) {
  let grid = "";
  for (let c = 1; c < cols; c++) grid += `M${x + c * size} ${y}v${rows * size}`;
  for (let r = 1; r < rows; r++) grid += `M${x} ${y + r * size}h${cols * size}`;
  return (
    <g>
      <rect x={x} y={y} width={cols * size} height={rows * size} rx={3} fill={BOARD} stroke="#e879f9" strokeOpacity={0.3} />
      <path d={grid} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
      {cells.map(([r, c, t]) => (
        <Block key={`${r}-${c}`} x={x + c * size} y={y + r * size} size={size} type={t} />
      ))}
    </g>
  );
}

function Block({ x, y, size, type }: { x: number; y: number; size: number; type: number }) {
  return (
    <g>
      <rect x={x + 0.5} y={y + 0.5} width={size - 1} height={size - 1} rx={size * 0.18} fill={COLORS[type]} />
      <rect x={x + 1.5} y={y + 1.2} width={size - 3} height={size * 0.22} rx={size * 0.1} fill="#fff" opacity={0.35} />
    </g>
  );
}

function Label({ x, y, children, color = TEXT, anchor = "middle" }: { x: number; y: number; children: string; color?: string; anchor?: "start" | "middle" }) {
  return (
    <text x={x} y={y} fill={color} fontSize={7} textAnchor={anchor} fontFamily="inherit">
      {children}
    </text>
  );
}

const piece = (type: number, row: number, col: number): Cell[] => SHAPES[type].map(([r, c]) => [row + r, col + c, type]);

const PiecesPicture = (() => {
  const S = 8;
  const slots: [number, number, number][] = [
    [0, 25, 4],
    [1, 75, 4],
    [2, 125, 4],
    [3, 175, 4],
    [4, 50, 40],
    [5, 100, 40],
    [6, 150, 40],
  ];
  return (
    <svg viewBox="0 0 200 72" width="100%" role="img" aria-label="The seven pieces: I, O, T, S, Z, J and L">
      {slots.map(([t, cx, top]) => {
        const w = (Math.max(...SHAPES[t].map(([, c]) => c)) + 1) * S;
        const x = cx - w / 2;
        return (
          <g key={t}>
            {SHAPES[t].map(([r, c]) => (
              <Block key={`${r}-${c}`} x={x + c * S} y={top + r * S + (t === 0 ? 4 : 0)} size={S} type={t} />
            ))}
            <Label x={cx} y={top + 27}>{NAMES[t]}</Label>
          </g>
        );
      })}
    </svg>
  );
})();

function Icon({ kind, cx, cy }: { kind: number; cx: number; cy: number }) {
  const line = { stroke: TEXT, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  switch (kind) {
    case 0:
      return <path d={`M${cx + 6} ${cy}H${cx - 6}M${cx - 2} ${cy - 4}L${cx - 6} ${cy}L${cx - 2} ${cy + 4}`} {...line} />;
    case 1:
      return <path d={`M${cx - 6} ${cy}H${cx + 6}M${cx + 2} ${cy - 4}L${cx + 6} ${cy}L${cx + 2} ${cy + 4}`} {...line} />;
    case 2:
      return (
        <g>
          <path d={`M${cx - 6} ${cy}A6 6 0 1 1 ${cx} ${cy + 6}`} {...line} />
          <path d={`M${cx - 3.5} ${cy + 6}L${cx + 1} ${cy + 2.5}L${cx + 1} ${cy + 9.5}Z`} fill={TEXT} />
        </g>
      );
    case 3:
      return <path d={`M${cx} ${cy - 6}V${cy + 6}M${cx - 4} ${cy + 2}L${cx} ${cy + 6}L${cx + 4} ${cy + 2}`} {...line} />;
    default:
      return <path d={`M${cx} ${cy - 7}V${cy + 3}M${cx - 4} ${cy - 1}L${cx} ${cy + 3}L${cx + 4} ${cy - 1}M${cx - 6} ${cy + 7}H${cx + 6}`} {...line} />;
  }
}

const ButtonsPicture = (
  <svg viewBox="0 0 220 56" width="100%" role="img" aria-label="The five buttons: left, right, rotate, down and drop">
    {["Left", "Right", "Rotate", "Down", "Drop"].map((name, i) => {
      const x = 4 + i * 43;
      return (
        <g key={name}>
          <rect x={x} y={4} width={38} height={30} rx={7} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" />
          <Icon kind={i} cx={x + 19} cy={19} />
          <Label x={x + 19} y={46}>{name}</Label>
        </g>
      );
    })}
  </svg>
);

// A stack with a 3-wide gap at the bottom, and a T falling towards it.
const STACK: Cell[] = [
  [11, 0, 5], [11, 1, 5], [11, 2, 3], [11, 6, 4], [11, 7, 1], [11, 8, 1], [11, 9, 0],
  [10, 0, 5], [10, 1, 3], [10, 7, 1], [10, 8, 1], [10, 9, 0],
  [9, 9, 0], [9, 0, 6],
];

const GhostPicture = (() => {
  const S = 7;
  const X = 6;
  const Y = 4;
  const ghost = piece(2, 10, 3);
  return (
    <svg viewBox="0 0 200 96" width="100%" role="img" aria-label="A falling T piece and its ghost outline showing where it will land">
      <Board x={X} y={Y} cols={10} rows={12} size={S} cells={[...STACK, ...piece(2, 2, 3)]} />
      {ghost.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={X + c * S + 1} y={Y + r * S + 1} width={S - 2} height={S - 2} rx={1.5} fill={COLORS[2]} fillOpacity={0.2} stroke={COLORS[2]} strokeDasharray="1.6 1.2" />
      ))}
      <path d={`M${X + 4.5 * S} ${Y + 4.4 * S}V${Y + 9.4 * S}`} stroke="#fde047" strokeWidth={1.2} strokeDasharray="2.5 2" />
      <path d={`M${X + 4.5 * S - 3} ${Y + 9.4 * S - 3}L${X + 4.5 * S} ${Y + 9.4 * S}L${X + 4.5 * S + 3} ${Y + 9.4 * S - 3}`} stroke="#fde047" strokeWidth={1.2} fill="none" />
      <path d={`M${X + 10 * S + 2} ${Y + 3 * S}H88`} stroke={MUTED} strokeWidth={0.6} />
      <Label x={92} y={Y + 3 * S + 2.5} anchor="start">The falling piece</Label>
      <path d={`M${X + 10 * S + 2} ${Y + 10.5 * S}H88`} stroke={MUTED} strokeWidth={0.6} />
      <Label x={92} y={Y + 10.5 * S - 2} anchor="start">Ghost outline: where</Label>
      <Label x={92} y={Y + 10.5 * S + 6} anchor="start">it lands if you drop it</Label>
    </svg>
  );
})();

// Two rows, each missing the same two cells; an O piece falls into the hole.
const BEFORE: Cell[] = [
  [2, 0, 5], [2, 5, 6],
  [3, 0, 5], [3, 1, 3], [3, 4, 0], [3, 5, 6],
  [4, 0, 5], [4, 1, 3], [4, 4, 0], [4, 5, 6],
];

const ClearPicture = (() => {
  const S = 10;
  return (
    <svg viewBox="0 0 196 80" width="100%" role="img" aria-label="An O piece fills the hole, two full rows disappear and the blocks above drop down">
      <Board x={8} y={6} cols={6} rows={5} size={S} cells={[...BEFORE, ...piece(1, 0, 2)]} />
      <path d="M38 27v7M34 30l4 4l4 -4" stroke="#fde047" strokeWidth={1.3} fill="none" strokeLinecap="round" />
      <path d="M78 31h30M103 27l5 4l-5 4" stroke={TEXT} strokeWidth={1.3} fill="none" strokeLinecap="round" />
      <Board x={124} y={6} cols={6} rows={5} size={S} cells={[[4, 0, 5], [4, 5, 6]]} />
      <text x={154} y={39} fill="#fde047" fontSize={8} fontWeight={700} textAnchor="middle" fontFamily="inherit">
        +300
      </text>
      <Label x={38} y={74}>O fills the hole</Label>
      <Label x={154} y={74}>Rows gone, rest drops</Label>
    </svg>
  );
})();

const guide: Guide = {
  intro:
    "Coloured pieces fall into a tall board one at a time. Move and turn them so they fill whole rows across. A full row disappears and scores points. Clear enough rows to pass the level, and don't let the pile reach the top.",
  sections: [
    {
      title: "The board and the pieces",
      body: [
        "The board is 10 cells wide and 20 cells tall.",
        "There are seven pieces, each made of four blocks: I, O, T, S, Z, J and L. They come in shuffled sets of seven, so you always get every piece once before any piece repeats.",
        "The box on the right marked Next shows the piece that comes after this one.",
        "Each level has a target number of rows to clear: 10, 15, 20, 25 and then 30.",
      ],
      picture: PiecesPicture,
      caption: "The seven pieces, in the colours you'll see in the game.",
    },
    {
      title: "Controls",
      body: [
        "Start the game by tapping the board or any button.",
        "Buttons under the board: Left and Right move the piece one cell, Rotate turns it a quarter turn clockwise, Down moves it down one row, and Drop sends it straight to the bottom.",
        "Hold Left, Right or Down to keep moving.",
        "Touch the board instead: drag sideways to move, drag down to push it down, flick down fast to drop, and tap to rotate.",
        "On a computer: ← → (or A, D) move, ↑ (or W, X) rotates, ↓ (or S) moves down, Space drops.",
        "Pieces only turn clockwise. If a piece is against a wall or another block, the game tries nudging it a cell or two sideways (or one up) so the turn still fits.",
      ],
      picture: ButtonsPicture,
      caption: "The five buttons under the board.",
    },
    {
      title: "Falling, landing and the ghost",
      body: [
        "The piece falls by itself, one row at a time. It falls faster at each level: about once every 0.6 seconds on level 1, and about 12 rows a second on level 5.",
        "A dotted outline (the ghost) shows exactly where the piece will land if you drop it.",
        "When a piece lands, you have about half a second to slide or turn it before it locks in place.",
        "Drop locks the piece at once, with no time to change your mind.",
      ],
      picture: GhostPicture,
      caption: "The ghost outline shows where the T will land.",
    },
    {
      title: "Clearing rows",
      body: [
        "When every cell in a row is filled, the row flashes and disappears.",
        "Everything above it moves down to fill the space.",
        "Clearing several rows with one piece scores much more: 2 at once is a Double, 3 a Triple, 4 a Quad (only the long I piece can do 4).",
      ],
      picture: ClearPicture,
      caption: "The O piece fills two rows at once. Both vanish and the blocks above drop down.",
    },
    {
      title: "Points",
      body: [
        "1 row: 100 points. 2 rows at once: 300. 3 rows: 500. 4 rows: 800.",
        "Row points are multiplied by the level number, so a Quad on level 3 is 2,400 points.",
        "Pushing a piece down with Down gives 1 point per row. Drop gives 2 points per row it falls.",
        "In tournaments the highest score wins; if two scores tie, the faster game wins.",
      ],
    },
    {
      title: "Winning and how the game ends",
      body: [
        "You clear the level once you reach the target number of rows. Give up becomes a green Finish button. Press it to stop, or keep playing for more points.",
        "The game is over when a new piece has no room at the top of the board. If you had already reached the target, the level still counts as cleared.",
        "Give up before the target ends the game without clearing the level.",
        "A game can last at most 30 minutes. You get a warning 1 minute and 10 seconds before the end, and when time is up your game is handed in as it stands.",
      ],
    },
  ],
  tips: [
    "Keep the pile low and flat. Bumps and holes are what fill the board up.",
    "Leave one column open at the side for the long I piece, then drop it in for a 4-row Quad.",
    "Look at the Next box and plan where that piece will go before the current one lands.",
    "Use the ghost outline and Drop to save time once a piece is lined up; on the fast levels it's safer than waiting.",
    "Don't cover a hole if you can help it: the row under it can't be cleared until the blocks above are gone.",
  ],
};

export default guide;
