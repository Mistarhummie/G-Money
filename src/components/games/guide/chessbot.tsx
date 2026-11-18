import type { ReactNode } from "react";
import type { Guide } from "./types";

// Colours match the game: maple and walnut squares, cream White pieces, dark Black pieces,
// green dots for moves, rose rings for captures, lime for the picked piece, red glow for check.
const LIGHT = "#ecd0a0";
const DARK = "#a8723f";
const DOT = "#047857";
const RING = "#f43f5e";
const PICKED = "rgba(163,230,53,0.6)";
const CHECK = "#ef4444";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";
const AMBER = "#fbbf24";
const SKY = "#7dd3fc";

type Kind = "K" | "Q" | "R" | "B" | "N" | "P";
const GLYPH: Record<Kind, string> = { K: "♚︎", Q: "♛︎", R: "♜︎", B: "♝︎", N: "♞︎", P: "♟︎" };
const FONT = 'system-ui, "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", sans-serif';

/** A chess piece centred on (x, y). */
function Pc({ x, y, k, white, size }: { x: number; y: number; k: Kind; white: boolean; size: number }) {
  return (
    <text
      x={x}
      y={y + size * 0.04}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontFamily={FONT}
      fill={white ? "#fffaf0" : "#1f1410"}
      stroke={white ? "#2a1608" : "#f5e6c8"}
      strokeWidth={size * 0.045}
      paintOrder="stroke"
    >
      {GLYPH[k]}
    </text>
  );
}

/** A patch of board. `file0`/`rankTop` (0-based) keep the real square colours; cells are [col, row] from the top left. */
function Squares({ x, y, s, cols, rows, file0 = 0, rankTop = 7 }: { x: number; y: number; s: number; cols: number; rows: number; file0?: number; rankTop?: number }) {
  const cells: ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const light = (file0 + c + rankTop - r) % 2 === 1;
      cells.push(<rect key={`${c}-${r}`} x={x + c * s} y={y + r * s} width={s} height={s} fill={light ? LIGHT : DARK} />);
    }
  return (
    <g>
      {cells}
      <rect x={x} y={y} width={cols * s} height={rows * s} fill="none" stroke="#4a2812" strokeWidth={s * 0.06} />
    </g>
  );
}

type Cell = [col: number, row: number];

/** Centre of a cell. */
const at = (x: number, y: number, s: number, [c, r]: Cell): [number, number] => [x + c * s + s / 2, y + r * s + s / 2];

function Dots({ x, y, s, cells }: { x: number; y: number; s: number; cells: Cell[] }) {
  return (
    <g>
      {cells.map((cell) => {
        const [cx, cy] = at(x, y, s, cell);
        return <circle key={cell.join()} cx={cx} cy={cy} r={s * 0.17} fill={DOT} fillOpacity={0.85} />;
      })}
    </g>
  );
}

function Ring({ x, y, s, cell }: { x: number; y: number; s: number; cell: Cell }) {
  const [cx, cy] = at(x, y, s, cell);
  return <circle cx={cx} cy={cy} r={s * 0.43} fill="none" stroke={RING} strokeOpacity={0.85} strokeWidth={s * 0.1} />;
}

function Arrow({ id, colour }: { id: string; colour: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill={colour} />
    </marker>
  );
}

// ---------------------------------------------------------------- pictures

