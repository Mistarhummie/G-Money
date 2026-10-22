import type { ReactNode } from "react";
import type { Guide } from "./types";

// Colours match the board: weathered wood, dark carved bowls, grey-green pebbles, green for your
// actions, red for captures, amber for the other player.
const WOOD = "#6f563e";
const WOOD_EDGE = "#3b2a1a";
const BOWL = "#3a2a1a";
const PEBBLE = "#a9c7c0";
const PEBBLE_EDGE = "#4b766d";
const GREEN = "#34d399";
const RED = "#f43f5e";
const AMBER = "#fbbf24";
const TEXT = "#e7e5e4";
const MUTED = "#a8a29e";

const S = 30; // one pit cell
const X0 = 16; // left margin (room for a store)
const Y0 = 14;
const GAP = 8; // the hinge between the two halves

/** Centre of pit (row, col) in a diagram whose hinge comes after row `hingeAfter`. */
const at = (r: number, c: number, hingeAfter = 1): [number, number] => [X0 + c * S + S / 2, Y0 + r * S + S / 2 + (r > hingeAfter ? GAP : 0)];

type Mark = { r: number; c: number; colour: string; dashed?: boolean };

/**
 * A piece of the board: `rows` of 8 counts, top to bottom. `squares` are nyumba pits; `marks` ring pits.
 * `children` draw on top (arrows, labels), in the same units.
 */
function Board({
  rows,
  squares = [],
  marks = [],
  hingeAfter = 1,
  extraHeight = 0,
  children,
}: {
  rows: number[][];
  squares?: [number, number][];
  marks?: Mark[];
  hingeAfter?: number;
  extraHeight?: number;
  children?: ReactNode;
}) {
  const height = Y0 * 2 + rows.length * S + (rows.length > hingeAfter + 1 ? GAP : 0) + extraHeight;
  const width = X0 * 2 + 8 * S;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-hidden>
      <defs>
        <marker id="baoArrowG" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={GREEN} />
        </marker>
        <marker id="baoArrowR" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={RED} />
        </marker>
        <marker id="baoArrowA" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={AMBER} />
        </marker>
      </defs>
      <rect x="2" y="2" width={width - 4} height={height - 4 - extraHeight} rx="10" fill={WOOD} stroke={WOOD_EDGE} strokeWidth="2" />
      {rows.length > hingeAfter + 1 && (
        <line x1="4" x2={width - 4} y1={Y0 + (hingeAfter + 1) * S + GAP / 2} y2={Y0 + (hingeAfter + 1) * S + GAP / 2} stroke="#1c120a" strokeWidth="2" />
      )}
      {rows.map((row, r) =>
        row.map((n, c) => {
          const [x, y] = at(r, c, hingeAfter);
          const square = squares.some(([sr, sc]) => sr === r && sc === c);
          return (
            <g key={`${r}-${c}`}>
              {square ? (
                <rect x={x - 12} y={y - 12} width="24" height="24" rx="4" fill={BOWL} stroke="#e7c27a" strokeOpacity=".5" strokeWidth="1.2" />
              ) : (
                <circle cx={x} cy={y} r="12" fill={BOWL} stroke="#1c120a" strokeWidth="1" />
              )}
              {Array.from({ length: Math.min(n, 5) }, (_, i) => {
                const a = i * 2.4;
                const rr = n === 1 ? 0 : 5.5;
                return <ellipse key={i} cx={x + rr * Math.cos(a)} cy={y - 1 + rr * Math.sin(a)} rx="3.4" ry="2.8" fill={i % 3 === 2 ? "#f1f1ea" : PEBBLE} stroke={PEBBLE_EDGE} strokeWidth=".6" />;
              })}
              {n > 0 && (
                <text x={x} y={y + 10.5} textAnchor="middle" fontSize="8" fontWeight="700" fill={TEXT} stroke="#000" strokeWidth="2" paintOrder="stroke">
                  {n}
                </text>
              )}
            </g>
          );
        }),
      )}
      {marks.map((m, i) => {
        const [x, y] = at(m.r, m.c, hingeAfter);
        return <circle key={i} cx={x} cy={y} r="14.5" fill="none" stroke={m.colour} strokeWidth="2.2" strokeDasharray={m.dashed ? "3 3" : undefined} />;
      })}
      {children}
    </svg>
  );
}

