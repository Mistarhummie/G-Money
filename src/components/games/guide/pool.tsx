import type { ReactNode } from "react";
import type { Guide } from "./types";

// Colours match the game: green felt, walnut rails, the game's ball colours, a white dashed aim line
// ending in a ghost ball, a yellow line for where the object ball goes, and a green/red ring for ball in hand.
const FELT = "#138a4e";
const FELT_EDGE = "#0a5530";
const RAIL = "#5a2f15";
const POCKET = "#060606";
const CUE_BALL = "#f7f4ea";
const BALL = ["#f7f4ea", "#f5c518", "#1f5fd6", "#d9302c", "#6b2fa8", "#f07d18", "#17924a", "#8a1f1f", "#141414"];
const AIM = "rgba(255,255,255,0.8)";
const PATH = "rgba(250,204,21,0.9)";
const OK = "#34d399";
const BAD = "#f87171";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";

const colourOf = (n: number) => BALL[n >= 9 ? n - 8 : n];

/** A pool ball. Stripes (9-15) are white with a coloured band; numbers show on bigger balls. */
function Ball({ x, y, n, r }: { x: number; y: number; n: number; r: number }) {
  const c = colourOf(n);
  const stripe = n >= 9;
  const k = 0.866 * r;
  return (
    <g>
      <circle cx={x + r * 0.2} cy={y + r * 0.3} r={r} fill="rgba(0,0,0,0.3)" />
      <circle cx={x} cy={y} r={r} fill={n === 0 || stripe ? CUE_BALL : c} />
      {stripe && <path d={`M${x - k} ${y - r / 2}A${r} ${r} 0 0 0 ${x - k} ${y + r / 2}L${x + k} ${y + r / 2}A${r} ${r} 0 0 0 ${x + k} ${y - r / 2}Z`} fill={c} />}
      {n > 0 && r >= 8 && (
        <>
          <circle cx={x} cy={y} r={r * 0.45} fill="#fff" />
          <text x={x} y={y + r * 0.03} textAnchor="middle" dominantBaseline="central" fontSize={r * 0.62} fontWeight={700} fill="#111">
            {n}
          </text>
        </>
      )}
      <circle cx={x - r * 0.35} cy={y - r * 0.4} r={r * 0.22} fill="rgba(255,255,255,0.5)" />
    </g>
  );
}

/** Felt with a rail and pockets: corner pockets always, middle pockets on the long sides when `sides`. */
function Table({ x, y, w, h, rail = 8, pr = 8, sides = true, children }: { x: number; y: number; w: number; h: number; rail?: number; pr?: number; sides?: boolean; children?: ReactNode }) {
  const pockets: [number, number][] = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ];
  if (sides) pockets.push([x - 2, y + h / 2], [x + w + 2, y + h / 2]);
  return (
    <g>
      <rect x={x - rail} y={y - rail} width={w + 2 * rail} height={h + 2 * rail} rx={rail} fill={RAIL} />
      <rect x={x} y={y} width={w} height={h} fill={FELT} stroke={FELT_EDGE} strokeWidth={1.5} />
      {pockets.map(([px, py]) => (
        <circle key={`${px}-${py}`} cx={px} cy={py} r={pr} fill={POCKET} stroke="#9a8b6d" strokeWidth={1} />
      ))}
      {children}
    </g>
  );
}

function Marker({ id, colour }: { id: string; colour: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill={colour} />
    </marker>
  );
}

/** A dashed aim line from the cue ball to the ghost ball, and the ghost ball itself. */
function AimLine({ from, to, r }: { from: [number, number]; to: [number, number]; r: number }) {
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={AIM} strokeWidth={2} strokeDasharray="5 4" />
      <circle cx={to[0]} cy={to[1]} r={r} fill="none" stroke={AIM} strokeWidth={1.6} />
    </g>
  );
}

/** The cue stick, lying behind the cue ball along the aim direction. */
function Stick({ at, dir, r }: { at: [number, number]; dir: [number, number]; r: number }) {
  const [dx, dy] = dir;
  const a = [at[0] - dx * (r + 4), at[1] - dy * (r + 4)];
  const b = [at[0] - dx * (r + 80), at[1] - dy * (r + 80)];
  return (
    <g strokeLinecap="round">
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#d8b06c" strokeWidth={4} />
      <line x1={a[0]} y1={a[1]} x2={a[0] - dx * 2} y2={a[1] - dy * 2} stroke="#3d6fd1" strokeWidth={4} />
    </g>
  );
}

