import type { Guide } from "./types";

// Tile colours match the game: [fill, text].
const LOOK: Record<number, [string, string]> = {
  2: ["#bae6fd", "#0c4a6e"],
  4: ["#6ee7b7", "#064e3b"],
  8: ["#fbbf24", "#78350f"],
  16: ["#f97316", "#ffffff"],
  32: ["#f43f5e", "#ffffff"],
  64: ["#db2777", "#ffffff"],
  128: ["#9333ea", "#ffffff"],
  256: ["#4f46e5", "#ffffff"],
  512: ["#0284c7", "#ffffff"],
  1024: ["#0d9488", "#ffffff"],
  2048: ["#f59e0b", "#422006"],
};
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";

function Tile({ x, y, s, v, ring }: { x: number; y: number; s: number; v: number; ring?: boolean }) {
  const [fill, color] = LOOK[v] ?? ["#f472b6", "#1e1b4b"];
  const digits = String(v).length;
  return (
    <g>
      <rect x={x} y={y} width={s} height={s} rx={s * 0.14} fill={fill} />
      {ring && <rect x={x - 1.5} y={y - 1.5} width={s + 3} height={s + 3} rx={s * 0.2} fill="none" stroke="#fde047" strokeWidth={1.2} strokeDasharray="2 1.5" />}
      <text
        x={x + s / 2}
        y={y + s / 2}
        dy="0.36em"
        fill={color}
        fontSize={s * (digits <= 2 ? 0.48 : digits === 3 ? 0.38 : 0.3)}
        fontWeight={800}
        textAnchor="middle"
        fontFamily="inherit"
      >
        {v}
      </text>
    </g>
  );
}

/** A grid of cells; 0 is an empty slot. `fresh` marks the cell of the newly added tile. */
function Grid({ x, y, s, cells, cols = 4, gap = 2, fresh = -1 }: { x: number; y: number; s: number; cells: number[]; cols?: number; gap?: number; fresh?: number }) {
  const rows = Math.ceil(cells.length / cols);
  return (
    <g>
      <rect x={x - gap} y={y - gap} width={cols * (s + gap) + gap} height={rows * (s + gap) + gap} rx={s * 0.25} fill="#0f1b3d" stroke="#38bdf8" strokeOpacity={0.25} />
      {cells.map((v, i) => {
        const cx = x + (i % cols) * (s + gap);
        const cy = y + Math.floor(i / cols) * (s + gap);
        return v ? (
          <Tile key={i} x={cx} y={cy} s={s} v={v} ring={i === fresh} />
        ) : (
          <rect key={i} x={cx} y={cy} width={s} height={s} rx={s * 0.14} fill="rgba(255,255,255,0.06)" />
        );
      })}
    </g>
  );
}

function Label({ x, y, children, color = TEXT, anchor = "middle", size = 7 }: { x: number; y: number; children: string; color?: string; anchor?: "start" | "middle"; size?: number }) {
  return (
    <text x={x} y={y} fill={color} fontSize={size} textAnchor={anchor} fontFamily="inherit">
      {children}
    </text>
  );
}

const arrow = (x1: number, x2: number, y: number) => `M${x1} ${y}H${x2}M${x2 - 3.5} ${y - 3.5}L${x2} ${y}L${x2 - 3.5} ${y + 3.5}`;

const LadderPicture = (() => {
  const rows = [
    [2, 4, 8, 16, 32, 64],
    [128, 256, 512, 1024, 2048, 4096],
  ];
  const S = 22;
  return (
    <svg viewBox="0 0 196 62" width="100%" role="img" aria-label="Each merge doubles the number: 2, 4, 8, 16 and so on up to 4096">
      {rows.map((row, r) =>
        row.map((v, i) => {
          const x = 4 + i * 33;
          const y = 4 + r * 32;
          return (
            <g key={v}>
              <Tile x={x} y={y} s={S} v={v} />
              {i < row.length - 1 && <path d={arrow(x + S + 2, x + 31, y + S / 2)} stroke={MUTED} strokeWidth={1.1} fill="none" strokeLinecap="round" />}
            </g>
          );
        }),
      )}
    </svg>
  );
})();

const SwipePicture = (
  <svg viewBox="0 0 200 84" width="100%" role="img" aria-label="Swiping left slides every tile left; equal tiles that meet merge, and a new tile appears">
    <Grid x={6} y={6} s={14} cells={[2, 0, 2, 0, 0, 4, 0, 8, 8, 8, 4, 0, 0, 0, 0, 2]} />
    <path d="M110 38H88M93 33.5L88 38L93 42.5" stroke="#fde047" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <Label x={99} y={52} color="#fde047">swipe left</Label>
    <Grid x={130} y={6} s={14} cells={[4, 0, 0, 0, 4, 8, 0, 0, 16, 4, 0, 0, 2, 0, 0, 2]} fresh={15} />
    <Label x={38} y={80}>Before</Label>
    <Label x={162} y={80}>After</Label>
  </svg>
);

const RulesPicture = (() => {
  const examples: [number[], number[], string, string][] = [
    [[2, 2, 2, 2], [4, 4, 0, 0], "Each tile merges", "once per move"],
    [[2, 2, 4, 0], [4, 4, 0, 0], "A merged tile can't", "merge again"],
    [[4, 4, 4, 0], [8, 4, 0, 0], "Pair nearest the", "wall merges first"],
  ];
  return (
    <svg viewBox="0 0 220 86" width="100%" role="img" aria-label="Three examples of swiping a row to the left">
      <Label x={4} y={8} anchor="start" color="#fde047">All swiped left ←</Label>
      {examples.map(([a, b, l1, l2], r) => {
        const y = 15 + r * 24;
        return (
          <g key={r}>
            <Grid x={6} y={y} s={12} gap={1.5} cells={a} />
            <path d={arrow(64, 76, y + 6)} stroke={MUTED} strokeWidth={1.2} fill="none" strokeLinecap="round" />
            <Grid x={82} y={y} s={12} gap={1.5} cells={b} />
            <Label x={142} y={y + 5} anchor="start" size={6}>{l1}</Label>
            <Label x={142} y={y + 12} anchor="start" size={6}>{l2}</Label>
          </g>
        );
      })}
    </svg>
  );
})();

