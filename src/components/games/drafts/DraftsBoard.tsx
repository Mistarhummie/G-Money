"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { colOf, rowOf, squareAt, type Move } from "@/lib/games/arcade/drafts";
import { useGameFx, type PopTone } from "../fx/GameFx";
import { animate, vibrate } from "../fx/motion";

/**
 * The drafts board, shared by the vs-computer and two-player games. It handles picking a piece and
 * tapping its landing squares; the parent decides which moves are allowed and what happens on a move.
 * Each new move is played out on the board: steps glide, captures hop one landing square at a time
 * with an arc while the jumped pieces pop away, and a man reaching the far row is crowned with a flourish.
 */
type Props = {
  /** Cell values for squares 0-31: 1/2 side-0 man/king (green), -1/-2 side-1 man/king (amber). */
  board: number[];
  /** Moves the viewer may make now (empty when it is not their turn). Keep the same array for a turn: a new one clears the selection. */
  moves: Move[];
  /** Squares of the last move (start then every landing square), highlighted and animated. */
  last: number[];
  /** Plies played so far. A move is animated when this goes up by exactly one. */
  ply: number;
  /** Show the board from side 1's point of view (square 1 at the bottom). */
  flipped?: boolean;
  /** The viewer's piece sign for popups (1 green, -1 amber, null a spectator). Defaults to the side at the bottom. */
  you?: 1 | -1 | null;
  onMove: (m: Move) => void;
};

const startsWith = (path: number[], prefix: number[]) => prefix.every((s, i) => path[i] === s);

const JUMP_MS = 320;
const stepMs = (dist: number) => Math.min(360, 190 + 45 * dist);

/** Milliseconds the board takes to play out a move, so a reply can wait for it to land. */
export function moveAnimMs(m: Move): number {
  if (m.captures.length) return JUMP_MS * (m.path.length - 1);
  return stepMs(Math.abs(rowOf(m.path[1]) - rowOf(m.path[0])));
}

/** Everything needed to animate and announce one move. */
type Slide = {
  key: number;
  path: number[];
  /** The piece as it was before the move (a man if it is crowned on arrival). */
  mover: number;
  /** Jumped pieces and the hop (index into path) that took each. */
  caps: { sq: number; piece: number; hop: number }[];
  crowned: boolean;
  /** Duration of each hop. */
  hops: number[];
};

function describe(before: number[], after: number[], path: number[], key: number): Slide | null {
  if (path.length < 2) return null;
  const to = path[path.length - 1];
  const mover = before[path[0]];
  if (!mover || Math.sign(after[to]) !== Math.sign(mover)) return null;
  const caps: Slide["caps"] = [];
  const hops: number[] = [];
  let jumping = false;
  for (let i = 0; i + 1 < path.length; i++) {
    const [r0, c0, r1, c1] = [rowOf(path[i]), colOf(path[i]), rowOf(path[i + 1]), colOf(path[i + 1])];
    const dr = Math.sign(r1 - r0);
    const dc = Math.sign(c1 - c0);
    // Whatever enemy piece sat on the diagonal between two landing squares was jumped.
    for (let r = r0 + dr, c = c0 + dc; r !== r1; r += dr, c += dc) {
      const sq = squareAt(r, c);
      if (sq >= 0 && before[sq] * mover < 0) caps.push({ sq, piece: before[sq], hop: i });
    }
    jumping ||= caps.length > 0;
  }
  for (let i = 0; i + 1 < path.length; i++) hops.push(jumping ? JUMP_MS : stepMs(Math.abs(rowOf(path[i + 1]) - rowOf(path[i]))));
  return { key, path, mover, caps, crowned: Math.abs(mover) === 1 && Math.abs(after[to]) === 2, hops };
}

type Fx = ReturnType<typeof useGameFx>;

const CHAIN = ["", "", "Double jump!", "Triple jump!", "Quadruple jump!"];

const CSS = `
@keyframes dr-capture { 0% { transform: scale(1); opacity: 1 } 30% { transform: scale(1.2); opacity: 1 }
  100% { transform: translateY(-40%) scale(.1) rotate(40deg); opacity: 0 } }
@keyframes dr-crown { 0% { transform: scale(.6) } 50% { transform: scale(1.3) } 100% { transform: scale(1) } }
@keyframes dr-burst { 0% { transform: scale(.4); opacity: 1 } 100% { transform: scale(2); opacity: 0 } }
@media (prefers-reduced-motion: reduce) { .dr-ghost { display: none } .dr-anim { animation: none !important } }
`;

