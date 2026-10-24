"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cellAt, COLS, ROWS, winningLine, type C4State } from "@/lib/games/arcade/connect4";
import { useGameFx, type PopOptions } from "../fx/GameFx";
import { animate, vibrate } from "../fx/motion";

/** What the board shows; rebuilt from the game after every move. */
export type C4View = {
  cells: number[][]; // [col][row], row 0 at the bottom; 1 = side 0 (green), 2 = side 1 (amber)
  /** [col][row]: the move number (0-based) that put the disc there, -1 when empty. */
  order: number[][];
  /** Discs on the board. */
  moves: number;
  result: C4State["result"];
  turn: 1 | 2;
  last: [number, number] | null;
  win: string[];
};

export function viewOf(g: C4State): C4View {
  const cells = Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, (_, r) => cellAt(g, c, r)));
  const order = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => -1));
  const heights = Array.from({ length: COLS }, () => 0);
  g.history.forEach((c, i) => (order[c][heights[c]++] = i));
  const lastCol = g.history[g.history.length - 1];
  return {
    cells,
    order,
    moves: g.history.length,
    result: g.result,
    turn: g.turn,
    last: lastCol === undefined ? null : [lastCol, g.heights[lastCol] - 1],
    win: (winningLine(g) ?? []).map(([c, r]) => `${c},${r}`),
  };
}

// ---- Falling physics ----------------------------------------------------------------------------
// Distances are in cells. A disc falls from rest under gravity, hits the bottom and bounces twice,
// each bounce keeping a fraction of the speed. Higher drops take longer and land harder.

const GRAVITY = 80; // cells / s²
const RESTITUTION = 0.2;

type Fall = { d: number; t0: number; v1: number; t1: number; v2: number; t2: number; total: number };

function fallPlan(d: number): Fall {
  const t0 = Math.sqrt((2 * d) / GRAVITY);
  const v1 = GRAVITY * t0 * RESTITUTION;
  const v2 = v1 * RESTITUTION;
  const t1 = (2 * v1) / GRAVITY;
  const t2 = (2 * v2) / GRAVITY;
  return { d, t0, v1, t1, v2, t2, total: t0 + t1 + t2 };
}

/** Transform of the disc `t` seconds into its fall. */
function fallTransform(f: Fall, t: number): string {
  let y = 0;
  let squash = 0;
  if (t < f.t0) y = -(f.d - 0.5 * GRAVITY * t * t);
  else {
    const after = t - f.t0;
    // A quick squash on impact, stronger for longer drops.
    if (after < 0.08) squash = (1 - after / 0.08) * Math.min(1, f.d / 4) * 0.12;
    if (after < f.t1) y = -(f.v1 * after - 0.5 * GRAVITY * after * after);
    else if (after - f.t1 < f.t2) {
      const b = after - f.t1;
      y = -(f.v2 * b - 0.5 * GRAVITY * b * b);
    }
  }
  return `translateY(${(y * 100).toFixed(2)}%) scale(${(1 + squash / 2).toFixed(3)}, ${(1 - squash).toFixed(3)})`;
}

/** How long the disc dropped into row `r` takes to land, in ms. */
export const landingMs = (r: number) => fallPlan(ROWS - r).total * 1000;

// ---- Discs ------------------------------------------------------------------------------------

const FACES: Record<1 | 2, CSSProperties> = {
  1: {
    background: "radial-gradient(circle at 34% 28%, #d1fae5 0%, #34d399 30%, #059669 68%, #064e3b 100%)",
    boxShadow: "inset 0 -4px 8px rgba(0,0,0,.35), inset 0 2px 4px rgba(255,255,255,.45), 0 0 14px rgba(52,211,153,.35)",
  },
  2: {
    background: "radial-gradient(circle at 34% 28%, #fef9c3 0%, #fbbf24 30%, #f59e0b 62%, #9a3412 100%)",
    boxShadow: "inset 0 -4px 8px rgba(0,0,0,.35), inset 0 2px 4px rgba(255,255,255,.5), 0 0 14px rgba(251,191,36,.35)",
  },
};

/** A disc's face: glossy gradient with the moulded inner ring real discs have. */
export function DiscFace({ v, full = false, className = "", style }: { v: 1 | 2; full?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span className={`absolute block rounded-full ${full ? "inset-0" : "inset-[10%]"} ${className}`} style={{ ...FACES[v], ...style }}>
      <span className="absolute inset-[22%] rounded-full border-2 border-black/15 shadow-[inset_0_1px_2px_rgba(255,255,255,.35)]" />
    </span>
  );
}