const StuckPicture = (
  <svg viewBox="0 0 200 84" width="100%" role="img" aria-label="A full board where no two touching tiles match: no moves left">
    <Grid x={6} y={6} s={16} cells={[2, 4, 2, 8, 4, 16, 8, 2, 2, 8, 32, 4, 8, 2, 4, 16]} />
    <Label x={86} y={26} anchor="start">Every cell is full and</Label>
    <Label x={86} y={36} anchor="start">no two touching tiles match.</Label>
    <Label x={86} y={52} anchor="start" color="#fda4af">No moves left: the game</Label>
    <Label x={86} y={62} anchor="start" color="#fda4af">ends by itself.</Label>
  </svg>
);

const CornerPicture = (
  <svg viewBox="0 0 200 84" width="100%" role="img" aria-label="Biggest tile in the bottom-left corner, the others lined up in falling order">
    <Grid x={6} y={6} s={16} cells={[0, 0, 2, 0, 2, 0, 0, 0, 4, 8, 16, 32, 512, 256, 128, 64]} />
    <Label x={86} y={22} anchor="start">Keep the biggest tile in a</Label>
    <Label x={86} y={32} anchor="start">corner, with the next biggest</Label>
    <Label x={86} y={42} anchor="start">lined up beside it.</Label>
    <Label x={86} y={58} anchor="start" color={MUTED}>Swipe mostly ← and ↓ so the</Label>
    <Label x={86} y={68} anchor="start" color={MUTED}>big tile stays in its corner.</Label>
  </svg>
);

const guide: Guide = {
  intro:
    "Slide numbered tiles around a 4 × 4 board. When two tiles with the same number touch, they join into one tile worth double. Keep joining tiles until you make the target number for the stage.",
  sections: [
    {
      title: "The goal",
      body: [
        "The game starts with two tiles on the board. Every tile shows a number: 2, 4, 8, 16 and so on, each double the last.",
        "Two equal tiles merge into one: 2 + 2 = 4, 4 + 4 = 8, 8 + 8 = 16…",
        "Each stage has a target tile to make: 512, then 1024, then 2048, then 4096.",
        "The bar under the score fills up as your biggest tile gets closer to the target.",
      ],
      picture: LadderPicture,
      caption: "Every merge doubles the number. Keep doubling until you reach the target.",
    },
    {
      title: "How to move",
      body: [
        "Swipe on the board up, down, left or right. On a computer, use the arrow keys or W A S D.",
        "Every tile on the board slides as far as it can in that direction, until it hits the edge or another tile.",
        "If two tiles with the same number bump into each other, they merge into one.",
        "After every move a new tile appears in a random empty cell. It is usually a 2, and about one time in ten a 4.",
        "A swipe that moves nothing is ignored: no new tile, and it doesn't count as a move.",
        "There is no undo, so look before you swipe.",
      ],
      picture: SwipePicture,
      caption: "Swiping left: 2 and 2 make 4, 8 and 8 make 16, and a new 2 appears (dotted outline).",
    },
    {
      title: "Merging rules",
      body: [
        "A tile can only merge once in each move. Four 2s in a row become two 4s, not one 8.",
        "A tile made by a merge can't merge again in the same move, even if a matching tile is right next to it.",
        "When three equal tiles are in a line, the two nearest the side you swiped to merge first.",
      ],
      picture: RulesPicture,
      caption: "Three rows, all swiped to the left.",
    },
    {
      title: "Points, clearing and the end",
      body: [
        "Every merge adds the new tile's value to your score: two 8s merging into 16 gives +16.",
        "You clear the stage as soon as the target tile appears. Give up turns into a green Finish button. Press it to stop, or keep going for more points.",
        "When the board is full and no two touching tiles match, the game ends by itself. If you had already made the target, the stage still counts as cleared.",
        "Give up before the target ends the game without clearing it.",
        "A game can last at most 30 minutes. You get a warning 1 minute and 10 seconds before the end.",
        "In tournaments the highest score wins; if two scores tie, the faster game wins.",
      ],
      picture: StuckPicture,
      caption: "A stuck board: every swipe would move nothing, so the game is over.",
    },
    {
      title: "A plan that works",
      body: [
        "Choose one corner (for example bottom-left) and keep your biggest tile there all game.",
        "Line up the next biggest tiles along the edge beside it, biggest to smallest, so they can merge one after another into the corner.",
        "Use mostly two directions (for example left and down). Use the third only when you must, and the fourth almost never.",
      ],
      picture: CornerPicture,
      caption: "512 in the corner, then 256, 128, 64 along the bottom, and 32, 16, 8, 4 back along the row above."
    },
  ],
  tips: [
    "Don't chase every merge. A move that keeps your big tile in its corner is better than a small merge in the middle.",
    "Keep the edge row next to your corner full, so the big tile can't be pushed out of place.",
    "Before each swipe, check where the new tile could land. Avoid leaving a single gap next to your big tile.",
    "If the board is filling up, look for small 2s and 4s to merge first; they free space fastest.",
  ],
};

export default guide;
