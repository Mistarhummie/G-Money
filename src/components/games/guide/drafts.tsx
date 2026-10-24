import type { ReactNode } from "react";
import type { Guide } from "./types";

// Colours match the game: pale maple and walnut squares, green discs for you, amber for the computer,
// gold crowns on kings, glowing green dots for landing squares.
const LIGHT = "#ecd09a";
const DARK = "#7d4d26";
const GREEN = "#10b981";
const GREEN_EDGE = "#064e3b";
const AMBER = "#f59e0b";
const AMBER_EDGE = "#92400e";
const GOLD = "#fde047";
const DOT = "#6ee7b7";
const PATH = "#34d399";
const RING = "#f43f5e";
const MUTED = "#94a3b8";

type Cell = [row: number, col: number];
/** A piece: 1 your man, 2 your king, -1 computer man, -2 computer king. */
type Piece = [row: number, col: number, v: number];

/** A playing (dark) square? Same rule as the game: row + col is odd. */
const playable = (r: number, c: number) => (r + c) % 2 === 1;

/**
 * A patch of the board, rows `row0`..`row0 + rows - 1` and columns `col0`.. of the real 8x8 board,
 * so the square colours are right. Cells passed to the helpers below use real board rows and columns.
 */
type Patch = { x: number; y: number; s: number; row0: number; col0: number; rows: number; cols: number };

const centre = (p: Patch, [r, c]: Cell): [number, number] => [p.x + (c - p.col0) * p.s + p.s / 2, p.y + (r - p.row0) * p.s + p.s / 2];

function Squares({ p }: { p: Patch }) {
  const cells: ReactNode[] = [];
  for (let r = p.row0; r < p.row0 + p.rows; r++)
    for (let c = p.col0; c < p.col0 + p.cols; c++)
      cells.push(
        <rect key={`${r}-${c}`} x={p.x + (c - p.col0) * p.s} y={p.y + (r - p.row0) * p.s} width={p.s} height={p.s} fill={playable(r, c) ? DARK : LIGHT} />,
      );
  return (
    <g>
      {cells}
      <rect x={p.x} y={p.y} width={p.cols * p.s} height={p.rows * p.s} fill="none" stroke="#2a160a" strokeWidth={p.s * 0.08} />
    </g>
  );
}

function Disc({ p, at: [r, c, v], ring, faded }: { p: Patch; at: Piece; ring?: boolean; faded?: boolean }) {
  const [x, y] = centre(p, [r, c]);
  const mine = v > 0;
  const rad = p.s * 0.38;
  return (
    <g opacity={faded ? 0.4 : 1}>
      <circle cx={x} cy={y + p.s * 0.05} r={rad} fill="rgba(0,0,0,0.35)" />
      <circle cx={x} cy={y} r={rad} fill={mine ? GREEN : AMBER} stroke={mine ? GREEN_EDGE : AMBER_EDGE} strokeWidth={p.s * 0.06} />
      <circle cx={x} cy={y} r={rad * 0.6} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={p.s * 0.04} />
      {Math.abs(v) === 2 && (
        <text x={x} y={y + p.s * 0.02} textAnchor="middle" dominantBaseline="central" fontSize={p.s * 0.42} fill={GOLD} stroke="#713f12" strokeWidth={p.s * 0.03} paintOrder="stroke">
          ♛︎
        </text>
      )}
      {ring && <circle cx={x} cy={y} r={rad + p.s * 0.06} fill="none" stroke="#fff" strokeWidth={p.s * 0.08} />}
    </g>
  );
}

function Dot({ p, at }: { p: Patch; at: Cell }) {
  const [x, y] = centre(p, at);
  return <circle cx={x} cy={y} r={p.s * 0.17} fill={DOT} fillOpacity={0.9} />;
}

function Cross({ p, at }: { p: Patch; at: Cell }) {
  const [x, y] = centre(p, at);
  const d = p.s * 0.18;
  return <path d={`M${x - d} ${y - d}L${x + d} ${y + d}M${x + d} ${y - d}L${x - d} ${y + d}`} stroke={RING} strokeWidth={p.s * 0.08} strokeLinecap="round" />;
}

/** A small number in a circle, for the order of taps. */
function Step({ p, at, n }: { p: Patch; at: Cell; n: number }) {
  const [x, y] = centre(p, at);
  return (
    <g>
      <circle cx={x + p.s * 0.3} cy={y - p.s * 0.3} r={p.s * 0.2} fill="#0f172a" stroke={PATH} strokeWidth={p.s * 0.04} />
      <text x={x + p.s * 0.3} y={y - p.s * 0.29} textAnchor="middle" dominantBaseline="central" fontSize={p.s * 0.26} fontWeight={700} fill={PATH}>
        {n}
      </text>
    </g>
  );
}