function Disc({ c, r, v, fall, win, dim, last }: { c: number; r: number; v: 1 | 2; fall: boolean; win: boolean; dim: boolean; last: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  // Before the first paint, lift a new disc up to the hover row; then let it fall.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!fall || !el) return;
    const plan = fallPlan(ROWS - r);
    el.style.transform = fallTransform(plan, 0);
    return animate(plan.total * 1000, (p) => (el.style.transform = fallTransform(plan, p * plan.total)), "linear", () => {
      el.style.transform = "";
    });
  }, [fall, r]);

  return (
    <span
      ref={ref}
      className="absolute block will-change-transform"
      style={{
        left: `${(c * 100) / COLS}%`,
        top: `${((ROWS - 1 - r) * 100) / ROWS}%`,
        width: `${100 / COLS}%`,
        height: `${100 / ROWS}%`,
        transformOrigin: "50% 90%",
      }}
    >
      <DiscFace
        v={v}
        className={`transition-opacity duration-500 ${dim ? "opacity-40" : ""}`}
        style={win ? { animation: `c4win 0.9s ease-in-out ${fall ? landingMs(r) + 50 : 0}ms infinite` } : undefined}
      />
      {last && !win && <span className="absolute left-1/2 top-1/2 h-[12%] w-[12%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow" />}
    </span>
  );
}

// ---- Board ------------------------------------------------------------------------------------

// The frame: a blue moulded panel with round holes cut out by a repeating mask, and a dark bevel round each hole.
const TILE = `${100 / COLS}% ${100 / ROWS}%`;
const HOLE_MASK = "radial-gradient(circle closest-side, transparent 0 72%, #000 74%)";
const FRAME: CSSProperties = {
  background: [
    `radial-gradient(circle closest-side, rgba(3,7,30,.65) 72%, rgba(255,255,255,.16) 79%, transparent 86%) 0 0 / ${TILE}`,
    "linear-gradient(160deg, #5b8cff 0%, #2f5ae0 35%, #1f3fb3 70%, #172c80 100%)",
  ].join(", "),
  maskImage: HOLE_MASK,
  WebkitMaskImage: HOLE_MASK,
  maskSize: TILE,
  WebkitMaskSize: TILE,
  maskRepeat: "repeat",
  WebkitMaskRepeat: "repeat",
};

const KEYFRAMES = `
@keyframes c4win { 0%,100% { transform: scale(1); filter: brightness(1) drop-shadow(0 0 0 #fff) }
  50% { transform: scale(1.12); filter: brightness(1.25) drop-shadow(0 0 10px #fff) } }
@keyframes c4bob { 0%,100% { transform: translateY(-4%) } 50% { transform: translateY(6%) } }
`;

/**
 * The Connect Four board, shared by the vs-computer and two-player games. Discs fall from the hover
 * row under gravity, bounce on landing, and the winning four pulse. `ghost` shows the opponent's
 * disc hovering over the column it is about to drop into.
 */
