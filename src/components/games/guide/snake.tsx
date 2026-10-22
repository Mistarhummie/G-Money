import type { Guide } from "./types";

// Colours match the game: green-to-pink snake, rose food, indigo walls on a deep blue board.
const CELL = 12;
const BOARD = "#0b2230";
const GRID = "rgba(255,255,255,0.06)";
const FOOD = "#fb7185";
const WALL = "#6366f1";
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

type Pt = [col: number, row: number];

function Board({ x, y, cols, rows, walls = [] }: { x: number; y: number; cols: number; rows: number; walls?: Pt[] }) {
  let lines = "";
  for (let c = 1; c < cols; c++) lines += `M${x + c * CELL} ${y}v${rows * CELL}`;
  for (let r = 1; r < rows; r++) lines += `M${x} ${y + r * CELL}h${cols * CELL}`;
  return (
    <g>
      <rect x={x} y={y} width={cols * CELL} height={rows * CELL} rx={3} fill={BOARD} stroke="#818cf8" strokeOpacity={0.35} />
      <path d={lines} stroke={GRID} strokeWidth={0.6} />
      {walls.map(([c, r]) => (
        <rect key={`${c}-${r}`} x={x + c * CELL + 0.8} y={y + r * CELL + 0.8} width={CELL - 1.6} height={CELL - 1.6} rx={2.4} fill={WALL} />
      ))}
    </g>
  );
}

/** A snake, head first. `dir` is where the head looks. */
function Snake({ x, y, cells, dir = "R" }: { x: number; y: number; cells: Pt[]; dir?: "U" | "D" | "L" | "R" }) {
  const n = cells.length;
  const [hc, hr] = cells[0];
  const cx = x + hc * CELL + CELL / 2;
  const cy = y + hr * CELL + CELL / 2;
  const [ex, ey] = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }[dir];
  // Eyes sit forward of centre, side by side across the direction of travel.
  const eyes: Pt[] = [
    [cx + ex * 2 - ey * 2.4, cy + ey * 2 - ex * 2.4],
    [cx + ex * 2 + ey * 2.4, cy + ey * 2 + ex * 2.4],
  ];
  return (
    <g>
      {cells.map(([c, r], i) => (
        <rect
          key={i}
          x={x + c * CELL + 1}
          y={y + r * CELL + 1}
          width={CELL - 2}
          height={CELL - 2}
          rx={i === 0 ? 4.5 : 3}
          fill={hsl(135 + (200 * i) / Math.max(n - 1, 1), 85, i === 0 ? 55 : 50)}
        />
      ))}
      {eyes.map(([a, b], i) => (
        <circle key={i} cx={a} cy={b} r={1.3} fill="#0f172a" />
      ))}
    </g>
  );
}