const unit = (x: number, y: number): [number, number] => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

/** A ring around a ball in hand: green where it may go, red where it may not. */
function HandRing({ x, y, r, ok }: { x: number; y: number; r: number; ok: boolean }) {
  return <circle cx={x} cy={y} r={r + 6} fill="none" stroke={ok ? OK : BAD} strokeWidth={2} strokeDasharray="4 3" />;
}

// ---------------------------------------------------------------- pictures

function GroupsPicture() {
  const r = 10;
  const row = (y: number, nums: number[]) => nums.map((n, i) => <Ball key={n} x={22 + i * 30} y={y} n={n} r={r} />);
  return (
    <svg viewBox="0 0 250 150" width="100%" role="img" aria-label="Solids, stripes and the black 8">
      <text x={8} y={14} fontSize={11} fill={TEXT}>
        Solids: 1–7
      </text>
      {row(32, [1, 2, 3, 4, 5, 6, 7])}
      <text x={8} y={62} fontSize={11} fill={TEXT}>
        Stripes: 9–15
      </text>
      {row(80, [9, 10, 11, 12, 13, 14, 15])}
      <Ball x={22} y={124} n={8} r={r} />
      <text x={40} y={128} fontSize={11} fill={TEXT}>
        The black 8: pot it last to win
      </text>
    </svg>
  );
}

function AimPicture() {
  const r = 9;
  const pocket: [number, number] = [228, 12];
  const ball: [number, number] = [160, 72];
  const [ux, uy] = unit(pocket[0] - ball[0], pocket[1] - ball[1]);
  const ghost: [number, number] = [ball[0] - ux * 2 * r, ball[1] - uy * 2 * r];
  const cue: [number, number] = [56, 168];
  const dir = unit(ghost[0] - cue[0], ghost[1] - cue[1]);
  const angle = (dx: number, dy: number) => (Math.atan2(dy, dx) * 180) / Math.PI;
  // Labels sit just below each line, turned to run along it.
  const end: [number, number] = [pocket[0] - ux * 14, pocket[1] - uy * 14];
  const pathLabel: [number, number] = [(ball[0] + end[0]) / 2 - uy * 9, (ball[1] + end[1]) / 2 + ux * 9];
  const aimLabel: [number, number] = [(cue[0] + ghost[0]) / 2 - dir[1] * 9, (cue[1] + ghost[1]) / 2 + dir[0] * 9];
  return (
    <svg viewBox="0 0 240 200" width="100%" role="img" aria-label="Aim line, ghost ball and the path of the object ball">
      <defs>
        <Marker id="pool-arrow-aim" colour="rgba(250,204,21,0.95)" />
      </defs>
      <Table x={12} y={12} w={216} h={210} rail={12} pr={11} sides={false}>
        <AimLine from={cue} to={ghost} r={r} />
        <line x1={ball[0]} y1={ball[1]} x2={end[0]} y2={end[1]} stroke={PATH} strokeWidth={2.5} markerEnd="url(#pool-arrow-aim)" />
        <Ball x={ball[0]} y={ball[1]} n={3} r={r} />
        <Stick at={cue} dir={dir} r={r} />
        <Ball x={cue[0]} y={cue[1]} n={0} r={r} />
        <text
          x={aimLabel[0]}
          y={aimLabel[1]}
          textAnchor="middle"
          dominantBaseline="hanging"
          fontSize={10}
          fill={TEXT}
          transform={`rotate(${angle(dir[0], dir[1])} ${aimLabel[0]} ${aimLabel[1]})`}
        >
          aim line
        </text>
        <text x={ghost[0] - r - 5} y={ghost[1] - 4} textAnchor="end" fontSize={10} fill={TEXT}>
          ghost ball
        </text>
        <text
          x={pathLabel[0]}
          y={pathLabel[1]}
          textAnchor="middle"
          dominantBaseline="hanging"
          fontSize={10}
          fill="#fde68a"
          transform={`rotate(${angle(ux, uy)} ${pathLabel[0]} ${pathLabel[1]})`}
        >
          where it goes
        </text>
      </Table>
    </svg>
  );
}

