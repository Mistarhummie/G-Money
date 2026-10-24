import type { ReactNode } from "react";
import type { Guide } from "./types";

// Colours match the game: a blue frame with dark holes, green discs for you, amber for the computer.
const FRAME = "#2f5ae0";
const FRAME_EDGE = "#172c80";
const HOLE = "#0b1430";
const GREEN = "#10b981";
const GREEN_EDGE = "#064e3b";
const AMBER = "#fbbf24";
const AMBER_EDGE = "#9a3412";
const WIN = "#ffffff";
const RING = "#f43f5e";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";

/** A disc: [col, row] with row 0 at the bottom (as in the game), and 1 = you, 2 = the computer. */
type Disc = [col: number, row: number, who: 1 | 2];

type Grid = { x: number; y: number; s: number; cols: number; rows: number };

/** Centre of a cell, row 0 at the bottom. */
const centre = (g: Grid, col: number, row: number): [number, number] => [g.x + col * g.s + g.s / 2, g.y + (g.rows - 1 - row) * g.s + g.s / 2];

function Board({ g, discs, win = [], ghost }: { g: Grid; discs: Disc[]; win?: [number, number][]; ghost?: Disc }) {
  const holes: ReactNode[] = [];
  for (let c = 0; c < g.cols; c++)
    for (let r = 0; r < g.rows; r++) {
      const [x, y] = centre(g, c, r);
      holes.push(<circle key={`${c}-${r}`} cx={x} cy={y} r={g.s * 0.38} fill={HOLE} />);
    }
  const pad = g.s * 0.12;
  return (
    <g>
      <rect x={g.x - pad} y={g.y - pad} width={g.cols * g.s + 2 * pad} height={g.rows * g.s + 2 * pad} rx={g.s * 0.25} fill={FRAME} stroke={FRAME_EDGE} strokeWidth={g.s * 0.06} />
      {holes}
      {discs.map(([c, r, who]) => (
        <Piece key={`${c}-${r}`} g={g} col={c} row={r} who={who} />
      ))}
      {ghost && <Piece g={g} col={ghost[0]} row={ghost[1]} who={ghost[2]} dashed />}
      {win.map(([c, r]) => {
        const [x, y] = centre(g, c, r);
        return <circle key={`w${c}-${r}`} cx={x} cy={y} r={g.s * 0.42} fill="none" stroke={WIN} strokeWidth={g.s * 0.08} />;
      })}
    </g>
  );
}

function Piece({ g, col, row, who, dashed }: { g: Grid; col: number; row: number; who: 1 | 2; dashed?: boolean }) {
  const [x, y] = centre(g, col, row);
  return <DiscAt x={x} y={y} r={g.s * 0.36} who={who} dashed={dashed} />;
}

function DiscAt({ x, y, r, who, dashed }: { x: number; y: number; r: number; who: 1 | 2; dashed?: boolean }) {
  return (
    <g opacity={dashed ? 0.75 : 1}>
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={who === 1 ? GREEN : AMBER}
        fillOpacity={dashed ? 0.45 : 1}
        stroke={who === 1 ? GREEN_EDGE : AMBER_EDGE}
        strokeWidth={r * 0.14}
        strokeDasharray={dashed ? `${r * 0.35} ${r * 0.25}` : undefined}
      />
      {!dashed && <circle cx={x} cy={y} r={r * 0.62} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={r * 0.1} />}
    </g>
  );
}

// ---------------------------------------------------------------- pictures