/** A curved arrow from pit to pit. */
function Arrow({ from, to, colour = GREEN, bend = -18, hingeAfter = 1 }: { from: [number, number]; to: [number, number]; colour?: string; bend?: number; hingeAfter?: number }) {
  const [x1, y1] = at(from[0], from[1], hingeAfter);
  const [x2, y2] = at(to[0], to[1], hingeAfter);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + bend;
  const id = colour === RED ? "baoArrowR" : colour === AMBER ? "baoArrowA" : "baoArrowG";
  return <path d={`M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`} fill="none" stroke={colour} strokeWidth="2.2" markerEnd={`url(#${id})`} strokeLinecap="round" />;
}

function Label({ x, y, children, colour = MUTED, anchor = "middle" }: { x: number; y: number; children: ReactNode; colour?: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize="9" fontWeight="600" fill={colour} stroke="#000" strokeWidth="2.2" paintOrder="stroke">
      {children}
    </text>
  );
}

const empty = () => [0, 0, 0, 0, 0, 0, 0, 0];

// ---- Pictures ---------------------------------------------------------------------------------

/** The start: their rows on top, yours below, nyumba squares, 22 seeds in each store. */
function SetupPicture() {
  // Their front row seen from your side: their A5 (nyumba) is the 4th from your left.
  const theirFront = [0, 2, 2, 6, 0, 0, 0, 0];
  const myFront = [0, 0, 0, 0, 6, 2, 2, 0];
  return (
    <Board rows={[empty(), theirFront, myFront, empty()]} squares={[[1, 3], [2, 4]]} extraHeight={16}>
      <Label x={X0 + 4 * S} y={Y0 + 4 * S + GAP + 24}>
        Your front row A1 … A8 (left to right) · back row B1 … B8
      </Label>
      <Label x={at(2, 0)[0]} y={at(2, 0)[1] - 15} colour={GREEN}>
        kichwa
      </Label>
      <Label x={at(2, 7)[0]} y={at(2, 7)[1] - 15} colour={GREEN}>
        kichwa
      </Label>
      <Label x={at(2, 4)[0]} y={at(2, 4)[1] - 15} colour={AMBER}>
        nyumba
      </Label>
      <Label x={X0 + 4 * S} y={Y0 - 3}>
        their rows (store on their left, your top right)
      </Label>
    </Board>
  );
}

/** Namua capture: add a seed to an occupied pit facing their seeds, take theirs, sow from a kichwa. */
function NamuaCapturePicture() {
  return (
    <Board rows={[[0, 0, 0, 0, 3, 0, 0, 0], [0, 0, 1, 2, 0, 0, 0, 0]]} marks={[{ r: 0, c: 3, colour: RED }, { r: 1, c: 3, colour: GREEN }]} hingeAfter={0} extraHeight={14}>
      <Label x={at(1, 3, 0)[0]} y={at(1, 3, 0)[1] + 26} colour={GREEN}>
        +1 seed from your store
      </Label>
      <Arrow from={[0, 3]} to={[1, 0]} colour={RED} bend={-30} hingeAfter={0} />
      <Arrow from={[0, 3]} to={[1, 7]} colour={RED} bend={-30} hingeAfter={0} />
      <Label x={at(0, 0, 0)[0] + 20} y={Y0 - 2} colour={RED}>
        from the centre: you pick L or R
      </Label>
    </Board>
  );
}

/** Mtaji capture: lift a pit, the last seed lands in an occupied front pit facing their seeds. */
function MtajiCapturePicture() {
  return (
    <Board rows={[[0, 0, 0, 4, 0, 0, 0, 0], [0, 0, 0, 1, 1, 2, 0, 0]]} marks={[{ r: 1, c: 5, colour: GREEN }, { r: 0, c: 3, colour: RED }, { r: 1, c: 7, colour: RED, dashed: true }]} hingeAfter={0} extraHeight={14}>
      <Arrow from={[1, 5]} to={[1, 4]} bend={14} hingeAfter={0} />
      <Arrow from={[1, 4]} to={[1, 3]} bend={14} hingeAfter={0} />
      <Arrow from={[0, 3]} to={[1, 7]} colour={RED} bend={-34} hingeAfter={0} />
      <Label x={at(1, 4, 0)[0]} y={at(1, 4, 0)[1] + 28} colour={GREEN}>
        sow 2 to the left: the last lands on 1 seed → capture 4
      </Label>
    </Board>
  );
}