function BreakPicture() {
  // A portrait table to scale (1270 × 2540 mm), with notes on the right.
  const k = 110 / 1270;
  const fx = 20;
  const fy = 22;
  const r = 4;
  const d = 2 * r + 0.3;
  const rowGap = (d * Math.sqrt(3)) / 2;
  const apexY = fy + 635 * k;
  const headY = fy + 1905 * k;
  const balls: { x: number; y: number; n: number }[] = [];
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  let i = 0;
  for (let row = 0; row < 5; row++) for (let j = 0; j <= row; j++) balls.push({ x: fx + 55 + (j - row / 2) * d, y: apexY - row * rowGap, n: order[i++] });
  const cue = { x: fx + 55, y: fy + 2100 * k };
  return (
    <svg viewBox="0 0 270 266" width="100%" role="img" aria-label="The break: cue ball behind the line, rack at the far end">
      <Table x={fx} y={fy} w={110} h={220} rail={9} pr={6}>
        <line x1={fx} y1={headY} x2={fx + 110} y2={headY} stroke="rgba(255,255,255,0.45)" strokeWidth={1.2} strokeDasharray="4 4" />
        {balls.map((b) => (
          <Ball key={b.n} x={b.x} y={b.y} n={b.n} r={r} />
        ))}
        <rect x={fx + 1} y={headY + 1} width={108} height={fy + 220 - headY - 2} fill="rgba(52,211,153,0.12)" />
        <HandRing x={cue.x} y={cue.y} r={r} ok />
        <Ball x={cue.x} y={cue.y} n={0} r={r} />
      </Table>
      <g fontSize={10.5} fill={TEXT}>
        <line x1={fx + 80} y1={apexY - 12} x2={156} y2={apexY - 12} stroke={MUTED} />
        <text x={160} y={apexY - 15}>The rack</text>
        <text x={160} y={apexY - 2} fill={MUTED}>
          (8 in the middle)
        </text>
        <line x1={fx + 112} y1={headY} x2={156} y2={headY - 8} stroke={MUTED} />
        <text x={160} y={headY - 18}>The line</text>
        <text x={160} y={headY - 5} fill={MUTED}>
          (only on the break)
        </text>
        <line x1={cue.x + 10} y1={cue.y} x2={156} y2={cue.y + 10} stroke={MUTED} />
        <text x={160} y={cue.y + 10} fill={OK}>
          Cue ball goes
        </text>
        <text x={160} y={cue.y + 23} fill={OK}>
          below the line
        </text>
      </g>
    </svg>
  );
}

