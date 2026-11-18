import type { ReactNode } from "react";
import { TRACK_CELLS } from "../ludo/geometry";
import type { Guide } from "./types";

// Colours match the board: red, green, yellow, blue on a cream board.
const COL = [
  { main: "#e53935", dark: "#7f1d1d", soft: "#ffd5d2" },
  { main: "#22a447", dark: "#14532d", soft: "#cdf3d6" },
  { main: "#f7c20c", dark: "#8a5a00", soft: "#fff4bf" },
  { main: "#1f78e0", dark: "#0b3a75", soft: "#d1e7ff" },
];
const CREAM = "#fffdf7";
const LINE = "#94a3b8";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";
const GOOD = "#34d399";
const BAD = "#f43f5e";

const STAR = (cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
};

function Token({ x, y, c, r = 9, ghost }: { x: number; y: number; c: number; r?: number; ghost?: boolean }) {
  return (
    <g opacity={ghost ? 0.4 : 1}>
      <ellipse cx={x} cy={y + r * 0.55} rx={r * 0.9} ry={r * 0.35} fill="rgba(0,0,0,.3)" />
      <circle cx={x} cy={y} r={r} fill={COL[c].main} stroke={COL[c].dark} strokeWidth={r * 0.14} strokeDasharray={ghost ? `${r * 0.4} ${r * 0.3}` : undefined} />
      <circle cx={x} cy={y - r * 0.28} r={r * 0.5} fill={COL[c].main} stroke="#fff" strokeWidth={r * 0.14} />
    </g>
  );
}

function DieFace({ x, y, v, s = 26 }: { x: number; y: number; v: number; s?: number }) {
  const at: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
    6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
  };
  return (
    <g>
      <rect x={x} y={y} width={s} height={s} rx={s * 0.2} fill="#fff" stroke="#cbd5e1" strokeWidth={1.2} />
      {at[v].map(([px, py], i) => (
        <circle key={i} cx={x + px * s} cy={y + py * s} r={s * 0.085} fill={v === 1 ? "#c62828" : "#111827"} />
      ))}
    </g>
  );
}

/** A straight strip of track squares. `cells` gives each square's fill. */
function Strip({ x, y, s, cells }: { x: number; y: number; s: number; cells: (string | { star: string } | null)[] }) {
  return (
    <g>
      {cells.map((c, i) => (
        <g key={i}>
          <rect x={x + i * s} y={y} width={s} height={s} fill={typeof c === "string" ? c : CREAM} stroke={LINE} strokeWidth={1} />
          {c && typeof c === "object" && <polygon points={STAR(x + i * s + s / 2, y + s / 2, s * 0.36)} fill={c.star} />}
        </g>
      ))}
    </g>
  );
}

const arrowDefs = (id: string, colour: string) => (
  <defs>
    <marker id={id} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0 0L10 5L0 10z" fill={colour} />
    </marker>
  </defs>
);

// ---------------------------------------------------------------- pictures

