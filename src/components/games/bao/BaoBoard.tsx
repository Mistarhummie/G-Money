"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { NYUMBA, SAFARI, STOP, dirFor, mustCapture, pitName, traceMove, type Move, type Side, type State, type Step, type Trace } from "@/lib/games/arcade/bao";
import { useGameFx, type PopOptions } from "../fx/GameFx";
import { animate, vibrate } from "../fx/motion";

// Shared Bao la Kiswahili board, drawn after a carved Swahili-coast board: a hinged wooden box with
// 4 rows of 8 bowls, a square nyumba in each front row, a tall store at one end of each half and
// carved leaves at the other. The viewer's rows are always the bottom two, store on their left.
// Everything is laid out in board units (W x H) and placed in percentages, so it scales with width.

const PAD = 2.5;
const END = 7;
const GAP = 1;
const CELL = 10;
const HINGE = 3.5;
const W = 2 * PAD + 2 * END + 2 * GAP + 8 * CELL; // 101
const H = 2 * PAD + 4 * CELL + HINGE; // 48.5
const PIT = 8.4;
const HINGE_Y = PAD + 2 * CELL + HINGE / 2;

const px = (x: number) => `${(x / W) * 100}%`;
const py = (y: number) => `${(y / H) * 100}%`;
const colX = (c: number) => PAD + END + GAP + CELL * c + CELL / 2;
const rowY = (r: number) => PAD + CELL * r + CELL / 2 + (r >= 2 ? HINGE : 0);

/**
 * Screen row (0 = top) and column of pit k of `side`, with `me` drawn at the bottom. Rows top to
 * bottom: their back row, their front row, my front row, my back row.
 */
function cellOf(side: Side, k: number, me: Side): [number, number] {
  if (side === me) return k < 8 ? [2, k] : [3, 15 - k];
  return k >= 8 ? [0, k - 8] : [1, 7 - k];
}
const pitXY = (side: Side, k: number, me: Side) => {
  const [r, c] = cellOf(side, k, me);
  return { x: colX(c), y: rowY(r) };
};
/** Each player's store: mine at the bottom left, theirs at the top right (on their left). */
const storeBox = (side: Side, me: Side) =>
  side === me ? { x: PAD, y: PAD + 2 * CELL + HINGE, w: END, h: 2 * CELL } : { x: W - PAD - END, y: PAD, w: END, h: 2 * CELL };
const leafBox = (side: Side, me: Side) =>
  side === me ? { x: W - PAD - END, y: PAD + 2 * CELL + HINGE, w: END, h: 2 * CELL } : { x: PAD, y: PAD, w: END, h: 2 * CELL };
const storeXY = (side: Side, me: Side) => {
  const b = storeBox(side, me);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};

// ---- Seeds ------------------------------------------------------------------------------------

/** Grey-green, blue-green and white pebbles, as on the carved boards. */
const PEBBLES = [
  ["#dfe8e0", "#8aa497"],
  ["#a9c7c0", "#4b766d"],
  ["#f4f4ee", "#aeb8b0"],
  ["#a3bba8", "#53705c"],
  ["#bcd2d4", "#58808a"],
  ["#c9d6c6", "#6e856c"],
  ["#93b5ad", "#3f6660"],
];
const pebbleBg = (i: number) => {
  const [light, dark] = PEBBLES[i % PEBBLES.length];
  return `radial-gradient(circle at 33% 28%, rgba(255,255,255,.95) 0 7%, rgba(255,255,255,0) 20%), radial-gradient(circle at 42% 38%, ${light}, ${dark} 80%)`;
};
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const SHOWN_SEEDS = 14;
/** Fixed spots on a golden-angle spiral, so a new seed never shuffles the ones already there. */
const SPOTS = Array.from({ length: SHOWN_SEEDS }, (_, i) => {
  const r = 0.28 * Math.sqrt((i + 0.6) / SHOWN_SEEDS);
  const a = i * 2.39996;
  return { x: 50 + r * 100 * Math.cos(a), y: 46 + r * 100 * Math.sin(a), rot: (a * 180) / Math.PI };
});

function PitSeeds({ n, id }: { n: number; id: number }) {
  return (
    <>
      {SPOTS.slice(0, Math.min(n, SHOWN_SEEDS)).map((s, i) => (
        <span
          key={i}
          className="pointer-events-none absolute block rounded-[50%]"
          style={{
            left: `${s.x - 12}%`,
            top: `${s.y - 9.5}%`,
            width: "24%",
            height: "19%",
            rotate: `${s.rot}deg`,
            background: pebbleBg(i * 3 + id * 5),
            boxShadow: "0 0.12cqw 0.25cqw rgba(0,0,0,.6)",
            animation: "baoSeed .3s cubic-bezier(.3,1.5,.5,1) both",
          }}
        />
      ))}
      {n > 0 && (
        <span
          key={n}
          className="pointer-events-none absolute bottom-[3%] left-1/2 min-w-[36%] -translate-x-1/2 rounded-full bg-black/65 px-[0.3cqw] text-center font-bold leading-tight text-amber-50 shadow"
          style={{ animation: "baoTick .25s ease-out", fontSize: "max(9px, 1.55cqw)" }}
        >
          {n}
        </span>
      )}
    </>
  );
}