// Wood: pale maple for the unused squares, warm walnut for the playing squares, with a faint grain.
const GRAIN = "repeating-linear-gradient(97deg, rgba(60,30,10,.07) 0 2px, transparent 2px 6px, rgba(255,255,255,.04) 6px 7px, transparent 7px 11px)";
const LIGHT_SQ = `${GRAIN}, linear-gradient(135deg, #f1d7a7, #dfb77c)`;
const DARK_SQ = `${GRAIN}, linear-gradient(135deg, #8f5b2e, #6b4020)`;

/** A drafts piece: a glossy disc with a groove ring, and a gold crown for a king. */
function Disc({ v, className = "", style }: { v: number; className?: string; style?: CSSProperties }) {
  const green = v > 0;
  return (
    <span
      className={`relative flex h-[78%] w-[78%] items-center justify-center rounded-full border-2 shadow-[0_3px_0_rgba(0,0,0,.35),0_6px_10px_rgba(0,0,0,.4)] transition ${
        green ? "border-emerald-900/70" : "border-amber-900/70"
      } ${className}`}
      style={{
        background: green
          ? "radial-gradient(circle at 35% 30%, #d1fae5 0%, #34d399 32%, #059669 70%, #064e3b 100%)"
          : "radial-gradient(circle at 35% 30%, #fffbeb 0%, #fcd34d 32%, #f59e0b 68%, #92400e 100%)",
        ...style,
      }}
    >
      <span className={`absolute inset-[16%] rounded-full border-2 ${green ? "border-emerald-100/35" : "border-amber-50/45"}`} />
      {Math.abs(v) === 2 && (
        <span className="relative leading-none" style={{ fontSize: "6cqw", color: "#fde047", textShadow: "0 0 2px #713f12, 0 1px 0 #713f12, 0 0 8px rgba(250,204,21,.8)" }}>
          ♛︎
        </span>
      )}
    </span>
  );
}