/** The whole board, with red's route round it and up its home column. */
function BoardPicture() {
  const s = 14;
  const cells: ReactNode[] = [];
  TRACK_CELLS.forEach(([r, c], i) => {
    const start = i % 13 === 0 ? COL[i / 13].main : CREAM;
    cells.push(<rect key={`t${i}`} x={c * s} y={r * s} width={s} height={s} fill={start} stroke={LINE} strokeWidth={0.6} />);
    if (i % 13 === 8) cells.push(<polygon key={`s${i}`} points={STAR(c * s + s / 2, r * s + s / 2, s * 0.36)} fill={COL[Math.floor(i / 13)].main} />);
  });
  const route = [...TRACK_CELLS.slice(0, 51), [7, 1], [7, 2], [7, 3], [7, 4], [7, 5]].map(([r, c]) => `${c * s + s / 2},${r * s + s / 2}`).join(" ");
  return (
    <svg viewBox={`-4 -4 ${15 * s + 8} ${15 * s + 8}`} width="100%" role="img" aria-label="The Ludo board and red's route round it">
      {arrowDefs("ludo-g-route", "#fff")}
      <rect x={-4} y={-4} width={15 * s + 8} height={15 * s + 8} rx={8} fill="#1e293b" />
      <rect x={0} y={0} width={15 * s} height={15 * s} fill={CREAM} />
      {[0, 1, 2, 3].map((c) => (
        <g key={c} transform={`rotate(${90 * c} ${7.5 * s} ${7.5 * s})`}>
          <rect x={0} y={0} width={6 * s} height={6 * s} fill={COL[c].main} />
          <rect x={s} y={s} width={4 * s} height={4 * s} rx={6} fill={CREAM} />
          {[
            [2, 2],
            [4, 2],
            [2, 4],
            [4, 4],
          ].map(([x, y]) => (
            <Token key={`${x}${y}`} x={x * s} y={y * s} c={c} r={s * 0.42} />
          ))}
          {[1, 2, 3, 4, 5].map((k) => (
            <rect key={k} x={k * s} y={7 * s} width={s} height={s} fill={COL[c].main} stroke={LINE} strokeWidth={0.6} />
          ))}
          <polygon points={`${6 * s},${6 * s} ${6 * s},${9 * s} ${7.5 * s},${7.5 * s}`} fill={COL[c].main} stroke="#fff" strokeWidth={1} />
        </g>
      ))}
      {cells}
      <polyline points={route} fill="none" stroke="#111827" strokeOpacity={0.55} strokeWidth={2.2} strokeDasharray="4 3" markerEnd="url(#ludo-g-route)" />
    </svg>
  );
}

/** A 6 brings a token out of base onto the start square. */
function OutPicture() {
  const s = 30;
  return (
    <svg viewBox="0 0 250 150" width="100%" role="img" aria-label="Roll a 6 to move a token from base onto your start square">
      {arrowDefs("ludo-g-out", GOOD)}
      <rect x={4} y={4} width={120} height={120} rx={6} fill={COL[0].main} />
      <rect x={22} y={22} width={84} height={84} rx={8} fill={CREAM} />
      {[
        [44, 44],
        [84, 44],
        [44, 84],
        [84, 84],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={14} fill={COL[0].soft} stroke={COL[0].main} strokeWidth={2} />
          {i !== 3 && <Token x={x} y={y} c={0} r={10} />}
        </g>
      ))}
      <Token x={84} y={84} c={0} r={10} ghost />
      <Strip x={124} y={124 - s} s={s} cells={[COL[0].main, null, null, null]} />
      <polygon points={STAR(139, 109, 10)} fill="#fff" />
      <Token x={139} y={109} c={0} r={10} />
      <path d="M92 76 Q120 30 136 92" fill="none" stroke={GOOD} strokeWidth={3} strokeDasharray="5 4" markerEnd="url(#ludo-g-out)" />
      <DieFace x={190} y={20} v={6} s={34} />
      <text x={207} y={70} textAnchor="middle" fontSize={11} fill={TEXT}>
        a 6!
      </text>
      <text x={125} y={146} textAnchor="middle" fontSize={11} fill={MUTED}>
        out onto your start square, then roll again
      </text>
    </svg>
  );
}