/** A jump arc from one square to another. */
function Jump({ p, from, to, id }: { p: Patch; from: Cell; to: Cell; id: string }) {
  const [x1, y1] = centre(p, from);
  const [x2, y2] = centre(p, to);
  // Bend the arc to one side of the straight line.
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.25;
  const my = (y1 + y2) / 2 - (x2 - x1) * 0.25;
  return <path d={`M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`} fill="none" stroke={PATH} strokeWidth={p.s * 0.08} strokeDasharray={`${p.s * 0.18} ${p.s * 0.1}`} markerEnd={`url(#${id})`} />;
}

function Arrowhead({ id }: { id: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill={PATH} />
    </marker>
  );
}

// ---------------------------------------------------------------- pictures

function StartPicture() {
  const p: Patch = { x: 0, y: 18, s: 28, row0: 0, col0: 0, rows: 8, cols: 8 };
  const pieces: Piece[] = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if (!playable(r, c)) continue;
      if (r < 3) pieces.push([r, c, -1]);
      if (r > 4) pieces.push([r, c, 1]);
    }
  return (
    <svg viewBox="0 0 224 262" width="100%" role="img" aria-label="The starting position">
      <text x={112} y={12} textAnchor="middle" fontSize={11} fill={AMBER}>
        Computer (amber) moves down
      </text>
      <Squares p={p} />
      {pieces.map((pc) => (
        <Disc key={pc.join()} p={p} at={pc} />
      ))}
      <text x={112} y={256} textAnchor="middle" fontSize={11} fill={PATH}>
        You (green) move up ↑ and go first
      </text>
    </svg>
  );
}

function StepPicture() {
  const p: Patch = { x: 0, y: 0, s: 40, row0: 3, col0: 0, rows: 4, cols: 5 };
  return (
    <svg viewBox="0 0 200 176" width="100%" role="img" aria-label="A man steps one square diagonally forward">
      <Squares p={p} />
      <Dot p={p} at={[4, 1]} />
      <Dot p={p} at={[4, 3]} />
      <Cross p={p} at={[6, 1]} />
      <Cross p={p} at={[6, 3]} />
      <Disc p={p} at={[5, 2, 1]} ring />
      <text x={100} y={172} textAnchor="middle" fontSize={11} fill={MUTED}>
        <tspan fill={DOT}>● forward</tspan>
        <tspan dx={14} fill={RING}>✕ never back</tspan>
      </text>
    </svg>
  );
}

function CapturePicture() {
  const p: Patch = { x: 0, y: 0, s: 34, row0: 2, col0: 0, rows: 6, cols: 6 };
  return (
    <svg viewBox="0 0 204 222" width="100%" role="img" aria-label="A man can capture forwards or backwards">
      <defs>
        <Arrowhead id="dr-arrow-cap" />
      </defs>
      <Squares p={p} />
      <Disc p={p} at={[4, 3, -1]} />
      <Disc p={p} at={[6, 1, -1]} />
      <Disc p={p} at={[5, 2, 1]} ring />
      <Jump p={p} from={[5, 2]} to={[3, 4]} id="dr-arrow-cap" />
      <Jump p={p} from={[5, 2]} to={[7, 0]} id="dr-arrow-cap" />
      <Dot p={p} at={[3, 4]} />
      <Dot p={p} at={[7, 0]} />
      <text x={102} y={218} textAnchor="middle" fontSize={11} fill={MUTED}>
        You must capture: pick either jump
      </text>
    </svg>
  );
}

function ChainPicture() {
  const p: Patch = { x: 0, y: 0, s: 28, row0: 1, col0: 0, rows: 7, cols: 8 };
  const path: Cell[] = [
    [6, 1],
    [4, 3],
    [2, 5],
    [4, 7],
  ];
  return (
    <svg viewBox="0 0 224 214" width="100%" role="img" aria-label="A triple jump">
      <defs>
        <Arrowhead id="dr-arrow-chain" />
      </defs>
      <Squares p={p} />
      <Disc p={p} at={[5, 2, -1]} />
      <Disc p={p} at={[3, 4, -1]} />
      <Disc p={p} at={[3, 6, -1]} />
      <Disc p={p} at={[2, 1, -1]} />
      <Disc p={p} at={[6, 1, 1]} ring />
      {path.slice(1).map((to, i) => (
        <Jump key={i} p={p} from={path[i]} to={to} id="dr-arrow-chain" />
      ))}
      {path.slice(1).map((cell, i) => (
        <Step key={i} p={p} at={cell} n={i + 1} />
      ))}
      <text x={112} y={210} textAnchor="middle" fontSize={11} fill={MUTED}>
        Tap 1, 2, 3: three pieces in one turn
      </text>
    </svg>
  );
}

function KingPicture() {
  const p: Patch = { x: 0, y: 0, s: 26, row0: 0, col0: 0, rows: 8, cols: 8 };
  return (
    <svg viewBox="0 0 208 226" width="100%" role="img" aria-label="A flying king captures from a distance">
      <defs>
        <Arrowhead id="dr-arrow-king" />
      </defs>
      <Squares p={p} />
      <Disc p={p} at={[3, 4, -1]} />
      <Disc p={p} at={[1, 2, -1]} />
      <Disc p={p} at={[6, 5, -1]} />
      <Jump p={p} from={[6, 1]} to={[2, 5]} id="dr-arrow-king" />
      <Dot p={p} at={[2, 5]} />
      <Dot p={p} at={[1, 6]} />
      <Dot p={p} at={[0, 7]} />
      <Disc p={p} at={[6, 1, 2]} ring />
      <text x={104} y={222} textAnchor="middle" fontSize={11} fill={MUTED}>
        Fly, jump, and stop on any dot
      </text>
    </svg>
  );
}