function FirstHitPicture() {
  const r = 8;
  const panel = (x: number, target: number, ok: boolean, label: string) => {
    const cue: [number, number] = [x + 20, 82];
    const ball: [number, number] = [x + 88, 26];
    const [ux, uy] = unit(ball[0] - cue[0], ball[1] - cue[1]);
    const ghost: [number, number] = [ball[0] - ux * 2 * r, ball[1] - uy * 2 * r];
    return (
      <g>
        <Table x={x} y={8} w={110} h={90} rail={6} pr={7} sides={false}>
          <AimLine from={cue} to={ghost} r={r} />
          <Ball x={ball[0]} y={ball[1]} n={target} r={r} />
          <Ball x={cue[0]} y={cue[1]} n={0} r={r} />
          <text x={x + 82} y={82} fontSize={22} fontWeight={700} fill={ok ? OK : BAD} textAnchor="middle">
            {ok ? "✓" : "✕"}
          </text>
        </Table>
        <text x={x + 55} y={124} textAnchor="middle" fontSize={10.5} fill={ok ? OK : BAD}>
          {label}
        </text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 256 132" width="100%" role="img" aria-label="If you are solids, hit a solid first">
      {panel(8, 3, true, "Solid first: good")}
      {panel(138, 11, false, "Stripe first: foul")}
    </svg>
  );
}

function HandPicture() {
  const r = 9;
  return (
    <svg viewBox="0 0 250 160" width="100%" role="img" aria-label="Ball in hand: where the cue ball may and may not go">
      <Table x={12} y={12} w={226} h={120} rail={10} pr={11}>
        <Ball x={150} y={60} n={5} r={r} />
        <Ball x={196} y={100} n={13} r={r} />
        <Ball x={70} y={102} n={8} r={r} />
        {/* Allowed: an open spot straight behind the 5. */}
        <HandRing x={88} y={54} r={r} ok />
        <Ball x={88} y={54} n={0} r={r} />
        {/* Not allowed: touching a ball, or too close to a pocket. */}
        <g opacity={0.65}>
          <Ball x={166} y={64} n={0} r={r} />
        </g>
        <HandRing x={166} y={64} r={r} ok={false} />
        <g opacity={0.65}>
          <Ball x={226} y={24} n={0} r={r} />
        </g>
        <HandRing x={226} y={24} r={r} ok={false} />
      </Table>
      <text x={14} y={154} fontSize={10.5} fill={OK}>
        ◌ green: OK
      </text>
      <text x={100} y={154} fontSize={10.5} fill={BAD}>
        ◌ red: not allowed here
      </text>
    </svg>
  );
}

function EightPicture() {
  const r = 9;
  const pocket: [number, number] = [238, 120];
  const eight: [number, number] = [176, 84];
  const [ux, uy] = unit(pocket[0] - eight[0], pocket[1] - eight[1]);
  const ghost: [number, number] = [eight[0] - ux * 2 * r, eight[1] - uy * 2 * r];
  const cue: [number, number] = [60, 70];
  return (
    <svg viewBox="0 0 250 160" width="100%" role="img" aria-label="On the 8: hit the 8 first and pot it">
      <defs>
        <Marker id="pool-arrow-8" colour="rgba(250,204,21,0.95)" />
      </defs>
      {/* The player's chips as the game shows them: all seven down, and the black dot for "on the 8". */}
      <rect x={10} y={4} width={150} height={22} rx={6} fill="rgba(16,185,129,0.12)" stroke="rgba(52,211,153,0.6)" />
      <text x={18} y={19} fontSize={10} fontWeight={700} fill={TEXT}>
        You
      </text>
      {[1, 2, 3, 4, 5, 6, 7].map((n, i) => (
        <circle key={n} cx={48 + i * 11} cy={15} r={4} fill={colourOf(n)} opacity={0.2} />
      ))}
      <circle cx={130} cy={15} r={4.5} fill="#000" stroke="rgba(255,255,255,0.5)" />
      <text x={140} y={19} fontSize={9} fill={MUTED}>
        on 8
      </text>
      <Table x={12} y={44} w={226} h={76} rail={9} pr={10}>
        <AimLine from={cue} to={ghost} r={r} />
        <line x1={eight[0]} y1={eight[1]} x2={pocket[0] - ux * 13} y2={pocket[1] - uy * 13} stroke={PATH} strokeWidth={2.5} markerEnd="url(#pool-arrow-8)" />
        <Ball x={eight[0]} y={eight[1]} n={8} r={r} />
        <Ball x={120} y={104} n={12} r={r} />
        <Ball x={cue[0]} y={cue[1]} n={0} r={r} />
      </Table>
      <text x={125} y={152} textAnchor="middle" fontSize={10.5} fill={MUTED}>
        All yours are down: now hit the 8 first and pot it
      </text>
    </svg>
  );
}

const guide: Guide = {
  intro:
    "8-Ball Pool against the computer. One side gets the solid balls and the other the stripes. Pot all of yours, then the black 8, before the computer does.",
  sections: [
    {
      title: "The goal",
      body: [
        "There are 15 numbered balls and the white cue ball. You only ever hit the cue ball, and it knocks the others into the six pockets.",
        "Balls 1–7 are solids, 9–15 are stripes, and the 8 is black.",
        "Whoever first pots a ball after the break gets that group; the other side gets the rest. The boxes at the top show each side's group and which balls are still on the table.",
        "Pot all seven of your balls, then pot the 8, and you win.",
      ],
      picture: <GroupsPicture />,
      caption: "Your group is solids or stripes. The 8 always comes last.",
    },
    {
      title: "Aiming and shooting",
      body: [
        "Drag your finger anywhere on the table. The cue ball will roll towards your finger.",
        "A white dashed line shows where the cue ball goes, with a circle (the “ghost ball”) where it will touch the first ball. A short yellow line shows which way that ball will then roll.",
        "Under the table it tells you what you are aiming at, for example “Aiming at the 3 (solid)”.",
        "Use ◀ and ▶ for tiny aim changes, set the Power slider (1 = a soft tap, 100 = a smash; it starts at 70), then tap Shoot.",
        "While the balls roll, tap the table to speed the rest of the shot up.",
        "On a computer: ← → aim (hold Shift for bigger steps), ↑ ↓ power, Space or Enter shoots.",
      ],
      picture: <AimPicture />,
      caption: "Line the ghost ball up so the yellow line points into the pocket, then shoot.",
    },
    {
      title: "The break",
      body: [
        "You always break first. Your cue ball is “in hand”: touch near it and drag to place it anywhere below the dashed line at the bottom.",
        "The dashed ring is green where the cue ball may go and red where it may not.",
        "On the break you may hit any ball. If any ball other than the 8 drops (and the cue ball stays up), you shoot again.",
        "Solids and stripes are not decided by the break. The table stays “open” until a ball is potted on a later shot.",
        "If the 8 drops on the break, it is simply put back on its spot. You don't lose.",
      ],
      picture: <BreakPicture />,
      caption: "The table is upright on your screen: the rack is at the top, you break from the bottom.",
    },
    {
      title: "Taking turns",
      body: [
        "Open table: you may hit any ball first except the 8. The first ball you pot on a clean shot gives you its group.",
        "Once groups are set, the first ball the cue ball touches must be one of yours.",
        "Pot at least one of your own balls (without a foul) and you shoot again, even if one of theirs went in too.",
        "Pot nothing, or only their balls, and it's the other side's turn. Their balls stay down, which helps them.",
        "There's no need to call a pocket or hit a cushion.",
      ],
      picture: <FirstHitPicture />,
      caption: "If you are solids, the cue ball must touch a solid before anything else.",
    },
    {
      title: "Fouls and ball in hand",
      body: [
        "It's a foul if the cue ball goes into a pocket, if it hits no ball at all, or if the first ball it touches is the wrong one (one of theirs, the 8 too early, or anything but the 8 when you are on the 8).",
        "After a foul your turn ends and the other side gets ball in hand: they place the cue ball anywhere on the table, then shoot.",
        "When you get ball in hand, drag the cue ball to a good spot. It can't touch another ball or sit right at a pocket.",
        "Balls potted on a foul stay down, but they don't win you another shot and don't decide the groups.",
      ],
      picture: <HandPicture />,
      caption: "Ball in hand: put the cue ball straight behind an easy ball.",
    },
    {
      title: "The 8-ball: win or lose",
      body: [
        "When all seven of your balls are down, a black dot appears next to your balls at the top. You are “on the 8”.",
        "Now you must hit the 8 first. Pot it with no foul and you win.",
        "You LOSE if you pot the 8 before all your balls are down. That includes potting your last ball and the 8 on the same shot.",
        "You also lose if you pot the 8 and foul on the same shot, for example if the cue ball follows it in.",
        "The computer plays by the same rules, so it can lose this way too.",
      ],
      picture: <EightPicture />,
      caption: "Pot the 8 cleanly, and only after your seven are gone.",
    },
    {
      title: "Points and time",
      body: [
        "Win: your stage × 1,000 plus a bonus of up to 999. The bonus drops by 16 for every shot you take after your first, so fewer shots means more points.",
        "After 120 shots in all (yours and the computer's together) the game is a draw: stage × 100 points, and the stage is not cleared.",
        "Loss or Resign: 0 points.",
        "You have 30 minutes for a game. A win after the time limit does not clear the stage.",
        "The computer aims better each stage, from Beginner (misses a lot) to Master (rarely misses).",
      ],
    },
  ],
  tips: [
    "Use less power than you think. Soft shots are more accurate and the cue ball is less likely to follow a ball into a pocket.",
    "Trust the yellow line: if it doesn't point into the pocket, move your aim with ◀ ▶ until it does.",
    "With ball in hand, put the cue ball close behind one of your balls that is near a pocket. That makes a short, straight shot.",
    "Pot the balls near pockets first and leave the hard ones for later. Don't pot their balls for them.",
    "Be extra careful on the 8: pot it softly, and make sure your last ball is down before you aim at it.",
  ],
};

export default guide;