export function Connect4Board({
  view,
  canDrop,
  onDrop,
  ghost = null,
}: {
  view: C4View;
  canDrop: boolean;
  onDrop: (col: number) => void;
  ghost?: number | null;
}) {
  const [cursor, setCursor] = useState(3);
  // Discs already on the board when it first shows don't fall; every later one does.
  const [fallFrom] = useState(view.moves);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!canDrop) return;
      if (e.key >= "1" && e.key <= "7") onDrop(Number(e.key) - 1);
      else if (e.key === "ArrowLeft") setCursor((c) => Math.max(0, c - 1));
      else if (e.key === "ArrowRight") setCursor((c) => Math.min(COLS - 1, c + 1));
      else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") onDrop(cursor);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hoverCol = canDrop ? cursor : ghost;
  const won = view.win.length > 0;

  return (
    <div className="relative mx-auto aspect-square w-full touch-manipulation select-none">
      <style>{KEYFRAMES}</style>

      {/* The disc in hand, gliding above the columns. */}
      <div className="absolute inset-x-0 top-0" style={{ height: `${100 / (ROWS + 1)}%` }}>
        <div
          className="absolute top-0 h-full transition-[transform,opacity] duration-300 ease-[cubic-bezier(.45,0,.2,1)]"
          style={{ width: `${100 / COLS}%`, transform: `translateX(${(hoverCol ?? 3) * 100}%)`, opacity: hoverCol === null || view.result ? 0 : 1 }}
        >
          <DiscFace v={view.turn} style={{ animation: "c4bob 1.4s ease-in-out infinite" }} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0" style={{ height: `${(100 * ROWS) / (ROWS + 1)}%` }}>
        {/* Seen through the empty holes. */}
        <div className="absolute inset-0 rounded-[4%] bg-gradient-to-b from-[#0b1430] to-[#050914]" />
        {view.cells.map((col, c) =>
          col.map((v, r) =>
            v === 0 ? null : (
              <Disc
                key={`${c},${r},${v}`}
                c={c}
                r={r}
                v={v as 1 | 2}
                fall={view.order[c][r] >= fallFrom}
                win={view.win.includes(`${c},${r}`)}
                dim={won && !view.win.includes(`${c},${r}`)}
                last={view.last?.[0] === c && view.last?.[1] === r}
              />
            ),
          ),
        )}
        <div className="pointer-events-none absolute inset-0 rounded-[4%] shadow-[0_14px_30px_-10px_rgba(0,0,0,.8)]" style={FRAME} />
        <div className="pointer-events-none absolute inset-0 rounded-[4%] ring-1 ring-inset ring-white/20" />
      </div>

      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {view.cells.map((col, c) => (
          <button
            key={c}
            type="button"
            aria-label={`Drop in column ${c + 1}`}
            onClick={() => onDrop(c)}
            onMouseEnter={() => setCursor(c)}
            onFocus={() => setCursor(c)}
            disabled={!canDrop || col[ROWS - 1] !== 0}
            className="group relative rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <span
              className={`pointer-events-none absolute inset-x-[6%] bottom-0 top-[14%] rounded-xl transition-colors duration-200 ${
                canDrop && cursor === c ? "bg-white/[.07]" : ""
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Mid-game popups --------------------------------------------------------------------------

/** Pops one at a time, at least `gap` ms apart, so moments never pile up. */
export function usePopQueue(gap = 1000) {
  const fx = useGameFx();
  const next = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (text: string, opts: PopOptions = {}, delay = 0) => {
    const now = Date.now();
    const at = Math.max(now + delay, next.current);
    next.current = at + gap;
    timers.current.push(setTimeout(() => fx.pop(text, opts), at - now));
  };
}

/** True if `side` dropping into (c, r) would make four. */
function wouldWin(cells: number[][], c: number, r: number, side: number): boolean {
  const at = (cc: number, rr: number) => cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS && cells[cc][rr] === side;
  for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let n = 1;
    for (let k = 1; at(c + dc * k, r + dr * k); k++) n++;
    for (let k = 1; at(c - dc * k, r - dr * k); k++) n++;
    if (n >= 4) return true;
  }
  return false;
}

/** Cells `side` could win with on their very next drop, as "c,r". */
function threats(cells: number[][], side: number): string[] {
  const out: string[] = [];
  cells.forEach((col, c) => {
    const r = col.indexOf(0);
    if (r !== -1 && wouldWin(cells, c, r, side)) out.push(`${c},${r}`);
  });
  return out;
}

/**
 * "Threat!", "Double threat!" and "Blocked!" popups after each new disc lands, told from the
 * viewer's side (`me` is their disc value, null for a spectator).
 */
export function useConnect4Moments(view: C4View | null, me: 1 | 2 | null) {
  const queue = usePopQueue();
  const prev = useRef<C4View | null>(view);
  useEffect(() => {
    const before = prev.current;
    prev.current = view;
    if (!view || !before || view.moves !== before.moves + 1 || view.result || !view.last) return;
    const [c, r] = view.last;
    const mover = view.cells[c][r];
    const other = mover === 1 ? 2 : 1;
    const mine = me === null ? null : mover === me;
    const delay = landingMs(r);
    if (threats(before.cells, other).includes(`${c},${r}`)) {
      vibrate(20);
      if (mine === false) queue("Blocked!", { tone: "warn", emoji: "🧱", sub: "Your four was stopped" }, delay);
      else queue("Blocked!", { tone: "good", emoji: "🛡️", sub: mine ? "Nice save" : undefined }, delay);
      return;
    }
    const now = threats(view.cells, mover);
    const fresh = now.filter((t) => !threats(before.cells, mover).includes(t));
    if (!fresh.length) return;
    if (now.length >= 2) {
      if (mine === false) queue("Double threat!", { tone: "bad", emoji: "😱", sub: "Two ways to lose" }, delay);
      else queue("Double threat!", { tone: "great", emoji: "🔥", sub: mine ? "They can't block both" : undefined }, delay);
    } else if (mine === false) queue("Threat!", { tone: "warn", emoji: "⚠️", sub: "Four is one drop away" }, delay);
    else queue("Threat!", { tone: "info", emoji: "🎯", sub: mine ? "One more for four" : undefined }, delay);
  }, [view, me]); // eslint-disable-line react-hooks/exhaustive-deps
}