/** Land exactly on an opponent to send them back to base. */
function CapturePicture() {
  const s = 34;
  const x0 = 8;
  const y0 = 50;
  return (
    <svg viewBox="0 0 250 150" width="100%" role="img" aria-label="Red rolls 3 and lands on yellow, sending yellow back to base">
      {arrowDefs("ludo-g-hop", GOOD)}
      {arrowDefs("ludo-g-back", BAD)}
      <Strip x={x0} y={y0} s={s} cells={[null, null, null, null, null, null]} />
      <Token x={x0 + s / 2} y={y0 + s / 2} c={0} r={11} ghost />
      <Token x={x0 + 3.5 * s} y={y0 + s / 2} c={0} r={11} />
      {[1, 2, 3].map((k) => (
        <path
          key={k}
          d={`M${x0 + (k - 0.5) * s} ${y0 + 6} Q${x0 + k * s} ${y0 - 18} ${x0 + (k + 0.5) * s} ${y0 + 4}`}
          fill="none"
          stroke={GOOD}
          strokeWidth={2.5}
          markerEnd={k === 3 ? "url(#ludo-g-hop)" : undefined}
        />
      ))}
      <Token x={x0 + 3.5 * s + 4} y={y0 + s + 34} c={2} r={10} ghost />
      <path d={`M${x0 + 3.5 * s + 18} ${y0 + s + 34} H${x0 + 6 * s - 8}`} stroke={BAD} strokeWidth={2.5} strokeDasharray="5 4" markerEnd="url(#ludo-g-back)" />
      <text x={x0 + 6 * s - 4} y={y0 + s + 52} textAnchor="end" fontSize={11} fill={BAD}>
        yellow goes back to base
      </text>
      <DieFace x={200} y={6} v={3} s={30} />
      <text x={8} y={20} fontSize={11} fill={TEXT}>
        Red rolls 3 and lands on yellow
      </text>
    </svg>
  );
}

/** Stars and start squares are safe: nobody is captured there. */
function SafePicture() {
  const s = 36;
  const x0 = 17;
  const y0 = 30;
  return (
    <svg viewBox="0 0 250 130" width="100%" role="img" aria-label="On a star or start square both tokens stay">
      <Strip x={x0} y={y0} s={s} cells={[null, COL[1].main, null, null, { star: "#94a3b8" }, null]} />
      <polygon points={STAR(x0 + 1.5 * s, y0 + s / 2, s * 0.36)} fill="#fff" />
      <Token x={x0 + 4.5 * s - 7} y={y0 + s / 2 - 2} c={1} r={9} />
      <Token x={x0 + 4.5 * s + 7} y={y0 + s / 2 + 2} c={0} r={9} />
      <Token x={x0 + 1.5 * s - 7} y={y0 + s / 2 - 2} c={3} r={9} />
      <Token x={x0 + 1.5 * s + 7} y={y0 + s / 2 + 2} c={1} r={9} />
      <text x={x0 + 1.5 * s} y={y0 + s + 18} textAnchor="middle" fontSize={11} fill={GOOD}>
        start square
      </text>
      <text x={x0 + 4.5 * s} y={y0 + s + 18} textAnchor="middle" fontSize={11} fill={GOOD}>
        star
      </text>
      <text x={125} y={120} textAnchor="middle" fontSize={11} fill={MUTED}>
        Both tokens stay: nobody is captured here
      </text>
      <text x={125} y={16} textAnchor="middle" fontSize={11} fill={TEXT}>
        Safe squares
      </text>
    </svg>
  );
}

/** Up the home column: the exact number is needed to get home. */
function HomePicture() {
  const s = 30;
  const x0 = 8;
  const y0 = 46;
  return (
    <svg viewBox="0 0 250 150" width="100%" role="img" aria-label="A token two squares from home needs exactly a 2">
      {arrowDefs("ludo-g-home", GOOD)}
      <Strip x={x0} y={y0} s={s} cells={[null, COL[0].main, COL[0].main, COL[0].main, COL[0].main, COL[0].main]} />
      <polygon points={`${x0 + 6 * s},${y0 - 14} ${x0 + 6 * s},${y0 + s + 14} ${x0 + 6 * s + 40},${y0 + s / 2}`} fill={COL[0].main} stroke="#fff" strokeWidth={1.5} />
      <text x={x0 + 6 * s + 14} y={y0 + s / 2 + 4} fontSize={10} fill="#fff" fontWeight={700}>
        HOME
      </text>
      <path d={`M${x0 + 4} ${y0 + s / 2} h14 m-5 -5 l5 5 l-5 5`} fill="none" stroke={COL[0].main} strokeWidth={2.5} />
      <Token x={x0 + 4.5 * s} y={y0 + s / 2} c={0} r={10} />
      <path d={`M${x0 + 4.5 * s} ${y0 - 2} Q${x0 + 5.5 * s} ${y0 - 34} ${x0 + 6 * s + 18} ${y0 + 4}`} fill="none" stroke={GOOD} strokeWidth={2.5} markerEnd="url(#ludo-g-home)" />
      <DieFace x={20} y={104} v={2} s={28} />
      <text x={56} y={122} fontSize={11} fill={GOOD}>
        ✓ a 2 gets it home
      </text>
      <DieFace x={140} y={104} v={5} s={28} />
      <text x={176} y={122} fontSize={11} fill={BAD}>
        ✕ a 5 is too many
      </text>
      <text x={8} y={18} fontSize={11} fill={TEXT}>
        Your home column: only your colour goes here
      </text>
    </svg>
  );
}