function Food({ x, y, at }: { x: number; y: number; at: Pt }) {
  return (
    <g>
      <circle cx={x + at[0] * CELL + CELL / 2} cy={y + at[1] * CELL + CELL / 2} r={4} fill={FOOD} />
      <circle cx={x + at[0] * CELL + CELL / 2 + 1} cy={y + at[1] * CELL + 2.6} r={1.2} fill="#4ade80" />
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

/** A line through `pts` with an arrowhead at the last point. */
function Arrow({ pts, color = TEXT, dashed = false }: { pts: [number, number][]; color?: string; dashed?: boolean }) {
  const [x1, y1] = pts[pts.length - 2];
  const [x2, y2] = pts[pts.length - 1];
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = (t: number) => `${x2 - 4.5 * Math.cos(a + t)} ${y2 - 4.5 * Math.sin(a + t)}`;
  return (
    <g>
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashed ? "3 2" : undefined}
      />
      <path d={`M${x2} ${y2}L${head(0.5)}L${head(-0.5)}Z`} fill={color} />
    </g>
  );
}

const EatPicture = (
  <svg viewBox="0 0 216 66" width="100%" role="img" aria-label="The snake eats the food and becomes one cell longer">
    <Board x={4} y={4} cols={7} rows={4} />
    <Snake x={4} y={4} cells={[[3, 2], [2, 2], [1, 2]]} />
    <Food x={4} y={4} at={[4, 2]} />
    <Arrow pts={[[95, 28], [118, 28]]} />
    <Board x={124} y={4} cols={7} rows={4} />
    <Snake x={124} y={4} cells={[[4, 2], [3, 2], [2, 2], [1, 2]]} />
    <Food x={124} y={4} at={[5, 0]} />
    <Label x={46} y={62}>Head reaches the food</Label>
    <Label x={166} y={62}>One longer, new food</Label>
  </svg>
);

const TurnPicture = (
  <svg viewBox="0 0 230 70" width="100%" role="img" aria-label="Turning up then left makes a quick U-turn">
    <Board x={4} y={4} cols={9} rows={5} />
    <Snake x={4} y={4} cells={[[5, 3], [4, 3], [3, 3], [2, 3]]} />
    <Arrow pts={[[70, 40], [70, 34], [36, 34]]} color="#fde047" dashed />
    <Label x={118} y={18} anchor="start">1. Tap ↑: it turns up</Label>
    <Label x={118} y={32} anchor="start">2. Then ←: it turns left</Label>
    <Label x={118} y={50} anchor="start" color={MUTED}>← first does nothing:</Label>
    <Label x={118} y={60} anchor="start" color={MUTED}>a snake can&apos;t reverse</Label>
  </svg>
);

const CrashPicture = (
  <svg viewBox="0 0 176 82" width="100%" role="img" aria-label="Running into your body crashes, moving into the cell your tail is leaving is safe">
    <Board x={6} y={4} cols={6} rows={5} />
    <Snake x={6} y={4} dir="D" cells={[[2, 2], [2, 1], [3, 1], [4, 1], [4, 2], [4, 3], [3, 3], [2, 3], [1, 3]]} />
    <path d="M32 42l8 8M40 42l-8 8" stroke="#f43f5e" strokeWidth={2.4} strokeLinecap="round" />
    <Label x={42} y={76} color="#fda4af">Crash: hits its body</Label>
    <Board x={94} y={4} cols={6} rows={5} />
    <Snake x={94} y={4} dir="D" cells={[[1, 2], [1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3]]} />
    <path d="M110 46l3 3l6 -6" stroke="#4ade80" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <Label x={130} y={76} color="#86efac">Safe: tail moves away</Label>
  </svg>
);

const BORDER_WALLS: Pt[] = [];
for (let c = 0; c < 7; c++) BORDER_WALLS.push([c, 0], [c, 4]);
for (let r = 1; r < 4; r++) BORDER_WALLS.push([0, r], [6, r]);

const EdgesPicture = (
  <svg viewBox="0 0 196 80" width="100%" role="img" aria-label="On stage 1 the snake wraps from one edge to the other; from stage 2 the walls crash you">
    <Board x={6} y={4} cols={7} rows={5} />
    <Snake x={6} y={4} cells={[[0, 2], [6, 2], [5, 2], [4, 2]]} />
    <Arrow pts={[[90, 34], [99, 34]]} color="#fde047" />
    <Arrow pts={[[0, 34], [6, 34]]} color="#fde047" />
    <Label x={48} y={74}>Stage 1: wraps around</Label>
    <Board x={108} y={4} cols={7} rows={5} walls={BORDER_WALLS} />
    <Snake x={108} y={4} cells={[[5, 2], [4, 2], [3, 2]]} />
    <path d="M182 30l6 8M188 30l-6 8" stroke="#f43f5e" strokeWidth={2} strokeLinecap="round" />
    <Label x={150} y={74}>Stages 2–5: walls</Label>
  </svg>
);

const guide: Guide = {
  intro:
    "Steer a hungry snake around the board. Every piece of food you eat makes it longer. Eat enough food to clear the stage, and don't crash into a wall or into yourself.",
  sections: [
    {
      title: "The goal",
      body: [
        "The board is a square of 17 × 17 cells. One piece of food (the red berry) is always somewhere on it.",
        "Move the snake's head onto the food to eat it. The snake grows one cell longer and a new food appears in a random empty cell.",
        "Each stage has a target: 10, 15, 20, 25 and then 30 food. The counter above the board shows how many you have eaten, for example 🍎 7/10.",
        "When you reach the target, the Give up link turns into a green Finish button. You can stop there, or keep eating for more points.",
      ],
      picture: EatPicture,
      caption: "Eating food: the snake grows by one cell and new food appears.",
    },
    {
      title: "How to steer",
      body: [
        "The snake moves forward on its own, one cell at a time. You only choose which way it turns.",
        "On a phone: swipe on the board in the direction you want (up, down, left or right). One long swipe can make several turns: keep your finger down and change direction.",
        "Or tap the arrow buttons under the board. On a computer, use the arrow keys or W A S D.",
        "The game starts with your first swipe, tap or key. The snake starts on the left side, heading right.",
        "You can't turn straight back into yourself. If you are going right, pressing left does nothing.",
        "Quick presses are remembered in order (up to 3), so tapping ↑ then ← fast makes a tight U-turn.",
      ],
      picture: TurnPicture,
      caption: "A U-turn takes two turns: first up (or down), then back the other way.",
    },
    {
      title: "What makes you crash",
      body: [
        "Running the head into any part of your own body ends the game.",
        "Running into a wall ends the game (stages 2 to 5).",
        "One exception: moving into the cell your tail is just leaving is safe, because the tail moves out of the way first.",
        "A crash ends the game straight away. The food you already ate still counts.",
      ],
      picture: CrashPicture,
      caption: "Left: the head turns into the body and crashes. Right: the head follows the tail, which is safe.",
    },
    {
      title: "The five stages",
      body: [
        "1. Garden: no walls at all. Go off one edge and you come back on the opposite side. Speed: 5 cells a second.",
        "2. Walls: a wall all round the edge. About 6 cells a second.",
        "3. Blocks: the edge wall plus four bars and two short posts in the middle. About 8 cells a second.",
        "4. Maze: walls that make corridors and boxes. About 9 cells a second.",
        "5. Lightning: four square pillars, at about 13 cells a second.",
        "The walls are the glowing blue-purple blocks. The starting row on the left is always clear.",
      ],
      picture: EdgesPicture,
      caption: "Stage 1 wraps around the edges. From stage 2 the edge is a wall.",
    },
    {
      title: "Points, clearing and time",
      body: [
        "Each food is worth 10 points times the stage number: 10 on stage 1, 20 on stage 2, up to 50 on stage 5.",
        "You clear the stage once you have eaten the target. After that, even a crash still counts as cleared, so extra food is free points.",
        "Give up (before the target) ends the game without clearing it.",
        "A game can last at most 30 minutes. You get a warning 1 minute and 10 seconds before the end, and when time is up your game is handed in as it stands.",
        "In tournaments the highest score wins; if two scores tie, the faster game wins.",
      ],
    },
  ],
  tips: [
    "Turn a moment before you reach the corner, not at it, especially on Lightning where the snake moves very fast.",
    "Move in long straight lines and wide loops. Zig-zagging fills the board with your own body and traps you.",
    "Always leave yourself a way out: don't steer into a pocket that is shorter than your snake.",
    "On stage 1, use the wrap-around as a shortcut: going off the edge is often the quickest way to the food.",
    "Once you pass the target there is nothing to lose, so keep eating for a bigger score.",
  ],
};

export default guide;