/** Spots for the store's seeds: a loose pile filling the compartment from the bottom up. */
const STORE_SPOTS = Array.from({ length: 30 }, (_, i) => {
  const row = Math.floor(i / 3);
  const col = i % 3;
  return { x: 22 + col * 28 + (hash(i) - 0.5) * 10 + (row % 2 ? 6 : -4), y: 92 - row * 8.6 + (hash(i + 50) - 0.5) * 3, rot: hash(i + 9) * 180 };
});

function StoreSeeds({ n }: { n: number }) {
  return (
    <>
      {STORE_SPOTS.slice(0, Math.min(n, STORE_SPOTS.length)).map((s, i) => (
        <span
          key={i}
          className="pointer-events-none absolute block rounded-[50%]"
          style={{
            left: `${s.x - 14}%`,
            top: `${s.y - 4}%`,
            width: "28%",
            height: "8%",
            rotate: `${s.rot}deg`,
            background: pebbleBg(i * 2 + 1),
            boxShadow: "0 0.12cqw 0.25cqw rgba(0,0,0,.6)",
            animation: "baoSeed .3s ease-out both",
          }}
        />
      ))}
    </>
  );
}

// ---- Carvings ---------------------------------------------------------------------------------

/** Two carved leaf panels, as at the end of each half of the board. */
function Leaves({ flip }: { flip: boolean }) {
  const leaf = (y: number) => (
    <g transform={`translate(0 ${y})`}>
      <rect x="5" y="5" width="60" height="88" rx="5" fill="rgba(30,18,8,.35)" stroke="rgba(255,236,200,.18)" strokeWidth="1.5" />
      <rect x="9" y="9" width="52" height="80" rx="4" fill="none" stroke="rgba(20,12,4,.55)" strokeWidth="2" />
      <path d="M15 80 Q 18 30 56 16 Q 52 66 15 80 Z" fill="rgba(25,15,6,.45)" stroke="rgba(255,236,200,.22)" strokeWidth="1.2" />
      <path d="M15 80 L 56 16" stroke="rgba(255,236,200,.25)" strokeWidth="1.3" />
      {[0.25, 0.42, 0.59, 0.76].map((t) => {
        const x = 15 + 41 * t;
        const yy = 80 - 64 * t;
        return (
          <g key={t} stroke="rgba(15,8,2,.55)" strokeWidth="1.2">
            <path d={`M${x} ${yy} l -9 -4`} />
            <path d={`M${x} ${yy} l 4 9`} />
          </g>
        );
      })}
    </g>
  );
  return (
    <svg viewBox="0 0 70 196" className="h-full w-full" preserveAspectRatio="none" aria-hidden style={flip ? { transform: "rotate(180deg)" } : undefined}>
      {leaf(0)}
      {leaf(98)}
    </svg>
  );
}

function Hinge({ x }: { x: number }) {
  const w = 7;
  const h = 4.6;
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: px(x - w / 2),
        top: py(HINGE_Y - h / 2),
        width: px(w),
        height: py(h),
        borderRadius: "0.3cqw",
        background: "linear-gradient(180deg, #4a4843 0%, #2a2926 45%, #1a1917 55%, #3a3833 100%)",
        boxShadow: "0 0.2cqw 0.4cqw rgba(0,0,0,.6), inset 0 0.1cqw 0 rgba(255,255,255,.18)",
      }}
    >
      {[18, 82].map((l) =>
        [22, 78].map((t) => (
          <span
            key={`${l}-${t}`}
            className="absolute block rounded-full"
            style={{ left: `${l - 6}%`, top: `${t - 12}%`, width: "12%", height: "24%", background: "radial-gradient(circle at 35% 35%, #8a877f, #2b2a27 70%)" }}
          />
        )),
      )}
      <span className="absolute inset-x-0 top-1/2 block h-[8%] -translate-y-1/2 bg-black/60" />
    </div>
  );
}

// ---- Popups -----------------------------------------------------------------------------------

/** Pops one at a time, at least `gap` ms apart, so moments never pile up. */
function usePopQueue(gap = 1000) {
  const fx = useGameFx();
  const next = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (text: string, opts: PopOptions = {}) => {
    const now = Date.now();
    const at = Math.max(now, next.current);
    next.current = at + gap;
    timers.current.push(setTimeout(() => fx.pop(text, opts), at - now));
  };
}