const guide: Guide = {
  intro:
    "Classic four-colour Ludo, as played all over Kenya. Race your four tokens once round the board and up your home column. The first to get all four home wins.",
  sections: [
    {
      title: "The board",
      body: [
        "Each colour has a corner base with four tokens, a start square in its colour, and a home column leading to the triangle in the middle.",
        "Everyone moves clockwise round the outside. After going all the way round, your tokens turn up your own home column (follow the arrow in your colour).",
        "With 2 players you sit in opposite corners. With 3 or 4, the colours go clockwise: red, green, yellow, blue.",
      ],
      picture: <BoardPicture />,
      caption: "Red's route: out of the base, once round the board, then up the red column to home.",
    },
    {
      title: "Rolling and getting out",
      body: [
        "When it's your turn, tap the die (or press Space). The server rolls it, so nobody can know or change a roll before it happens.",
        "You need a 6 to bring a token out of base onto your start square.",
        "A 6 also gives you another roll. But three 6s in a row and the third one is lost and your turn ends.",
        "If no token can use the roll, the turn passes.",
      ],
      picture: <OutPicture />,
      caption: "Roll a 6 and a token comes out onto your start square.",
    },
    {
      title: "Moving and capturing",
      body: [
        "Tap one of your glowing tokens to move it forward by the roll. If only one move is possible, it happens by itself.",
        "Your own tokens can share a square, and any token may pass any other.",
        "Land exactly on an opponent's token and it goes back to their base. Capturing gives you another roll.",
        "On a computer: press 1–4 to move that token.",
      ],
      picture: <CapturePicture />,
      caption: "Red hops 3 squares and lands on yellow: yellow has to start again.",
    },
    {
      title: "Safe squares",
      body: [
        "Stars and the four coloured start squares are safe. Tokens of different colours can share them and nobody is captured there.",
        "Every star is 8 squares after a start square.",
      ],
      picture: <SafePicture />,
      caption: "Both tokens stay put on a start square or a star.",
    },
    {
      title: "Getting home and winning",
      body: [
        "Only your own tokens go up your home column, and nobody can capture them there.",
        "You need the exact number to reach home. A roll that would go past home can't move that token.",
        "Getting a token home gives you another roll.",
        "The first player with all four tokens home wins. With 3 or 4 players, the rest play on for 2nd and 3rd. The game also ends once only computers are left racing.",
      ],
      picture: <HomePicture />,
      caption: "Two squares to go: only a 2 brings this token home.",
    },
    {
      title: "Playing the computer",
      body: [
        "Pick a stage and 1 to 3 computer opponents. Finish first to clear the stage and open the next one.",
        "The computers get smarter each stage: from random moves at Beginner to Master, which captures, runs from danger and uses safe squares.",
        "Ludo has dice, so it is never part of our prize tournaments. It's just for fun.",
      ],
    },
  ],
  tips: [
    "Get a second token out early. With only one on the board, a bad roll can leave you stuck.",
    "Before moving, count back 1 to 6 squares behind where you'll land. An opponent there may capture you next turn.",
    "Park on stars when opponents are close behind.",
    "Capturing a token that has almost finished costs its owner far more than one that has just come out.",
  ],
};

export default guide;
