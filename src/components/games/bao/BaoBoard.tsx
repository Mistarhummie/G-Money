"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Board, Move, Side } from "@/lib/games/arcade/bao";
import { useGameFx, type PopOptions } from "../fx/GameFx";
import { animate, vibrate } from "../fx/motion";
import { schedule, traceMove } from "./sowing";

// Shared Bao board UI, used by the vs-computer game and the two-player board.
// Rows top to bottom: opponent outer, opponent inner, my inner, my outer. Each maps a screen
// column (0..7, left to right as I see it) to a pit index k of that side (see bao.ts).
const ROWS: { mine: boolean; k: (c: number) => number }[] = [
  { mine: false, k: (c) => 8 + c },
  { mine: false, k: (c) => 7 - c },
  { mine: true, k: (c) => c },
  { mine: true, k: (c) => 15 - c },
];

/** Screen row and column of pit `k` of `side`, with `me` drawn at the bottom. */
function screenOf(side: Side, k: number, me: Side): [number, number] {
  if (side === me) return k < 8 ? [2, k] : [3, 15 - k];
  return k >= 8 ? [0, k - 8] : [1, 7 - k];
}

/** Screen direction to sowing direction: on my inner row "right" is clockwise, on my outer row it is anticlockwise. */
export const dirFor = (pit: number, screen: "left" | "right"): 1 | -1 => ((pit < 8) === (screen === "right") ? 1 : -1);

// ---- Seeds ------------------------------------------------------------------------------------

const SEED_COLOURS = [
  ["#fff7e0", "#e2c48f"],
  ["#f3dcc8", "#b9825a"],
  ["#e6f0e2", "#8fae8b"],
  ["#fde7c4", "#e0a64b"],
  ["#e8eef5", "#93a6bd"],
  ["#f6d9d9", "#c07c7c"],
  ["#efe6ff", "#a48cc9"],
];
const SHOWN_SEEDS = 14;
/** Fixed spots on a golden-angle spiral, so a new seed never shuffles the ones already there. */
const SPOTS = Array.from({ length: SHOWN_SEEDS }, (_, i) => {
  const r = 0.29 * Math.sqrt((i + 0.6) / SHOWN_SEEDS);
  const a = i * 2.39996;
  return { x: 50 + r * 100 * Math.cos(a), y: 47 + r * 100 * Math.sin(a), rot: (a * 180) / Math.PI };
});