// ---- Timing -----------------------------------------------------------------------------------

/** Longest a move's animation may take, in ms; longer sowings speed up to fit. */
const MAX_MS = 4200;

/**
 * Timing of each step of a trace, in ms from the start of the move: the hand spends `dur[i]`
 * travelling to the place of step `i`, which changes when it arrives, at `land[i]`. Drops speed up
 * for long sowings; captured seeds get time to fly across the board.
 */
function schedule(trace: Trace): { at: number[]; dur: number[]; land: number[]; total: number } {
  const drops = trace.steps.filter((s) => s.kind === "sow").length;
  const drop = Math.max(22, Math.min(120, 1600 / Math.max(1, drops)));
  const raw = trace.steps.map((s, i) => {
    switch (s.kind) {
      case "place":
        return 420;
      case "lift":
        return i === 0 ? 160 : Math.max(drop * 1.4, 120);
      case "tax":
        return 380;
      case "capture":
        return 300;
      case "kichwa":
        return 420;
      case "safari":
        return 420;
      case "end":
        return 60;
      default:
        return drop;
    }
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  const fit = Math.min(1, MAX_MS / sum);
  const at: number[] = [];
  const dur: number[] = [];
  const land: number[] = [];
  let t = 0;
  for (const r of raw) {
    const d = r * fit;
    at.push(t);
    dur.push(d);
    land.push(t + d * 0.8);
    t += d;
  }
  return { at, dur, land, total: t + 100 };
}

// ---- Board ------------------------------------------------------------------------------------

/** A move to animate: `from` is the state before it, `id` names it (a new id starts a new animation). */
export type Sowing = { id: string; from: State; move: Move };

type BoardProps = {
  /** The position now (after any move being animated). */
  state: State;
  /** The side drawn at the bottom (the viewer's rows). */
  me: Side;
  /** Legal moves for `me` (empty when it is not my turn or input is closed). */
  legal: Move[];
  /** Called with a complete move once every choice is made. */
  onMove?: (m: Move) => void;
  /** Pit the opponent last played (amber ring) and pit I last played (faint ring). */
  theirLast?: number | null;
  myLast?: number | null;
  /** The move to sow visibly, ending on `state`. Keep the object stable while it plays. */
  sowing?: Sowing | null;
  /** Called once when the sowing has finished or was skipped. */
  onSowDone?: (id: string) => void;
};

const KEYFRAMES = `
@keyframes baoSeed { from { transform: translateY(-140%) scale(.5); opacity: 0 } 60% { opacity: 1 } to { transform: none; opacity: 1 } }
@keyframes baoTick { 0% { transform: translateX(-50%) scale(1.5) } 100% { transform: translateX(-50%) scale(1) } }
@keyframes baoFlash { from { box-shadow: 0 0 0 0.4cqw rgba(253,230,138,.9), 0 0 2cqw rgba(253,230,138,.7) } to { box-shadow: 0 0 0 0 transparent } }
@keyframes baoGrab { from { box-shadow: 0 0 0 0.5cqw rgba(251,113,133,.95), 0 0 2.6cqw rgba(251,113,133,.8) } to { box-shadow: 0 0 0 0 transparent } }
@keyframes baoBob { 0%,100% { transform: translateY(-6%) } 50% { transform: translateY(4%) } }
@keyframes baoPulse { 0%,100% { box-shadow: 0 0 0 0.25cqw rgba(110,231,183,.85), 0 0 1.6cqw rgba(110,231,183,.6) } 50% { box-shadow: 0 0 0 0.5cqw rgba(110,231,183,.5), 0 0 2.6cqw rgba(110,231,183,.35) } }
`;

const BOWL: CSSProperties = {
  background: "radial-gradient(circle at 50% 64%, #8d6c4b 0%, #6c5036 38%, #4a3523 72%, #2f2114 100%)",
  boxShadow:
    "inset 0 0.9cqw 1.3cqw rgba(0,0,0,.7), inset 0 -0.25cqw 0.4cqw rgba(255,226,180,.16), 0 0.15cqw 0 rgba(255,236,205,.22), 0 -0.1cqw 0 rgba(0,0,0,.35)",
};

/** The pieces of a move the player has chosen so far. */
type Pick = { pit: number; dir?: -1 | 0 | 1; kichwa?: -1 | 0 | 7 };

/**
 * The Bao board. When `sowing` is set it plays the move out from the rules' own trace: a seed leaves
 * the store, the hand lifts and drops seeds pit by pit (counts tick as it goes), captured seeds fly
 * across to the kichwa. Tapping the board (or Space, Enter or Escape) skips to the end.
 *
 * Input: tap a green-ringed pit, then pick what the rules leave open: a direction (arrows beside the
 * pit), a kichwa (glowing end pits), or stop / safari at the nyumba. Keys: 1-8 pick your front pit
 * A1-A8, the arrow keys pick a direction or kichwa, S / X choose safari / stop, Escape cancels.
 */
export function BaoBoard({ state, me, legal, onMove, theirLast = null, myLast = null, sowing = null, onSowDone }: BoardProps) {
  const fx = useGameFx();
  const queue = usePopQueue();
  const grainId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const trace = useMemo(() => (sowing ? traceMove(sowing.from, sowing.move) : null), [sowing]);
  const plan = useMemo(() => (trace ? schedule(trace) : null), [trace]);
  // Where the animation is: the hand is heading to step `hand`; steps up to `shown` have landed.
  const [anim, setAnim] = useState<{ id: string; hand: number; shown: number; done: boolean } | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const skipRef = useRef<() => void>(() => {});
  const doneId = useRef<string | null>(null);
  const onDoneRef = useRef(onSowDone);
  const warnedFrontRow = useRef(false);
  useEffect(() => {
    onDoneRef.current = onSowDone;
  });

  useEffect(() => {
    if (!sowing || !trace || !plan || doneId.current === sowing.id) return;
    const { id, from } = sowing;
    const mover = from.turn;
    const mine = mover === me;
    const last = trace.steps.length - 1;
    let hand = -1;
    let shown = -2;
    let saidCapture = false;
    const said = new Set<number>();
    let cancel = () => {};

    const sayCapture = () => {
      // Small captures just fly across; three seeds or more is worth a shout.
      if (saidCapture || trace.captured < 3) return;
      saidCapture = true;
      const sub = trace.captures > 1 ? `${trace.captures} captures in one move` : undefined;
      vibrate(mine ? 25 : [30, 40, 30]);
      if (mine) {
        queue(`Capture: ${trace.captured} seeds`, { tone: trace.captured >= 10 ? "great" : "good", emoji: "🫘", sub });
        if (trace.captured >= 10) fx.confetti(25);
      } else {
        queue(`Capture: ${trace.captured} seeds`, { tone: "bad", emoji: "💥", sub: sub ?? "taken from your front row" });
        fx.shake();
      }
    };
    /** Moments that belong to one step, said as the hand gets there. */
    const sayStep = (i: number, st: Step) => {
      if (said.has(i)) return;
      said.add(i);
      if (st.kind === "capture") sayCapture();
      else if (st.kind === "tax") queue("Nyumba taxed", { tone: "info", emoji: "🏠", sub: mine ? "2 seeds sown, your house stands" : "they sow 2 from their house" });
      else if (st.kind === "safari") {
        queue("Safari!", { tone: mine ? "great" : "warn", emoji: "🐪", sub: mine ? "your nyumba sets out: its powers are spent" : "their nyumba sets out" });
        vibrate(20);
      }
    };

    const finish = () => {
      if (doneId.current === id) return;
      doneId.current = id;
      cancel();
      setAnim({ id, hand: last, shown: last, done: true });
      trace.steps.forEach((st, i) => sayStep(i, st));
      const end = trace.final;
      if (trace.reason === "lala") queue("Lala: stopped in the nyumba", { tone: "info", emoji: "🏠" });
      if (trace.reason === "limit") queue("Endless sowing cut off", { tone: "info", emoji: "♾️", sub: "the move stops after 1000 seeds" });
      if (trace.relays >= 5 || trace.sown >= 40) {
        queue("Big relay!", { tone: "info", emoji: "🔁", sub: `${trace.sown} seeds sown${trace.relays ? `, ${trace.relays} pick-ups` : ""}` });
      }
      const them = (1 - me) as Side;
      const safariByMe = mine && trace.steps.some((st) => st.kind === "safari");
      if (from.house[me] && !end.house[me] && !safariByMe) queue("Your nyumba is gone", { tone: "warn", emoji: "🏚️", sub: mine ? "you sowed it out" : "they captured it" });
      if (from.house[them] && !end.house[them] && mine) queue("Their nyumba is gone", { tone: "good", emoji: "🏚️" });
      if (from.store[0] + from.store[1] > 0 && end.store[0] + end.store[1] === 0) {
        queue("Namua over: Mtaji begins", { tone: "great", emoji: "🌾", sub: "no seeds in hand: sow from your pits" });
      }
      if (end.blocked >= 0 && end.turn === me) queue(`Your ${pitName(end.blocked)} is takasiaed`, { tone: "warn", emoji: "🔒", sub: "you can't play it this turn" });
      // Once a game: warn when the viewer's front row is nearly empty (an empty front row loses).
      const front = Array.from({ length: 8 }, (_, k) => end.board[me * 16 + k]).filter((n) => n > 0).length;
      if (front > 0 && front <= 2 && !warnedFrontRow.current) {
        warnedFrontRow.current = true;
        queue("Front row in danger", { tone: "warn", emoji: "⚠️", sub: `Only ${front} pit${front > 1 ? "s" : ""} left in front` });
      }
      onDoneRef.current?.(id);
    };
    skipRef.current = finish;

    cancel = animate(
      plan.total,
      (p) => {
        const t = p * plan.total;
        let h = hand < 0 ? 0 : hand;
        while (h < last && plan.at[h + 1] <= t) h++;
        let s = shown < -1 ? -1 : shown;
        while (s < last && plan.land[s + 1] <= t) s++;
        if (h === hand && s === shown) return;
        for (let i = Math.max(0, shown); i <= s; i++) sayStep(i, trace.steps[i]);
        hand = h;
        shown = s;
        setAnim({ id, hand: h, shown: s, done: false });
      },
      "linear",
      finish,
    );
    return () => cancel();
  }, [sowing, trace, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const playing = !!(sowing && trace && plan && !(anim?.id === sowing.id && anim.done));
  const pos = playing && anim?.id === sowing!.id ? anim : { hand: -1, shown: -1 };
  const shownStep = playing && pos.shown >= 0 ? trace!.steps[pos.shown] : null;
  const board = playing ? (shownStep ? shownStep.board : sowing!.from.board) : state.board;
  const stores = playing ? (shownStep ? shownStep.store : sowing!.from.store) : state.store;
  const house = playing ? sowing!.from.house : state.house;
  const step = playing && pos.hand >= 0 ? trace!.steps[pos.hand] : null;
  const them = (1 - me) as Side;

  // ---- Choosing a move ----
  const canChoose = !playing && legal.length > 0 && !!onMove;
  const active = canChoose && pick && legal.some((m) => m.pit === pick.pit) ? pick : null;
  const candidates = active ? legal.filter((m) => m.pit === active.pit && (active.dir === undefined || m.dir === active.dir) && (active.kichwa === undefined || m.kichwa === active.kichwa)) : [];
  const needDir = !!active && active.dir === undefined && candidates[0]?.dir !== 0;
  const needKichwa = !!active && !needDir && active.kichwa === undefined && candidates.some((m) => m.kichwa !== -1);
  const needNyumba = !!active && !needDir && !needKichwa && candidates.length > 1;

  function choose(p: Pick) {
    if (!onMove) return;
    const rest = legal.filter((m) => m.pit === p.pit && (p.dir === undefined || m.dir === p.dir) && (p.kichwa === undefined || m.kichwa === p.kichwa));
    if (!rest.length) return;
    const dirOpen = p.dir === undefined && rest[0].dir !== 0;
    const kichwaOpen = !dirOpen && p.kichwa === undefined && rest.some((m) => m.kichwa !== -1);
    if (!dirOpen && !kichwaOpen && rest.length === 1) {
      setPick(null);
      vibrate(10);
      onMove(rest[0]);
      return;
    }
    setPick(p);
  }
  const chooseNyumba = (ny: typeof SAFARI | typeof STOP) => {
    const m = candidates.find((c) => c.nyumba === ny);
    if (m && onMove) {
      setPick(null);
      vibrate(10);
      onMove(m);
    }
  };

  // Keyboard: 1-8 pick a front pit, arrows a direction or kichwa, S / X the nyumba, Escape cancels.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const onKey = (e: KeyboardEvent) => {
    if (playing) {
      if (e.key === " " || e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        skipRef.current();
      }
      return;
    }
    if (!canChoose) return;
    if (e.key === "Escape") setPick(null);
    else if (/^[1-8]$/.test(e.key)) {
      const k = Number(e.key) - 1;
      if (legal.some((m) => m.pit === k)) choose({ pit: k });
    } else if (active && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const screen = e.key === "ArrowLeft" ? "left" : "right";
      if (needDir) {
        const d = dirFor(active.pit, screen);
        if (candidates.some((m) => m.dir === d)) choose({ ...active, dir: d });
      } else if (needKichwa) choose({ ...active, kichwa: screen === "left" ? 0 : 7 });
    } else if (needNyumba && (e.key === "s" || e.key === "S")) chooseNyumba(SAFARI);
    else if (needNyumba && (e.key === "x" || e.key === "X")) chooseNyumba(STOP);
  };
  useEffect(() => {
    keyRef.current = onKey;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- The hand ----
  const handAt = (i: number) => {
    if (i < 0) {
      const f = sowing!.from;
      return f.store[f.turn] > 0 ? storeXY(f.turn, me) : pitXY(f.turn, sowing!.move.pit, me);
    }
    const st = trace!.steps[i];
    return pitXY(st.side, st.k, me);
  };
  const handPos = playing ? handAt(pos.hand) : null;
  const handMs = playing && plan && pos.hand >= 0 ? plan.dur[pos.hand] * 0.8 : 0;
  const flying = step && (step.kind === "kichwa" || step.kind === "capture" || step.kind === "place");
  const carried = step ? (step.kind === "sow" ? step.hand + 1 : step.kind === "place" ? 1 : step.hand) : sowing && sowing.from.store[sowing.from.turn] > 0 ? 1 : 0;
  const moverMine = sowing?.from.turn === me;

  const nyumbaWorks = (side: Side) => house[side] && board[side * 16 + NYUMBA] >= 6;

  const renderPit = (side: Side, k: number) => {
    const { x, y } = pitXY(side, k, me);
    const n = board[side * 16 + k];
    const mineRow = side === me;
    const playable = canChoose && mineRow && legal.some((m) => m.pit === k);
    const isSel = !!active && mineRow && active.pit === k;
    const kichwaPick = needKichwa && mineRow && (k === 0 || k === 7);
    const blocked = !playing && side === state.turn && state.blocked === k;
    const square = k === NYUMBA;
    const flash = shownStep && shownStep.side === side && shownStep.k === k && (shownStep.kind === "sow" || shownStep.kind === "capture" || shownStep.kind === "place");
    const ring = isSel
      ? "ring-[0.45cqw] ring-emerald-300 scale-105 shadow-[0_0_1.8cqw_rgba(52,211,153,.75)]"
      : playable && !active
        ? "ring-[0.3cqw] ring-emerald-300/70 hover:ring-emerald-200 active:scale-95"
        : playable
          ? "ring-[0.2cqw] ring-emerald-300/40 hover:ring-emerald-200"
          : !playing && !mineRow && theirLast === k
            ? "ring-[0.3cqw] ring-amber-400/90"
            : !playing && mineRow && myLast === k
              ? "ring-[0.15cqw] ring-white/40"
              : "";
    const label = `${mineRow ? "My" : "Their"} ${pitName(k)}${square ? " (nyumba)" : ""}, ${n} seed${n === 1 ? "" : "s"}${blocked ? ", takasiaed" : ""}`;
    return (
      <button
        key={`${side}-${k}`}
        type="button"
        disabled={!(playable || kichwaPick)}
        onClick={() => {
          if (kichwaPick && active) choose({ ...active, kichwa: k as 0 | 7 });
          else if (isSel) setPick(null);
          else choose({ pit: k });
        }}
        aria-label={kichwaPick ? `Sow the captured seeds from ${pitName(k)}` : label}
        className={`absolute block transition-transform duration-200 ${square ? "rounded-[18%]" : "rounded-full"} ${ring}`}
        style={{
          left: px(x - PIT / 2),
          top: py(y - PIT / 2),
          width: px(PIT),
          height: py(PIT),
          ...(kichwaPick ? { animation: "baoPulse 1.1s ease-in-out infinite" } : null),
        }}
      >
        {/* The carved bowl (a separate layer, so the button's ring shadow is not overridden). */}
        <span
          className={`pointer-events-none absolute inset-0 block ${square ? "rounded-[18%]" : "rounded-full"}`}
          style={{
            ...BOWL,
            ...(square
              ? {
                  background: "radial-gradient(ellipse at 50% 64%, #87674a 0%, #66492f 45%, #45311f 80%, #2c1f12 100%)",
                  outline: nyumbaWorks(side) ? "0.22cqw solid rgba(250,214,140,.55)" : "0.22cqw solid rgba(0,0,0,.25)",
                  outlineOffset: "0.35cqw",
                }
              : null),
          }}
        />
        <PitSeeds n={n} id={side * 16 + k} />
        {flash && (
          <span
            key={pos.shown}
            className={`pointer-events-none absolute inset-0 ${square ? "rounded-[18%]" : "rounded-full"}`}
            style={{ animation: `${shownStep!.kind === "capture" ? "baoGrab .5s" : "baoFlash .35s"} ease-out` }}
          />
        )}
        {blocked && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full border-[0.3cqw] border-dashed border-rose-400/90 bg-rose-950/30" style={{ fontSize: "2.4cqw" }}>
            🔒
          </span>
        )}
        {kichwaPick && (
          <span
            className="pointer-events-none absolute left-1/2 top-[-34%] -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-300 px-[0.8cqw] font-bold text-emerald-950 shadow"
            style={{ fontSize: "max(9px, 1.4cqw)" }}
          >
            {k === 0 ? "from here →" : "← from here"}
          </span>
        )}
      </button>
    );
  };

  const renderStore = (side: Side) => {
    const b = storeBox(side, me);
    const n = stores[side];
    return (
      <div
        key={`store-${side}`}
        className="absolute"
        style={{
          left: px(b.x),
          top: py(b.y),
          width: px(b.w),
          height: py(b.h),
          borderRadius: "0.9cqw",
          background: "linear-gradient(180deg, #3e2b1a, #5a412a 70%, #6b4f34)",
          boxShadow: "inset 0 1cqw 1.4cqw rgba(0,0,0,.65), inset 0 -0.2cqw 0.3cqw rgba(255,226,180,.12), 0 0.15cqw 0 rgba(255,236,205,.2)",
        }}
        aria-label={`${side === me ? "Your" : "Their"} store: ${n} seeds in hand`}
        role="img"
      >
        <StoreSeeds n={n} />
        <span
          className={`absolute left-1/2 top-[3%] -translate-x-1/2 rounded-full px-[0.5cqw] text-center font-bold leading-tight shadow ${n ? "bg-black/65 text-amber-50" : "bg-black/30 text-white/40"}`}
          style={{ fontSize: "max(9px, 1.5cqw)" }}
        >
          {n}
        </span>
      </div>
    );
  };

  const leafB = (side: Side) => {
    const b = leafBox(side, me);
    return (
      <div key={`leaf-${side}`} className="pointer-events-none absolute" style={{ left: px(b.x), top: py(b.y), width: px(b.w), height: py(b.h) }}>
        <Leaves flip={side !== me} />
      </div>
    );
  };

  // The direction arrows beside the selected pit.
  const arrows =
    needDir && active
      ? (["left", "right"] as const).map((screen) => {
          const d = dirFor(active.pit, screen);
          if (!candidates.some((m) => m.dir === d)) return null;
          const { x, y } = pitXY(me, active.pit, me);
          const ax = x + (screen === "left" ? -1 : 1) * (CELL / 2 + 0.2);
          const size = 5.4;
          return (
            <button
              key={screen}
              type="button"
              onClick={() => choose({ ...active, dir: d })}
              aria-label={`Sow ${pitName(active.pit)} to the ${screen}`}
              className="absolute z-10 flex items-center justify-center rounded-full border-[0.25cqw] border-emerald-100 bg-gradient-to-b from-emerald-300 to-emerald-600 font-black text-emerald-950 shadow-lg shadow-black/50 transition active:scale-90"
              style={{ left: px(ax - size / 2), top: py(y - size / 2), width: px(size), height: py(size), fontSize: "2.6cqw", animation: "baoPulse 1.1s ease-in-out infinite" }}
            >
              {screen === "left" ? "◀" : "▶"}
            </button>
          );
        })
      : null;

  return (
    <div
      className="@container relative w-full select-none overflow-hidden"
      style={{
        aspectRatio: `${W} / ${H}`,
        borderRadius: "1.6cqw",
        background: "linear-gradient(180deg, #7d634a 0%, #6a523b 48%, #5d4733 52%, #6d553e 100%)",
        boxShadow: "inset 0 0.25cqw 0 rgba(255,240,215,.25), inset 0 -0.4cqw 0 rgba(0,0,0,.4), 0 2cqw 3.5cqw -1.4cqw rgba(0,0,0,.85)",
      }}
    >
      <style>{KEYFRAMES}</style>
      {/* Weathered wood grain running along the board. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        <filter id={`g${grainId}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.09" numOctaves="4" seed="11" />
          <feColorMatrix values="0 0 0 0 0.16  0 0 0 0 0.10  0 0 0 0 0.05  0 0 0 1.25 -0.38" />
        </filter>
        <filter id={`s${grainId}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="3" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.85  0 0 0 0.5 -0.22" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${grainId})`} opacity=".9" />
        <rect width="100%" height="100%" filter={`url(#s${grainId})`} opacity=".35" />
      </svg>
      {/* The two lids, each with a raised rim, meeting at the hinge line. */}
      {[0, 1].map((half) => (
        <div
          key={half}
          className="pointer-events-none absolute"
          style={{
            left: px(1),
            top: py(half ? HINGE_Y + 0.35 : 1),
            width: px(W - 2),
            height: py(HINGE_Y - 1.35),
            borderRadius: "1.1cqw",
            boxShadow: "inset 0 0.2cqw 0 rgba(255,240,215,.2), inset 0 -0.25cqw 0.2cqw rgba(0,0,0,.35), 0 0 0 0.12cqw rgba(30,18,8,.35)",
          }}
        />
      ))}
      <div
        className="pointer-events-none absolute inset-x-0"
        style={{ top: py(HINGE_Y - 0.35), height: py(0.7), background: "linear-gradient(180deg, rgba(0,0,0,.65), rgba(20,10,4,.85) 50%, rgba(255,230,190,.18))" }}
      />
      <Hinge x={W * 0.2} />
      <Hinge x={W * 0.8} />

      {renderStore(them)}
      {renderStore(me)}
      {leafB(them)}
      {leafB(me)}
      {([them, me] as Side[]).map((side) => Array.from({ length: 16 }, (_, k) => renderPit(side, k)))}
      {arrows}

      {/* The sowing hand: glides pit to pit with the seeds it holds. */}
      {playing && handPos && (
        <div
          className="pointer-events-none absolute z-10 flex items-center justify-center"
          style={{
            left: px(handPos.x - CELL / 2),
            top: py(handPos.y - CELL / 2),
            width: px(CELL),
            height: py(CELL),
            transition: `left ${handMs}ms ${flying ? "cubic-bezier(.2,.75,.3,1)" : "cubic-bezier(.45,0,.55,1)"}, top ${handMs}ms ${flying ? "cubic-bezier(.2,.75,.3,1)" : "cubic-bezier(.45,0,.55,1)"}`,
          }}
        >
          <div
            className={`flex aspect-square w-[58%] items-center justify-center rounded-full border-[0.25cqw] font-extrabold shadow-lg ${
              step?.captured
                ? "border-rose-200 bg-gradient-to-br from-rose-400 to-fuchsia-600 text-white shadow-rose-500/60"
                : moverMine
                  ? "border-emerald-100 bg-gradient-to-br from-emerald-300 to-teal-600 text-emerald-950 shadow-emerald-400/60"
                  : "border-amber-100 bg-gradient-to-br from-amber-300 to-orange-600 text-amber-950 shadow-amber-400/60"
            }`}
            style={{ animation: "baoBob .5s ease-in-out infinite", opacity: carried > 0 ? 1 : 0.55, fontSize: "max(10px, 2cqw)" }}
          >
            {step?.kind === "safari" ? "🐪" : carried > 0 ? carried : "✓"}
          </div>
        </div>
      )}

      {/* Stop or safari, when a capture's sowing will end in my nyumba. */}
      {needNyumba && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35">
          <div className="mx-[4%] rounded-2xl bg-[#1b130c]/95 p-[1.6cqw] text-center shadow-2xl ring-1 ring-amber-200/30">
            <div className="font-semibold text-amber-100" style={{ fontSize: "max(12px, 2cqw)" }}>
              This capture ends in your nyumba
            </div>
            <div className="mt-[1cqw] flex justify-center gap-[1.4cqw]">
              <button
                type="button"
                onClick={() => chooseNyumba(STOP)}
                className="rounded-xl bg-gradient-to-b from-sky-300 to-sky-600 px-[2cqw] py-[0.9cqw] font-bold text-sky-950 shadow-lg active:scale-95"
                style={{ fontSize: "max(12px, 1.8cqw)" }}
              >
                Stop there (X)
              </button>
              <button
                type="button"
                onClick={() => chooseNyumba(SAFARI)}
                className="rounded-xl bg-gradient-to-b from-amber-300 to-orange-500 px-[2cqw] py-[0.9cqw] font-bold text-amber-950 shadow-lg active:scale-95"
                style={{ fontSize: "max(12px, 1.8cqw)" }}
              >
                Safari: sow on (S)
              </button>
            </div>
            <div className="mt-[0.8cqw] text-white/60" style={{ fontSize: "max(10px, 1.35cqw)" }}>
              Safari lifts the house and ends its powers.{" "}
              <button type="button" className="underline" onClick={() => setPick(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {playing && (
        <button
          type="button"
          onClick={() => skipRef.current()}
          className="absolute inset-0 z-30 flex cursor-pointer items-end justify-center"
          aria-label="Skip the sowing animation"
        >
          <span className="mb-[0.6cqw] rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white/85">Tap to skip ⏩</span>
        </button>
      )}
    </div>
  );
}

/** One line on what the player must do now, for the status box under the board. */
export function choiceHint(s: State, legal: Move[]): string {
  if (!legal.length) return "";
  if (mustCapture(s)) return s.store[s.turn] > 0 ? "You must capture: tap a green pit to add your seed" : "You must capture: tap a green pit, then an arrow";
  return s.store[s.turn] > 0 ? "No capture: tap a green pit to add your seed, then an arrow" : "No capture: tap a green pit, then an arrow";
}

/** "Namua: 18 seeds in hand" or "Mtaji", for a side. */
export const phaseText = (s: State, side: Side) => (s.store[side] > 0 ? `Namua: ${s.store[side]} seed${s.store[side] === 1 ? "" : "s"} in hand` : "Mtaji");