export function DraftsBoard({ board, moves, last, ply, flipped = false, you, onMove }: Props) {
  /** The piece picked and the landing squares tapped so far. */
  const [sel, setSel] = useState<number[]>([]);
  /** Keyboard cursor in screen coordinates [row, col]. */
  const [cursor, setCursor] = useState<[number, number]>([5, 0]);
  // A new list of moves means a new turn: drop any half-made selection.
  const [seenMoves, setSeenMoves] = useState(moves);
  if (seenMoves !== moves) {
    setSeenMoves(moves);
    setSel([]);
  }
  const viewer = you === undefined ? (flipped ? -1 : 1) : you;

  // A move exactly one ply on from what we showed is played out; anything else just appears.
  const [seen, setSeen] = useState<{ ply: number; board: number[]; slide: Slide | null }>(() => ({ ply, board, slide: null }));
  if (seen.ply !== ply) setSeen({ ply, board, slide: ply === seen.ply + 1 ? describe(seen.board, board, last, ply) : null });
  const slide = seen.ply === ply ? seen.slide : null;
  const [landed, setLanded] = useState<number | null>(null);
  const pieceEls = useRef<(HTMLSpanElement | null)[]>([]);

  const fx = useGameFx();
  const fxRef = useRef(fx);
  useEffect(() => {
    fxRef.current = fx;
  });

  useLayoutEffect(() => {
    if (!slide) return;
    const { path, hops, caps } = slide;
    const el = pieceEls.current[path[path.length - 1]];
    if (!el) return;
    const [tr, tc] = screenOf(path[path.length - 1], flipped);
    let stop = () => {};
    const reset = () => {
      el.style.transform = "";
      el.style.zIndex = "";
    };
    const run = (i: number) => {
      if (i >= hops.length) {
        reset();
        setLanded(slide.key);
        return;
      }
      const [r0, c0] = screenOf(path[i], flipped);
      const [r1, c1] = screenOf(path[i + 1], flipped);
      const jump = caps.some((c) => c.hop === i);
      // Jumps arc up over the piece being taken; steps just lift a touch as they glide.
      stop = animate(
        hops[i],
        (p) => {
          const lift = Math.sin(Math.PI * p);
          const x = c0 + (c1 - c0) * p - tc;
          const y = r0 + (r1 - r0) * p - tr - (jump ? 0.5 : 0.08) * lift;
          el.style.transform = `translate(${x * 100}%, ${y * 100}%) scale(${1 + (jump ? 0.24 : 0.08) * lift})`;
        },
        "inOutCubic",
        () => run(i + 1),
      );
    };
    el.style.zIndex = "20";
    run(0);

    // Popups, timed to the action: a chain is called out as the second hop begins, a crowning on landing.
    const mine = viewer === null ? null : Math.sign(slide.mover) === viewer;
    const tone = (good: PopTone, bad: PopTone): PopTone => (mine === null ? "info" : mine ? good : bad);
    const total = hops.reduce((a, b) => a + b, 0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, f: (fx: Fx) => void) => timers.push(setTimeout(() => f(fxRef.current), ms));
    const n = caps.length;
    if (n >= 2) {
      at(hops[0], (fx) => {
        fx.pop(CHAIN[n] ?? `${n}-piece combo!`, { tone: tone("great", "warn"), emoji: mine === false ? "😬" : "🔥", sub: `${n} pieces taken` });
        vibrate([20, 30, 20]);
        if (mine && n >= 3) fx.confetti(25);
        if (mine === false) fx.shake();
      });
    }
    const landing = n >= 2 ? Math.max(total, hops[0] + 1000) : total;
    if (slide.crowned) {
      at(landing, (fx) => {
        fx.pop(mine === false ? "They crowned a king" : "Crowned!", {
          tone: tone("great", "warn"),
          emoji: "👑",
          sub: mine === null ? undefined : mine ? "Your man is now a flying king" : "Watch out for the flying king",
        });
        if (mine) fx.confetti(25);
        vibrate(30);
      });
    } else if (n === 1 && Math.abs(caps[0].piece) === 2) {
      at(landing, (fx) => {
        fx.pop("King captured!", { tone: tone("good", "bad"), emoji: mine === false ? "😬" : "💥" });
        if (mine === false) fx.shake();
      });
    }
    return () => {
      stop();
      reset();
      timers.forEach(clearTimeout);
    };
  }, [slide, flipped, viewer]);

  const candidates = moves.filter((m) => startsWith(m.path, sel));
  const movable = new Set(moves.map((m) => m.path[0]));
  const targets = new Set(sel.length ? candidates.map((m) => m.path[sel.length]) : []);
  const mustCapture = moves.length > 0 && moves[0].captures.length > 0;
  const pendingCaptures = new Set(sel.length > 1 ? candidates.flatMap((m) => m.captures.slice(0, sel.length - 1)) : []);
  const toBoard = (r: number, c: number): [number, number] => (flipped ? [7 - r, 7 - c] : [r, c]);
  const dest = slide ? slide.path[slide.path.length - 1] : -1;
  const crowning = slide !== null && slide.crowned && landed !== slide.key; // still travelling: show the man
  const crowned = slide !== null && slide.crowned && landed === slide.key;

  function tap(sq: number) {
    if (!moves.length) return;
    if (sel.length && targets.has(sq)) {
      const next = [...sel, sq];
      const matches = candidates.filter((m) => startsWith(m.path, next));
      // Auto-complete as soon as only one way remains.
      if (matches.length === 1) {
        setSel([]);
        onMove(matches[0]);
      } else setSel(next);
    } else if (sel.length <= 1 && movable.has(sq)) {
      setSel(sel[0] === sq ? [] : [sq]);
    } else {
      setSel([]);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const [r, c] = cursor;
      if (e.key === "ArrowUp") setCursor([Math.max(0, r - 1), c]);
      else if (e.key === "ArrowDown") setCursor([Math.min(7, r + 1), c]);
      else if (e.key === "ArrowLeft") setCursor([r, Math.max(0, c - 1)]);
      else if (e.key === "ArrowRight") setCursor([r, Math.min(7, c + 1)]);
      else if (e.key === "Enter" || e.key === " ") {
        const sq = squareAt(...toBoard(r, c));
        if (sq >= 0) tap(sq);
      } else if (e.key === "Escape") setSel([]);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#6e3f1c] via-[#4a2812] to-[#2a160a] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.18)] sm:p-2">
      <style>{CSS}</style>
      <div className="relative" style={{ containerType: "inline-size" }}>
        <div className="grid aspect-square select-none grid-cols-8 overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.4)]">
          {Array.from({ length: 64 }, (_, i) => {
            const vr = i >> 3;
            const vc = i & 7;
            const sq = squareAt(...toBoard(vr, vc));
            const isCursor = moves.length > 0 && cursor[0] === vr && cursor[1] === vc;
            if (sq < 0)
              return <div key={i} className={isCursor ? "ring-2 ring-inset ring-sky-300/80" : ""} style={{ background: LIGHT_SQ }} />;
            const p = crowning && sq === dest ? slide.mover : board[sq];
            const selected = sel[0] === sq;
            const onPath = sel.includes(sq) && !selected;
            const canMove = sel.length === 0 && movable.has(sq);
            const crownHere = crowned && sq === dest;
            return (
              <button
                key={i}
                type="button"
                aria-label={`Square ${sq + 1}`}
                onClick={() => tap(sq)}
                className={`relative flex items-center justify-center ${isCursor ? "ring-2 ring-inset ring-sky-300/80" : ""}`}
                style={{ background: DARK_SQ }}
              >
                {last.includes(sq) && <span className="absolute inset-0 bg-yellow-300/30 shadow-[inset_0_0_10px_rgba(250,204,21,.6)]" />}
                {(onPath || selected) && <span className="absolute inset-0 bg-emerald-400/35 shadow-[inset_0_0_12px_rgba(52,211,153,.8)]" />}
                {crownHere && (
                  <span
                    className="dr-anim absolute inset-[6%] rounded-full border-4 border-yellow-300"
                    style={{ animation: "dr-burst 750ms ease-out both", boxShadow: "0 0 18px #facc15" }}
                  />
                )}
                <span
                  ref={(el) => {
                    pieceEls.current[sq] = el;
                  }}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  {p !== 0 && !(selected && sel.length > 1) && (
                    <Disc
                      v={p}
                      className={`${
                        selected
                          ? "ring-4 ring-white"
                          : canMove && mustCapture
                            ? "ring-2 ring-emerald-300 animate-pulse"
                            : canMove
                              ? "ring-2 ring-white/40"
                              : ""
                      } ${pendingCaptures.has(sq) ? "opacity-40" : ""} ${crownHere ? "dr-anim" : ""}`}
                      style={crownHere ? { animation: "dr-crown 560ms ease-out both" } : undefined}
                    />
                  )}
                  {sel.length > 1 && sel[sel.length - 1] === sq && <Disc v={board[sel[0]]} className="ring-4 ring-white" />}
                </span>
                {targets.has(sq) && <span className="absolute h-1/3 w-1/3 rounded-full bg-emerald-300/85 shadow-[0_0_12px_rgba(110,231,183,.9)]" />}
              </button>
            );
          })}
        </div>

        {/* Jumped pieces, each popping away as the jumper passes over it. */}
        {slide && slide.caps.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {slide.caps.map((c) => {
              const [r, col] = screenOf(c.sq, flipped);
              const delay = slide.hops.slice(0, c.hop).reduce((a, b) => a + b, 0) + slide.hops[c.hop] * 0.5;
              return (
                <span
                  key={`${slide.key}:${c.sq}`}
                  className="dr-ghost absolute flex items-center justify-center"
                  style={{
                    left: `${col * 12.5}%`,
                    top: `${r * 12.5}%`,
                    width: "12.5%",
                    height: "12.5%",
                    animation: `dr-capture 380ms ease-in ${delay}ms both`,
                  }}
                >
                  <Disc v={c.piece} />
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Screen row and column (row 0 at the top) of a square. */
function screenOf(sq: number, flipped: boolean): [number, number] {
  const r = rowOf(sq);
  const c = colOf(sq);
  return flipped ? [7 - r, 7 - c] : [r, c];
}

/** Coloured dot + label used in the status line above the board. */
export function SideDot({ side }: { side: 0 | 1 }) {
  return (
    <span
      className={`inline-block h-3 w-3 rounded-full ${
        side === 0 ? "bg-gradient-to-br from-emerald-200 to-emerald-600 shadow-[0_0_6px_rgba(52,211,153,.8)]" : "bg-gradient-to-br from-amber-100 to-amber-500 shadow-[0_0_6px_rgba(251,191,36,.8)]"
      }`}
    />
  );
}