/** Relay sowing: a lap ending in an occupied pit lifts it and keeps going; an empty pit ends the turn. */
function RelayPicture() {
  return (
    <Board rows={[[2, 1, 3, 0, 1, 0, 0, 0]]} marks={[{ r: 0, c: 0, colour: GREEN }, { r: 0, c: 2, colour: GREEN, dashed: true }, { r: 0, c: 6, colour: AMBER, dashed: true }]} hingeAfter={5} extraHeight={14}>
      <Arrow from={[0, 0]} to={[0, 1]} bend={-16} hingeAfter={5} />
      <Arrow from={[0, 1]} to={[0, 2]} bend={-16} hingeAfter={5} />
      <Arrow from={[0, 2]} to={[0, 3]} bend={16} hingeAfter={5} />
      <Arrow from={[0, 3]} to={[0, 4]} bend={16} hingeAfter={5} />
      <Arrow from={[0, 4]} to={[0, 5]} bend={16} hingeAfter={5} />
      <Arrow from={[0, 5]} to={[0, 6]} bend={16} hingeAfter={5} />
      <Label x={X0 + 4 * S} y={Y0 + S + 20} colour={MUTED}>
        lands on 3 → lift 4, sow on … ends in an empty pit
      </Label>
    </Board>
  );
}

/** The nyumba: taxed for 2 seeds in namua, or stop / safari after a capture. */
function NyumbaPicture() {
  return (
    <Board rows={[[0, 0, 0, 0, 8, 0, 0, 0]]} squares={[[0, 4]]} hingeAfter={5} extraHeight={14}>
      <Arrow from={[0, 4]} to={[0, 5]} bend={-16} hingeAfter={5} />
      <Arrow from={[0, 5]} to={[0, 6]} bend={-16} hingeAfter={5} />
      <Label x={at(0, 4, 5)[0]} y={Y0 - 2} colour={AMBER}>
        tax: only 2 seeds leave, the house stands
      </Label>
      <Label x={X0 + 4 * S} y={Y0 + S + 20}>
        after a capture ending here: Stop (X) or Safari (S)
      </Label>
    </Board>
  );
}

/** Winning: their front row is empty. */
function WinPicture() {
  return (
    <Board rows={[[3, 0, 1, 0, 2, 0, 0, 4], empty(), [2, 0, 3, 1, 5, 0, 2, 1], [1, 0, 0, 2, 0, 3, 0, 0]]} squares={[[1, 3], [2, 4]]} marks={[0, 1, 2, 3, 4, 5, 6, 7].map((c) => ({ r: 1, c, colour: RED, dashed: true }))} extraHeight={12}>
      <Label x={X0 + 4 * S} y={Y0 + 4 * S + GAP + 20} colour={GREEN}>
        their front row is empty: you win
      </Label>
    </Board>
  );
}

/** Our board's controls: a green ring, arrows beside the pit, glowing kichwa. */
function ControlsPicture() {
  const [x, y] = at(0, 3, 5);
  return (
    <Board rows={[[2, 0, 1, 3, 0, 1, 0, 2]]} marks={[{ r: 0, c: 3, colour: GREEN }, { r: 0, c: 0, colour: GREEN, dashed: true }, { r: 0, c: 7, colour: GREEN, dashed: true }]} hingeAfter={5} extraHeight={14}>
      {[-1, 1].map((d) => (
        <g key={d}>
          <circle cx={x + d * 15} cy={y} r="7.5" fill={GREEN} stroke="#ecfdf5" strokeWidth="1.2" />
          <text x={x + d * 15} y={y + 3} textAnchor="middle" fontSize="9" fontWeight="900" fill="#064e3b">
            {d < 0 ? "◀" : "▶"}
          </text>
        </g>
      ))}
      <Label x={X0 + 4 * S} y={Y0 + S + 20}>
        tap the pit, then an arrow (or ← →); dashed: kichwa choices
      </Label>
    </Board>
  );
}