/** Back-row mate: the rook checks along the 8th row and the king's own pawns block every escape. */
function MatePicture() {
  const s = 40;
  const x = 0;
  const y = 0;
  const [rx, ry] = at(x, y, s, [1, 0]);
  const [kx, ky] = at(x, y, s, [3, 0]);
  return (
    <svg viewBox="0 0 200 138" width="100%" role="img" aria-label="Checkmate on the back row">
      <defs>
        <radialGradient id="cb-check-1">
          <stop offset="0%" stopColor={CHECK} stopOpacity={0.95} />
          <stop offset="60%" stopColor={CHECK} stopOpacity={0.45} />
          <stop offset="100%" stopColor={CHECK} stopOpacity={0} />
        </radialGradient>
        <Arrow id="cb-arrow-1" colour={RING} />
      </defs>
      <Squares x={x} y={y} s={s} cols={5} rows={3} file0={3} rankTop={7} />
      <rect x={kx - s / 2} y={ky - s / 2} width={s} height={s} fill="url(#cb-check-1)" />
      <line x1={rx + 14} y1={ry} x2={kx - 15} y2={ky} stroke={RING} strokeWidth={4} markerEnd="url(#cb-arrow-1)" />
      <Pc x={rx} y={ry} k="R" white size={32} />
      <Pc x={kx} y={ky} k="K" white={false} size={32} />
      {[2, 3, 4].map((c) => {
        const [px, py] = at(x, y, s, [c, 1]);
        return <Pc key={c} x={px} y={py} k="P" white={false} size={30} />;
      })}
      {["d", "e", "f", "g", "h"].map((f, i) => (
        <text key={f} x={i * s + s / 2} y={134} textAnchor="middle" fontSize={11} fill={MUTED}>
          {f}
        </text>
      ))}
    </svg>
  );
}

/** Tap a piece: it lights up, green dots show its moves, a rose ring shows a capture. */
function TapPicture() {
  const s = 40;
  const knight: Cell = [2, 2];
  const [nx, ny] = at(0, 0, s, knight);
  const [bx, by] = at(0, 0, s, [3, 0]);
  const [wx, wy] = at(0, 0, s, [4, 3]);
  return (
    <svg viewBox="0 0 200 236" width="100%" role="img" aria-label="A knight picked up, showing where it can go">
      <Squares x={0} y={0} s={s} cols={5} rows={5} file0={2} rankTop={5} />
      <rect x={nx - s / 2} y={ny - s / 2} width={s} height={s} fill={PICKED} />
      <Dots x={0} y={0} s={s} cells={[[0, 1], [0, 3], [1, 0], [4, 1], [1, 4], [3, 4]]} />
      <Ring x={0} y={0} s={s} cell={[3, 0]} />
      <Pc x={nx} y={ny} k="N" white size={32} />
      <Pc x={bx} y={by} k="P" white={false} size={28} />
      <Pc x={wx} y={wy} k="P" white size={28} />
      <text x={100} y={218} textAnchor="middle" fontSize={12} fill={TEXT}>
        <tspan fill="#a3e635">1. Tap your piece</tspan>
        <tspan dx={10} fill="#34d399">2. Tap a dot</tspan>
      </text>
      <text x={100} y={233} textAnchor="middle" fontSize={10.5} fill={MUTED}>
        Rose ring = you can capture that piece
      </text>
    </svg>
  );
}