function BlockedPicture() {
  const p: Patch = { x: 40, y: 0, s: 40, row0: 5, col0: 0, rows: 3, cols: 3 };
  return (
    <svg viewBox="0 0 200 150" width="100%" role="img" aria-label="A blocked computer man">
      <Squares p={p} />
      <Disc p={p} at={[5, 0, -1]} />
      <Disc p={p} at={[6, 1, 1]} />
      <Disc p={p} at={[7, 2, 1]} />
      <text x={100} y={138} textAnchor="middle" fontSize={11} fill={MUTED}>
        Amber can’t step or jump: it is stuck
      </text>
    </svg>
  );
}

const guide: Guide = {
  intro:
    "Drafts (draughts) the way it is played in East Africa, against the computer. You are green and move first. Win by capturing all the computer's pieces or by leaving it with no move.",
  sections: [
    {
      title: "The board and pieces",
      body: [
        "The board has 8 × 8 squares, and pieces only ever stand on the dark squares.",
        "Each side starts with 12 men. Yours are green on the bottom three rows and move up the board. The computer's are amber at the top and move down.",
        "You move first, then you take turns. The numbers at the top show how many pieces each side has left.",
      ],
      picture: <StartPicture />,
      caption: "The starting position.",
    },
    {
      title: "Moving a man",
      body: [
        "A man steps one square diagonally forward, onto an empty dark square. It never steps backwards.",
        "Tap your man (it gets a white ring), then tap one of the glowing dots. Your men that can move have a faint ring.",
        "Tap the man again to put it down and pick another.",
        "On a computer you can use the arrow keys and Enter instead (Esc cancels).",
      ],
      picture: <StepPicture />,
      caption: "A man steps diagonally forward only.",
    },
    {
      title: "Capturing (it's compulsory)",
      body: [
        "If an enemy piece is diagonally next to yours with an empty square right behind it, you jump over it and it is captured.",
        "In our drafts, men capture both forwards and backwards.",
        "Capturing is compulsory: if you can capture, you must. The status says “You must capture” and the pieces that can capture pulse.",
        "If you have more than one capture, you may pick any of them. You don't have to take the biggest one.",
      ],
      picture: <CapturePicture />,
      caption: "This man can jump forwards or backwards. One of the two jumps must be made.",
    },
    {
      title: "Chains of jumps",
      body: [
        "If, after a jump, your piece can jump again from where it landed, it must keep jumping in the same turn. You can change direction between jumps.",
        "Tap each landing square in turn. Once only one way is left, the rest of the move finishes by itself.",
        "The pieces you jump fade out and are only removed when the move ends, so you can't jump the same piece twice and they still block the way until then.",
      ],
      picture: <ChainPicture />,
      caption: "A triple jump: forwards, forwards, then backwards.",
    },
    {
      title: "Kings fly",
      body: [
        "A man that ends its move on the far row becomes a king and gets a gold crown. Just passing over the far row in the middle of a chain does not count.",
        "A king “flies”: it moves any number of empty squares along a diagonal, forwards or backwards.",
        "A king captures from a distance too: it flies along a diagonal to an enemy piece, jumps it, and can land on any empty square beyond it. It must keep jumping if it can.",
        "The computer's kings can do the same, so watch the long diagonals.",
      ],
      picture: <KingPicture />,
      caption: "The king takes the amber man from far away and may stop on any of the three dots.",
    },
    {
      title: "Winning, draws and points",
      body: [
        "You win when the computer cannot move: all its pieces are captured or every one is blocked. (The same goes for you, so don't get stuck!)",
        "It's a draw after 40 moves each with only kings moving and nothing captured, or after 100 moves each in total.",
        "Win: your stage × 1,000 plus a speed bonus of up to 999 (1,100 minus 15 for each move you made). Draw: stage × 100, and the stage is not cleared. Loss or Resign: 0.",
        "You have 30 minutes for a game. A win after the time limit does not clear the stage.",
      ],
      picture: <BlockedPicture />,
      caption: "A blocked piece. When none of the computer's pieces can move, you win.",
    },
  ],
  tips: [
    "Because captures are compulsory, the computer can offer you a piece to pull your man out of place and then take two back. Look one move ahead before every capture.",
    "Keep your back row filled as long as you can: it stops amber men from becoming kings.",
    "Getting a king is worth a lot. Clear a path for a man to the far row, and protect it on the way.",
    "When you are ahead, swap pieces one for one: the fewer pieces left, the easier the win.",
    "Pieces on the side edges can't be jumped from the side, which makes them safe but slow.",
  ],
};

export default guide;