const guide: Guide = {
  intro:
    "Bao la Kiswahili is the great seed game of the Swahili coast. You and your opponent each own two rows of 8 pits and 32 seeds. You win when the other player's front row is empty or they have no move left.",
  sections: [
    {
      title: "The board and the start",
      body: [
        "Your rows are always the bottom two. The row next to the hinge is your front row (A1 to A8 from your left); the one at the edge is your back row (B1 to B8).",
        "The square pit is your nyumba (house), A5. The end pits A1 and A8 are the kichwa (heads). The two pits at each end (A1, A2 and A7, A8) are the kimbi.",
        "At the start you have 6 seeds in the nyumba, 2 in A6, 2 in A7 and 22 in your store (the tall box on your left). Seeds in the store are 'in hand'.",
        "The two nyumba are not opposite each other: theirs faces your A4.",
      ],
      picture: <SetupPicture />,
      caption: "The starting position, as you see it.",
    },
    {
      title: "Namua: playing seeds from your store",
      body: [
        "While your store has seeds, every turn starts by putting one of them into a front-row pit that already has seeds.",
        "If that pit had seeds and the opponent's pit facing it has seeds, you capture: all their seeds come to you. Capturing is compulsory when you can.",
        "Captured seeds are sown into your front row from a kichwa, one per pit. A capture in your left kimbi (A1, A2) sows from A1 going right; in your right kimbi (A7, A8) from A8 going left. From the four middle pits you choose the kichwa.",
        "If you cannot capture (takasa), you lift the pit you added to and sow it to the left or right. You may not use your nyumba while another front pit has seeds; if it is your only one, it is taxed: just 2 seeds are lifted and the house stands. Without a working nyumba you must use a pit of 2 or more seeds when there is one.",
      ],
      picture: <NamuaCapturePicture />,
      caption: "Your seed lands on 2 facing their 3: you take the 3 and sow them from a kichwa.",
    },
    {
      title: "How sowing goes on",
      body: [
        "Seeds go one per pit around your own two rows; you never sow on the opponent's side. Going right along your front row carries on right to left along your back row, and round again.",
        "If the last seed lands in an empty pit, your turn ends.",
        "If it lands in an occupied pit, you lift everything there and keep sowing the same way (endelea).",
        "In a capturing move, if it lands in an occupied front pit facing their seeds, you capture again. The new seeds start from the kichwa that keeps your direction, unless the capture is in a kimbi: then they start from that end's kichwa.",
        "A move that did not start with a capture never captures. A very long sowing is stopped after 1000 seeds.",
      ],
      picture: <RelayPicture />,
      caption: "A relay: each time the last seed finds company, the pit is lifted and sown on.",
    },
    {
      title: "Mtaji: when your store is empty",
      body: [
        "Each turn you lift a pit with 2 or more seeds (front or back row) and sow it either way.",
        "It is a capture when the last seed of that first lap lands in an occupied front pit facing their seeds. You must capture if any pit can. A pit of 16 or more seeds never captures.",
        "Captured seeds start from the kichwa in your direction of travel (going left: A8; going right: A1), or from the kimbi's own kichwa.",
        "If you cannot capture, play a front pit with 2+ seeds; only if every front pit has 0 or 1 seed may you play a back pit. Never empty your front row: if your only front pit is a kichwa, sow it towards the centre.",
      ],
      picture: <MtajiCapturePicture />,
      caption: "Sowing 2 to the left ends on a pit facing 4 enemy seeds: they fly to your right kichwa.",
    },
    {
      title: "The nyumba and takasia",
      body: [
        "Your nyumba works while it has 6+ seeds and has never been lifted or captured. Its powers are for the namua stage.",
        "A non-capturing sowing that ends in your working nyumba stops there.",
        "A capture whose sowing ends in it lets you choose: Stop (lala) or Safari: lift the house and sow on. After a safari, or if it is captured, it is an ordinary pit for good.",
        "Takasia: after a move with no capture, if exactly one of your front pits is threatened and you have no capture, that pit is locked (🔒) for your next turn: you can't play it, and a sowing ending in it stops. A working nyumba, your only occupied front pit or your only pit of 2+ can't be locked.",
      ],
      picture: <NyumbaPicture />,
    },
    {
      title: "Making your move on our board",
      body: [
        "Pits with a green ring are the ones you may play. Tap one.",
        "In namua, tapping a pit puts your seed there. If the rules leave a choice, the board asks: green ◀ ▶ arrows beside the pit for the direction, glowing 'from here' kichwa for a capture from the middle, or a Stop / Safari box for the nyumba.",
        "If there is only one way to play the pit (like a capture in a kimbi), tapping it plays at once.",
        "Keys: 1-8 pick your front pit A1-A8, ← → choose a direction or kichwa, S / X choose safari / stop, Escape cancels. Tap the board or press Space to skip a sowing.",
        "The number on each pit is its seed count. Your store count shows how many namua turns you have left.",
      ],
      picture: <ControlsPicture />,
    },
    {
      title: "Winning, scoring and time",
      body: [
        "You win when the computer's front row is empty, or when it has no legal move. You lose the same way.",
        "After 200 moves in all the game is a draw. Giving up counts as a loss.",
        "A win scores the stage × 1000 plus a bonus for winning in fewer moves; a draw scores stage × 100. You have 30 minutes per game.",
      ],
      picture: <WinPicture />,
    },
  ],
  tips: [
    "In namua, every pair of occupied front pits facing each other is a capture for whoever moves first: count them before you add a seed.",
    "Guard your nyumba: if the pit facing it fills up, the opponent can capture the whole house.",
    "Captures that end in a kimbi switch your direction; use that to reach pits the other way.",
    "Don't leave just one or two pits in your front row: one capture and you lose.",
    "In mtaji, big back-row pits are your reserves: they can't be captured.",
  ],
};

export default guide;