/** Four little boards, one for each direction a line of four can run. */
function LinesPicture() {
  const s = 22;
  const size = 4 * s;
  const gap = 24;
  const boards: { name: string; discs: Disc[]; win: [number, number][] }[] = [
    {
      name: "Across",
      discs: [[0, 0, 1], [1, 0, 1], [2, 0, 1], [3, 0, 1], [1, 1, 2], [2, 1, 2]],
      win: [[0, 0], [1, 0], [2, 0], [3, 0]],
    },
    {
      name: "Up",
      discs: [[1, 0, 1], [1, 1, 1], [1, 2, 1], [1, 3, 1], [2, 0, 2], [0, 0, 2], [2, 1, 2]],
      win: [[1, 0], [1, 1], [1, 2], [1, 3]],
    },
    {
      name: "Diagonal",
      discs: [[0, 0, 1], [1, 1, 1], [2, 2, 1], [3, 3, 1], [1, 0, 2], [2, 0, 2], [3, 0, 1], [2, 1, 1], [3, 1, 2], [3, 2, 2]],
      win: [[0, 0], [1, 1], [2, 2], [3, 3]],
    },
    {
      name: "Diagonal",
      discs: [[0, 3, 1], [1, 2, 1], [2, 1, 1], [3, 0, 1], [0, 0, 2], [0, 1, 2], [0, 2, 1], [1, 0, 1], [1, 1, 2], [2, 0, 2]],
      win: [[0, 3], [1, 2], [2, 1], [3, 0]],
    },
  ];
  return (
    <svg viewBox={`-4 -4 ${2 * size + gap + 8} ${2 * size + 52}`} width="100%" role="img" aria-label="Four in a row across, up, or along a diagonal">
      {boards.map((b, i) => {
        const g: Grid = { x: (i % 2) * (size + gap), y: Math.floor(i / 2) * (size + 26), s, cols: 4, rows: 4 };
        return (
          <g key={i}>
            <Board g={g} discs={b.discs} win={b.win} />
            <text x={g.x + size / 2} y={g.y + size + 16} textAnchor="middle" fontSize={11} fill={TEXT}>
              {b.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Tap a column: the disc drops to the lowest empty space. */
function DropPicture() {
  const g: Grid = { x: 6, y: 44, s: 30, cols: 7, rows: 6 };
  const discs: Disc[] = [
    [3, 0, 2],
    [3, 1, 1],
    [2, 0, 1],
    [4, 0, 2],
  ];
  const [hx] = centre(g, 3, 5);
  const [, ly] = centre(g, 3, 2);
  return (
    <svg viewBox="0 0 222 246" width="100%" role="img" aria-label="Tap a column and the disc falls to the lowest free space">
      <defs>
        <marker id="c4-arrow-drop" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0L10 5L0 10z" fill={GREEN} />
        </marker>
      </defs>
      <DiscAt x={hx} y={18} r={11} who={1} />
      <Board g={g} discs={discs} ghost={[3, 2, 1]} />
      <rect x={g.x + 3 * g.s} y={g.y - 4} width={g.s} height={g.rows * g.s + 8} rx={8} fill="rgba(255,255,255,0.14)" />
      <line x1={hx} y1={34} x2={hx} y2={ly - 16} stroke={GREEN} strokeWidth={3} strokeDasharray="5 4" markerEnd="url(#c4-arrow-drop)" />
      {[1, 2, 3, 4, 5, 6, 7].map((n, i) => (
        <text key={n} x={g.x + i * g.s + g.s / 2} y={242} textAnchor="middle" fontSize={10} fill={i === 3 ? GREEN : MUTED}>
          {n}
        </text>
      ))}
    </svg>
  );
}

/** Amber has three in a row with one open end: block it now. */
function BlockPicture() {
  const g: Grid = { x: 6, y: 34, s: 30, cols: 7, rows: 6 };
  const discs: Disc[] = [
    [0, 0, 1],
    [1, 0, 2],
    [2, 0, 2],
    [3, 0, 2],
    [2, 1, 1],
    [3, 1, 1],
  ];
  const [bx] = centre(g, 4, 0);
  return (
    <svg viewBox="0 0 222 236" width="100%" role="img" aria-label="Block the computer's three in a row">
      <DiscAt x={bx} y={14} r={11} who={1} />
      <Board g={g} discs={discs} ghost={[4, 0, 1]} />
      <line x1={bx} y1={28} x2={bx} y2={g.y + 5 * g.s} stroke={GREEN} strokeWidth={3} strokeDasharray="5 4" />
      {[1, 2, 3].map((c) => {
        const [x, y] = centre(g, c, 0);
        return <circle key={c} cx={x} cy={y} r={g.s * 0.44} fill="none" stroke={AMBER} strokeWidth={2} strokeDasharray="4 3" />;
      })}
      <text x={111} y={232} textAnchor="middle" fontSize={11} fill={MUTED}>
        Drop in column 5 to stop amber’s four
      </text>
    </svg>
  );
}

/** Don't fill the space just under the computer's winning space. */
function UnderPicture() {
  const g: Grid = { x: 6, y: 6, s: 30, cols: 7, rows: 6 };
  const discs: Disc[] = [
    [0, 0, 1],
    [0, 1, 1],
    [0, 2, 2],
    [1, 0, 2],
    [1, 1, 1],
    [1, 2, 2],
    [2, 0, 1],
    [2, 1, 2],
    [2, 2, 2],
    [3, 0, 1],
  ];
  const [tx, ty] = centre(g, 3, 2);
  const [ux, uy] = centre(g, 3, 1);
  return (
    <svg viewBox="0 0 222 226" width="100%" role="img" aria-label="Don't drop just under the computer's winning space">
      <Board g={g} discs={discs} />
      <circle cx={tx} cy={ty} r={g.s * 0.42} fill="none" stroke={AMBER} strokeWidth={3} strokeDasharray="5 3" />
      <path d={`M${ux - 8} ${uy - 8}L${ux + 8} ${uy + 8}M${ux + 8} ${uy - 8}L${ux - 8} ${uy + 8}`} stroke={RING} strokeWidth={4} strokeLinecap="round" />
      <text x={111} y={204} textAnchor="middle" fontSize={11} fill={AMBER}>
        ◌ amber wins if it can drop here
      </text>
      <text x={111} y={220} textAnchor="middle" fontSize={11} fill={RING}>
        ✕ so don’t fill the space under it
      </text>
    </svg>
  );
}

const guide: Guide = {
  intro:
    "Connect Four against the computer. Take turns dropping discs into the board. The first to get four of their discs in a line wins.",
  sections: [
    {
      title: "The goal: four in a row",
      body: [
        "The board has 7 columns and 6 rows. You are green and drop first; the computer is amber.",
        "Get four of your discs in a straight line with no gaps: across, straight up, or along either diagonal.",
        "When someone gets four, the winning discs light up and the game ends.",
      ],
      picture: <LinesPicture />,
      caption: "The four ways to win. Diagonals are the easiest to miss, for you and for the computer!",
    },
    {
      title: "Dropping a disc",
      body: [
        "When it says “Your turn: tap a column”, tap anywhere in a column. Your disc falls to the lowest empty space in it.",
        "A full column can't be used. You can't skip a turn.",
        "The computer then thinks for a moment. Its amber disc hovers over the column it picked, then drops.",
        "On a computer: press 1–7 to drop in that column, or move with ← → and press Enter, Space or ↓.",
      ],
      picture: <DropPicture />,
      caption: "Tap column 4: the disc lands on top of the discs already there.",
    },
    {
      title: "Block the computer",
      body: [
        "After every computer move, look for three amber discs in a line with an empty space at the end. If that space can be played now, drop your disc there or the computer wins next turn.",
        "Check all four directions, especially diagonals.",
        "If the computer has two different spaces that would win at once, you can only block one. Stop it before it gets that far.",
      ],
      picture: <BlockPicture />,
      caption: "Amber has three across the bottom (dashed). Green must block the open end.",
    },
    {
      title: "Think one move ahead",
      body: [
        "A space only matters when a disc can land in it, which means the space below must be filled first.",
        "If the computer needs a space that is floating in the air, don't drop a disc right under it: you would give it the step it needs.",
        "Do the same to the computer: build a line of three whose missing space is high up, so it can't safely play under it either.",
      ],
      picture: <UnderPicture />,
      caption: "Amber needs the ringed space. A green disc in column 4 now would let amber land there and win.",
    },
    {
      title: "Winning, draws and points",
      body: [
        "Win: your stage × 1,000 plus a speed bonus of up to 999. The fewer discs you need, the bigger the bonus: the full 999 for a win with 4 discs, about 55 less for each extra disc, down to 0 at 22 discs.",
        "Draw (all 42 spaces filled with no four in a row): stage × 100, and the stage is not cleared.",
        "Loss or Give up: 0 points.",
        "You have 30 minutes for a game. A win after the time limit does not clear the stage.",
        "The computer gets sharper each stage, from Beginner (often plays a random column) to Master (looks 9 moves ahead).",
      ],
    },
  ],
  tips: [
    "Start in the middle column. A disc there can be part of more lines than one on the edge.",
    "Before every move, check: can I win now? If not, must I block now? Only then make your plan.",
    "Try to make two threats at once (for example three across and three on a diagonal). The computer can only block one.",
    "Don't just copy the computer's moves. Make your own lines of three where the missing space is still high up.",
  ],
};

export default guide;