/** One small board per piece, the piece in the middle and dots where it can go. */
function PiecesPicture() {
  const s = 15;
  const size = 5 * s;
  const gap = 14;
  const lines = (dirs: Cell[]): Cell[] => {
    const out: Cell[] = [];
    for (const [dc, dr] of dirs) for (let c = 2 + dc, r = 2 + dr; c >= 0 && c < 5 && r >= 0 && r < 5; c += dc, r += dr) out.push([c, r]);
    return out;
  };
  const ROOK: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP: Cell[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const boards: { k: Kind; name: string; dots: Cell[]; piece?: Cell }[] = [
    { k: "K", name: "King: 1 step", dots: [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]] },
    { k: "Q", name: "Queen: any line", dots: lines([...ROOK, ...BISHOP]) },
    { k: "R", name: "Rook: straight", dots: lines(ROOK) },
    { k: "B", name: "Bishop: diagonal", dots: lines(BISHOP) },
    { k: "N", name: "Knight: L-jump", dots: [[0, 1], [0, 3], [4, 1], [4, 3], [1, 0], [3, 0], [1, 4], [3, 4]] },
    { k: "P", name: "Pawn: forward", dots: [[2, 2], [2, 1]], piece: [2, 3] },
  ];
  return (
    <svg viewBox={`0 0 ${3 * size + 2 * gap} ${2 * size + 52}`} width="100%" role="img" aria-label="How each chess piece moves">
      {boards.map((b, i) => {
        const x = (i % 3) * (size + gap);
        const y = Math.floor(i / 3) * (size + 26);
        const [px, py] = at(x, y, s, b.piece ?? [2, 2]);
        return (
          <g key={b.k}>
            <Squares x={x} y={y} s={s} cols={5} rows={5} />
            <Dots x={x} y={y} s={s} cells={b.dots} />
            {b.k === "P" && (
              <>
                <Ring x={x} y={y} s={s} cell={[1, 2]} />
                <Ring x={x} y={y} s={s} cell={[3, 2]} />
                <Pc x={x + 1.5 * s} y={y + 2.5 * s} k="N" white={false} size={12} />
                <Pc x={x + 3.5 * s} y={y + 2.5 * s} k="B" white={false} size={12} />
              </>
            )}
            <rect x={px - s / 2} y={py - s / 2} width={s} height={s} fill={PICKED} />
            <Pc x={px} y={py} k={b.k} white size={15} />
            <text x={x + size / 2} y={y + size + 12} textAnchor="middle" fontSize={8.5} fill={TEXT}>
              {b.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Castling on the king's side: the king steps two squares and the rook jumps over it. */
function CastlePicture() {
  const s = 34;
  const row = (y: number, pieces: [number, Kind][]) => (
    <g>
      <Squares x={0} y={y} s={s} cols={8} rows={1} rankTop={0} />
      {pieces.map(([c, k]) => {
        const [px, py] = at(0, y, s, [c, 0]);
        return <Pc key={c} x={px} y={py} k={k} white size={27} />;
      })}
    </g>
  );
  const y1 = 30;
  const y2 = 100;
  const cx = (c: number) => c * s + s / 2;
  return (
    <svg viewBox="0 0 272 150" width="100%" role="img" aria-label="Castling: the king moves two squares and the rook jumps over it">
      <defs>
        <Arrow id="cb-arrow-k" colour={AMBER} />
        <Arrow id="cb-arrow-r" colour={SKY} />
      </defs>
      <text x={0} y={12} fontSize={11} fill={MUTED}>
        Before
      </text>
      {row(y1, [[0, "R"], [4, "K"], [7, "R"]])}
      <path d={`M${cx(4)} ${y1 + 4} Q${cx(5)} ${y1 - 18} ${cx(6) - 2} ${y1 + 3}`} fill="none" stroke={AMBER} strokeWidth={3} markerEnd="url(#cb-arrow-k)" />
      <path d={`M${cx(7)} ${y1 + s - 3} Q${cx(6)} ${y1 + s + 16} ${cx(5) + 2} ${y1 + s - 2}`} fill="none" stroke={SKY} strokeWidth={3} markerEnd="url(#cb-arrow-r)" />
      <text x={0} y={y2 - 8} fontSize={11} fill={MUTED}>
        After: tap the king, then the square two to the side
      </text>
      {row(y2, [[0, "R"], [5, "R"], [6, "K"]])}
      {["a", "b", "c", "d", "e", "f", "g", "h"].map((f, i) => (
        <text key={f} x={cx(i)} y={y2 + s + 13} textAnchor="middle" fontSize={10} fill={MUTED}>
          {f}
        </text>
      ))}
    </svg>
  );
}

/** A pawn reaching the last row, and the picker that asks what it becomes. */
function PromotePicture() {
  const s = 40;
  const [px, py] = at(0, 10, s, [1, 1]);
  const [tx, ty] = at(0, 10, s, [1, 0]);
  const choices: Kind[] = ["Q", "R", "B", "N"];
  return (
    <svg viewBox="0 0 262 104" width="100%" role="img" aria-label="A pawn on the last row turns into a queen, rook, bishop or knight">
      <defs>
        <Arrow id="cb-arrow-p" colour="#34d399" />
      </defs>
      <Squares x={0} y={10} s={s} cols={3} rows={2} file0={3} rankTop={7} />
      <circle cx={tx} cy={ty} r={s * 0.17} fill={DOT} />
      <line x1={px} y1={py - 13} x2={tx} y2={ty + 9} stroke="#34d399" strokeWidth={3} markerEnd="url(#cb-arrow-p)" />
      <Pc x={px} y={py} k="P" white size={30} />
      <text x={128} y={56} textAnchor="middle" fontSize={20} fill={MUTED}>
        →
      </text>
      <rect x={142} y={10} width={120} height={80} rx={12} fill="rgba(0,0,0,0.6)" stroke="rgba(253,230,138,0.3)" />
      <text x={202} y={30} textAnchor="middle" fontSize={11} fill={TEXT}>
        Promote to:
      </text>
      {choices.map((k, i) => (
        <g key={k}>
          <rect x={148 + i * 28} y={42} width={24} height={30} rx={5} fill="#8e5a2c" stroke="rgba(253,230,138,0.35)" />
          <Pc x={160 + i * 28} y={57} k={k} white size={20} />
        </g>
      ))}
    </svg>
  );
}

/** Stalemate: Black is not in check but has no legal move, so the game is a draw. */
function StalematePicture() {
  const s = 40;
  const piece = (c: number, r: number, k: Kind, white: boolean) => {
    const [x, y] = at(0, 0, s, [c, r]);
    return <Pc x={x} y={y} k={k} white={white} size={32} />;
  };
  const cross = (c: number, r: number) => {
    const [x, y] = at(0, 0, s, [c, r]);
    return (
      <path key={`${c}-${r}`} d={`M${x - 7} ${y - 7}L${x + 7} ${y + 7}M${x + 7} ${y - 7}L${x - 7} ${y + 7}`} stroke={RING} strokeWidth={3} strokeLinecap="round" />
    );
  };
  return (
    <svg viewBox="0 0 160 176" width="100%" role="img" aria-label="Stalemate: the black king cannot move but is not in check">
      <Squares x={0} y={0} s={s} cols={4} rows={4} file0={4} rankTop={7} />
      {cross(2, 0)}
      {cross(2, 1)}
      {cross(3, 1)}
      {piece(3, 0, "K", false)}
      {piece(1, 1, "K", true)}
      {piece(2, 2, "Q", true)}
      {["e", "f", "g", "h"].map((f, i) => (
        <text key={f} x={i * s + s / 2} y={172} textAnchor="middle" fontSize={11} fill={MUTED}>
          {f}
        </text>
      ))}
    </svg>
  );
}

const guide: Guide = {
  intro:
    "Classic chess against the computer. You play White and move first. Trap the computer's king (checkmate) to win. The quicker you win, the more points you get.",
  sections: [
    {
      title: "The goal: checkmate",
      body: [
        "Each side has 16 pieces: a king, a queen, 2 rooks, 2 bishops, 2 knights and 8 pawns. Your pieces are cream (White) at the bottom; the computer's are dark (Black) at the top.",
        "You attack the enemy king. When the king is attacked it is in “check” and its square glows red.",
        "Checkmate means the king is in check and has no way out. That ends the game, and the side that gave checkmate wins.",
        "Pieces are captured by moving onto them. Captured pieces show above and below the board, with a +number for whoever is ahead.",
      ],
      picture: <MatePicture />,
      caption: "Checkmate: the rook checks along the back row and the king's own pawns block every escape.",
    },
    {
      title: "How to move",
      body: [
        "Wait for “Your move (White)”, then tap one of your pieces. It lights up green.",
        "Green dots show every square it may go to. A rose ring around an enemy piece means you can capture it.",
        "Tap a dot (or a ringed piece) to move there. To change your mind, tap the piece again or tap another of your pieces.",
        "The computer replies after a short pause (“Computer is thinking…”). Its last move stays lit in yellow so you can see what it did.",
        "On a computer you can also play with the keyboard: click the board, use the arrow keys to move the blue box, and press Enter to pick up and drop a piece.",
      ],
      picture: <TapPicture />,
      caption: "Only legal moves get a dot, so you can never make an illegal move by mistake.",
    },
    {
      title: "How each piece moves",
      body: [
        "King: one square in any direction. It can never move onto a square that is attacked.",
        "Queen: any number of squares in a straight line or along a diagonal. It is your strongest piece.",
        "Rook: any number of squares straight up, down or sideways.",
        "Bishop: any number of squares along a diagonal, so it always stays on one colour.",
        "Knight: an “L” – two squares one way, then one to the side. It is the only piece that jumps over others.",
        "Pawn: one square straight forward (two on its very first move). It captures one square diagonally forward, never straight ahead, and never moves backwards.",
        "Only the knight jumps: other pieces stop when something is in the way.",
      ],
      picture: <PiecesPicture />,
      caption: "Dots show where each piece can go from the middle. The pawn captures diagonally (rose rings).",
    },
    {
      title: "Castling: tuck your king away",
      body: [
        "Once per game you may move your king two squares towards a rook, and that rook jumps to the other side of the king, all in one move.",
        "To castle, tap the king, then tap the square two steps to the right (g1) or left (c1). The rook moves by itself.",
        "Allowed only if the king and that rook have not moved yet, the squares between them are empty, the king is not in check, and the king does not pass over or land on an attacked square.",
      ],
      picture: <CastlePicture />,
      caption: "King's-side castling: the king goes e1 → g1 and the rook h1 → f1.",
    },
    {
      title: "Promotion and en passant",
      body: [
        "Promotion: when a pawn reaches the far row it must become a queen, rook, bishop or knight. A box pops up – tap the piece you want. A queen is almost always best.",
        "En passant: if an enemy pawn moves two squares and lands right beside your pawn, your pawn may capture it as if it had moved only one square. You can only do this on the very next move. When it is allowed, a dot appears behind that pawn.",
      ],
      picture: <PromotePicture />,
      caption: "Push a pawn all the way and pick its new piece. On a keyboard press Q, R, B or N.",
    },
    {
      title: "Check, and how a game ends",
      body: [
        "If your king is in check you must get it out at once: move the king, block the attack, or capture the attacker. Only moves that do this get dots.",
        "Checkmate wins (or loses) the game.",
        "Draws: stalemate (the side to move has no legal move but is not in check); 50 moves each with no capture and no pawn move; the same position three times; too few pieces left for anyone to checkmate (for example king against king and knight); or 100 moves each in total.",
        "You can tap Resign at any time, but resigning counts as a loss.",
      ],
      picture: <StalematePicture />,
      caption: "Stalemate: Black is not in check but every king move is covered (✕). That is a draw, not a win!",
    },
    {
      title: "Points and time",
      body: [
        "Win: your stage number × 1,000, plus a speed bonus of up to 999. The bonus is 1,000 minus 10 for every move you made, so mate in 30 moves on stage 1 earns 1,000 + 700 = 1,700.",
        "Draw: stage × 100 points, but the stage is not cleared.",
        "Loss or resign: 0 points.",
        "You have 30 minutes for a game. A win after the time limit does not clear the stage.",
        "The computer gets stronger each stage: on Beginner it often plays a random move; from Strong up it checks every exchange before it captures.",
      ],
    },
  ],
  tips: [
    "Start by moving your middle pawns and bringing out knights and bishops, then castle early to keep your king safe.",
    "Before every move ask: what is the computer attacking? Look for its checks and captures first.",
    "Don't give pieces away: count how many of your pieces guard a square against how many attack it.",
    "When you are far ahead, push your pawns to promote, and always leave the enemy king a square so you don't stalemate it.",
    "Watch the +number by the captured pieces: it tells you who is ahead (pawn 1, knight or bishop 3, rook 5, queen 9).",
  ],
};

export default guide;