function Seeds({ n, pit }: { n: number; pit: number }) {
  return (
    <>
      {SPOTS.slice(0, Math.min(n, SHOWN_SEEDS)).map((s, i) => {
        const [light, dark] = SEED_COLOURS[(i * 3 + pit * 5) % SEED_COLOURS.length];
        return (
          <span
            key={i}
            className="pointer-events-none absolute block rounded-[50%]"
            style={{
              left: `${s.x - 11}%`,
              top: `${s.y - 8}%`,
              width: "22%",
              height: "16%",
              rotate: `${s.rot}deg`,
              background: `radial-gradient(circle at 35% 30%, ${light}, ${dark} 70%)`,
              boxShadow: "0 1px 2px rgba(0,0,0,.55)",
              animation: "baoSeed .3s cubic-bezier(.3,1.5,.5,1) both",
            }}
          />
        );
      })}
      {n > 0 && (
        <span
          key={n}
          className="pointer-events-none absolute bottom-[2%] left-1/2 min-w-[34%] -translate-x-1/2 rounded-full bg-black/60 px-1 text-center text-[clamp(9px,2.4vw,15px)] font-bold leading-tight text-amber-50 shadow"
          style={{ animation: "baoTick .25s ease-out" }}
        >
          {n}
        </span>
      )}
    </>
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

// ---- Board ------------------------------------------------------------------------------------

/** A move to animate: `from` is the board before it, `id` names it (a new id starts a new animation). */
export type Sowing = { id: string; from: Board; side: Side; move: Move };

type BoardProps = {
  board: Board;
  /** The side drawn at the bottom (the viewer's rows). */
  me: Side;
  /** Legal moves for `me` (empty when it is not my turn). */
  legal: Move[];
  selected: number | null;
  onSelect: (pit: number | null) => void;
  /** Pit the opponent last played from (amber ring). */
  theirLast?: number | null;
  /** Pit I last played from (faint ring). */
  myLast?: number | null;
  /** The move to sow visibly, ending on `board`. Keep the object stable while it plays. */
  sowing?: Sowing | null;
  /** Called once when the sowing has finished or was skipped. */
  onSowDone?: (id: string) => void;
};

const KEYFRAMES = `
@keyframes baoSeed { from { transform: translateY(-140%) scale(.5); opacity: 0 } 60% { opacity: 1 } to { transform: none; opacity: 1 } }
@keyframes baoTick { 0% { transform: scale(1.5) } 100% { transform: scale(1) } }
@keyframes baoFlash { from { box-shadow: 0 0 0 3px rgba(253,230,138,.9), 0 0 18px rgba(253,230,138,.7) } to { box-shadow: 0 0 0 0 transparent } }
@keyframes baoGrab { from { box-shadow: 0 0 0 4px rgba(251,113,133,.95), 0 0 24px rgba(251,113,133,.8) } to { box-shadow: 0 0 0 0 transparent } }
@keyframes baoBob { 0%,100% { transform: translateY(-6%) } 50% { transform: translateY(4%) } }
`;

const WOOD: CSSProperties = {
  background: [
    "repeating-linear-gradient(92deg, rgba(255,255,255,.035) 0 2px, transparent 2px 7px, rgba(0,0,0,.05) 7px 9px, transparent 9px 15px)",
    "radial-gradient(ellipse at 30% 20%, rgba(255,214,150,.25), transparent 60%)",
    "linear-gradient(180deg, #9a6233 0%, #7a4521 45%, #5e3216 100%)",
  ].join(", "),
  boxShadow: "inset 0 2px 0 rgba(255,255,255,.18), inset 0 -3px 0 rgba(0,0,0,.35), 0 16px 30px -12px rgba(0,0,0,.8)",
};

const PIT: CSSProperties = {
  background: "radial-gradient(circle at 50% 38%, #24120a 0%, #3a1f0f 55%, #57311a 100%)",
  boxShadow: "inset 0 4px 8px rgba(0,0,0,.7), inset 0 -2px 3px rgba(255,200,140,.12), 0 1px 0 rgba(255,255,255,.14)",
};

/**
 * The Bao board. When `sowing` is set it plays the move out: the hand lifts the seeds, drops them one
 * pit at a time (counts tick as it goes), relays, and carries captured seeds across to the kichwa.
 * Tapping the board (or Space, Enter or Escape) skips to the end.
 */
export function BaoBoard({ board, me, legal, selected, onSelect, theirLast = null, myLast = null, sowing = null, onSowDone }: BoardProps) {
  const fx = useGameFx();
  const queue = usePopQueue();
  const trace = useMemo(() => (sowing ? traceMove(sowing.from, sowing.side, sowing.move) : null), [sowing]);
  const plan = useMemo(() => (trace ? schedule(trace) : null), [trace]);
  // Where the animation is: the hand is heading to step `hand`; steps up to `shown` have landed.
  const [anim, setAnim] = useState<{ id: string; hand: number; shown: number; done: boolean } | null>(null);
  const skipRef = useRef<() => void>(() => {});
  const doneId = useRef<string | null>(null);
  const onDoneRef = useRef(onSowDone);
  const warnedFrontRow = useRef(false);
  useEffect(() => {
    onDoneRef.current = onSowDone;
  });

  useEffect(() => {
    if (!sowing || !trace || !plan || doneId.current === sowing.id) return;
    const { id } = sowing;
    const mine = sowing.side === me;
    const last = trace.steps.length - 1;
    let hand = -1;
    let shown = -2;
    let saidCapture = false;
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

    const finish = () => {
      if (doneId.current === id) return;
      doneId.current = id;
      cancel();
      setAnim({ id, hand: last, shown: last, done: true });
      sayCapture();
      if (trace.relays >= 5 || trace.sown >= 40) {
        queue("Big relay!", { tone: "info", emoji: "🔁", sub: `${trace.sown} seeds sown${trace.relays ? `, ${trace.relays} pick-ups` : ""}` });
      }
      // Once a game: warn when the viewer's front row is nearly empty (an empty front row loses).
      const front = Array.from({ length: 8 }, (_, k) => trace.final[me * 16 + k]).filter((n) => n > 0).length;
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
        hand = h;
        shown = s;
        if (s >= 0 && trace.steps[s].kind === "capture") sayCapture();
        setAnim({ id, hand: h, shown: s, done: false });
      },
      "linear",
      finish,
    );
    return () => cancel();
  }, [sowing, trace, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const playing = !!(sowing && trace && plan && !(anim?.id === sowing.id && anim.done));
  const pos = playing && anim?.id === sowing!.id ? anim : { hand: 0, shown: -1 };
  const shownBoard = playing ? (pos.shown >= 0 ? trace!.steps[pos.shown].board : sowing!.from) : board;
  const step = playing ? trace!.steps[pos.hand] : null;
  const landed = playing && pos.shown >= 0 ? trace!.steps[pos.shown] : null;

  // Space, Enter or Escape skip the animation.
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        skipRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  const handAt = step ? screenOf(step.side, step.k, me) : null;
  const handMs = playing && plan ? plan.dur[pos.hand] * 0.8 : 0;
  const afterCapture = playing && pos.hand > 0 && trace!.steps[pos.hand - 1].kind === "capture";
  const moverMine = sowing?.side === me;

  return (
    <div className="relative rounded-2xl p-[2.5%]" style={WOOD}>
      <style>{KEYFRAMES}</style>
      <div className="relative grid aspect-[2/1] grid-cols-8 grid-rows-4">
        {/* The groove between the two players' halves. */}
        <div className="pointer-events-none absolute inset-x-[1%] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-black/35 shadow-[0_1px_0_rgba(255,255,255,.15)]" />
        {ROWS.map((row, r) =>
          Array.from({ length: 8 }, (_, c) => {
            const k = row.k(c);
            const side = (row.mine ? me : 1 - me) as Side;
            const n = shownBoard[side * 16 + k];
            const canPick = !playing && row.mine && legal.some((m) => m.pit === k);
            const isSel = !playing && row.mine && selected === k;
            const ring = isSel
              ? "ring-[3px] ring-emerald-300 scale-105 shadow-[0_0_16px_rgba(52,211,153,.7)]"
              : canPick
                ? "ring-2 ring-emerald-300/60 hover:ring-emerald-300 active:scale-95"
                : !playing && !row.mine && theirLast === k
                  ? "ring-2 ring-amber-400/90"
                  : !playing && row.mine && myLast === k
                    ? "ring-1 ring-white/35"
                    : "";
            const flash = landed && landed.side === side && landed.k === k;
            return (
              <div key={`${r}-${c}`} className="relative p-[9%]">
                <button
                  type="button"
                  disabled={!canPick}
                  onClick={() => onSelect(isSel ? null : k)}
                  aria-label={`${row.mine ? "My" : "Opponent"} pit, ${n} seeds`}
                  className={`relative block h-full w-full rounded-full transition-transform duration-200 ${ring}`}
                  style={PIT}
                >
                  <Seeds n={n} pit={side * 16 + k} />
                  {flash && (
                    <span
                      key={pos.shown}
                      className="pointer-events-none absolute inset-0 rounded-full"
                      style={{ animation: `${landed!.kind === "capture" ? "baoGrab .5s" : "baoFlash .35s"} ease-out` }}
                    />
                  )}
                </button>
              </div>
            );
          }),
        )}

        {/* The sowing hand: glides pit to pit with the seeds it still holds. */}
        {playing && handAt && step && (
          <div
            className="pointer-events-none absolute left-0 top-0 z-10 flex items-center justify-center"
            style={{
              width: "12.5%",
              height: "25%",
              transform: `translate(${handAt[1] * 100}%, ${handAt[0] * 100}%)`,
              transition: `transform ${handMs}ms ${afterCapture ? "cubic-bezier(.2,.75,.3,1)" : "cubic-bezier(.45,0,.55,1)"}`,
            }}
          >
            <div
              className={`flex aspect-square w-[62%] items-center justify-center rounded-full border-2 text-[clamp(10px,2.6vw,16px)] font-extrabold shadow-lg ${
                step.captured
                  ? "border-rose-200 bg-gradient-to-br from-rose-400 to-fuchsia-600 text-white shadow-rose-500/60"
                  : moverMine
                    ? "border-emerald-100 bg-gradient-to-br from-emerald-300 to-teal-600 text-emerald-950 shadow-emerald-400/60"
                    : "border-amber-100 bg-gradient-to-br from-amber-300 to-orange-600 text-amber-950 shadow-amber-400/60"
              }`}
              style={{ animation: "baoBob .5s ease-in-out infinite", opacity: step.hand > 0 || step.kind !== "drop" ? 1 : 0.55 }}
            >
              {step.hand > 0 ? step.hand : "✓"}
            </div>
          </div>
        )}
      </div>

      {playing && (
        <button
          type="button"
          onClick={() => skipRef.current()}
          className="absolute inset-0 z-20 flex cursor-pointer items-end justify-center rounded-2xl pb-1"
          aria-label="Skip the sowing animation"
        >
          <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white/85">Tap to skip ⏩</span>
        </button>
      )}
    </div>
  );
}

/** The ← / → buttons shown once a pit is selected. */
export function DirectionPicker({ pit, legal, onPick }: { pit: number; legal: Move[]; onPick: (dir: 1 | -1) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["left", "right"] as const).map((screen) => {
        const dir = dirFor(pit, screen);
        const ok = legal.some((m) => m.pit === pit && m.dir === dir);
        return (
          <button
            key={screen}
            type="button"
            disabled={!ok}
            onClick={() => onPick(dir)}
            className="rounded-xl bg-gradient-to-b from-emerald-300 to-emerald-600 py-3 text-lg font-bold text-emerald-950 shadow-lg shadow-emerald-900/40 transition active:scale-95 disabled:from-white/5 disabled:to-white/5 disabled:text-white/30 disabled:shadow-none"
          >
            {screen === "left" ? "← Sow left" : "Sow right →"}
          </button>
        );
      })}
    </div>
  );
}

/** Arrow keys sow the selected pit, Escape cancels. Returns a keydown handler to attach to window. */
export function arrowKeyHandler(selected: number | null, legal: Move[], onSelect: (pit: number | null) => void, onPick: (pit: number, dir: 1 | -1) => void) {
  return (e: KeyboardEvent) => {
    if (selected === null) return;
    if (e.key === "Escape") onSelect(null);
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = dirFor(selected, e.key === "ArrowLeft" ? "left" : "right");
      if (legal.some((m) => m.pit === selected && m.dir === dir)) onPick(selected, dir);
    }
  };
}
