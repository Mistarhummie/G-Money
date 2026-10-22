"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  BISHOP,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  VALUES,
  inCheck,
  legalMoves,
  moveFrom,
  movePromo,
  moveTo,
  sqOf,
  type Position,
} from "@/lib/games/arcade/chessbot";
import { useGameFx, type PopTone } from "../fx/GameFx";
import { animate, vibrate } from "../fx/motion";

/**
 * The chess board shared by the vs-computer game and the two-player board: tap a piece then a
 * target square, legal targets, last move, check, promotion picker and keyboard control.
 * Every new move glides from square to square (castling moves both pieces, knights hop), captured
 * pieces pop away, promotions flourish, and moments like check or a queen capture pop up over the board.
 */

// Filled glyphs for both colours (we colour them), with U+FE0E so phones don't draw emoji.
const GLYPH = ["", "♟", "♞", "♝", "♜", "♛", "♚"].map((g) => (g ? g + "︎" : ""));
const NAMES = ["", "Pawn", "Knight", "Bishop", "Rook", "Queen", "King"];
const START_COUNT = [0, 8, 2, 2, 2, 1, 1];

export function Piece({ p, size }: { p: number; size?: string }) {
  if (!p) return null;
  const white = p > 0;
  return (
    <span
      className="leading-none select-none"
      style={{
        fontSize: size,
        color: white ? "#fffaf0" : "#1f1410",
        textShadow: white
          ? "0 0 2px #2a1608, 0 0 1px #000, 0 0 1px #000, 0 3px 4px rgba(0,0,0,.45)"
          : "0 0 2px rgba(255,236,200,.75), 0 0 1px rgba(255,236,200,.6), 0 3px 4px rgba(0,0,0,.45)",
      }}
    >
      {GLYPH[Math.abs(p)]}
    </span>
  );
}

/** Pieces of `colour` (1 or -1) missing from the board, most valuable first. */
function captured(pos: Position, colour: number): number[] {
  const count = [0, 0, 0, 0, 0, 0, 0];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const p = pos.board[sqOf(f, r)] * colour;
      if (p > 0) count[p]++;
    }
  const out: number[] = [];
  for (let t = QUEEN; t >= 1; t--) for (let i = count[t]; i < START_COUNT[t]; i++) out.push(t * colour);
  return out;
}

/** The pieces `colour` has lost, with the material lead of the other side if it has one. */
export function CapturedTray({ pos, colour }: { pos: Position; colour: 1 | -1 }) {
  const lost = captured(pos, colour);
  const gained = captured(pos, -colour);
  const lead = lost.reduce((a, p) => a + VALUES[Math.abs(p)], 0) - gained.reduce((a, p) => a + VALUES[Math.abs(p)], 0);
  return (
    <div className="flex h-6 items-center gap-0.5 text-white/70">
      {lost.map((p, i) => (
        <Piece key={i} p={p} size="1.1rem" />
      ))}
      {lead > 0 && <span className="ml-1 rounded-full bg-amber-400/20 px-1.5 text-xs font-semibold text-amber-200">+{lead / 100}</span>}
    </div>
  );
}

/** Everything needed to animate and announce one move. */
type Slide = {
  key: string;
  from: number;
  to: number;
  /** The piece that moved, as it was before the move (a pawn when promoting). */
  mover: number;
  /** Castling: the rook's from and to squares. */
  rook: [number, number] | null;
  captured: { sq: number; piece: number } | null;
  enPassant: boolean;
  /** The piece a pawn promoted to, or 0. */
  promo: number;
  check: boolean;
  mate: boolean;
  /** Material balance after the move in pawns, White positive. */
  material: number;
  ms: number;
};

function describe(before: Position, after: Position, m: number, key: string): Slide | null {
  const from = moveFrom(m);
  const to = moveTo(m);
  const mover = before.board[from];
  if (!mover || Math.sign(mover) !== before.side || Math.sign(after.board[to]) !== Math.sign(mover)) return null;
  const type = Math.abs(mover);
  let cap: Slide["captured"] = before.board[to] ? { sq: to, piece: before.board[to] } : null;
  const enPassant = !cap && type === PAWN && (from & 7) !== (to & 7);
  if (enPassant) cap = { sq: to - 16 * Math.sign(mover), piece: before.board[to - 16 * Math.sign(mover)] };
  const rook: Slide["rook"] = type === KING && Math.abs(to - from) === 2 ? (to > from ? [from + 3, from + 1] : [from - 4, from - 1]) : null;
  const check = inCheck(after);
  let material = 0;
  for (let sq = 0; sq < 120; sq++) if (!(sq & 0x88) && after.board[sq]) material += Math.sign(after.board[sq]) * VALUES[Math.abs(after.board[sq])];
  const dist = Math.hypot((to & 7) - (from & 7), (to >> 4) - (from >> 4));
  return {
    key,
    from,
    to,
    mover,
    rook,
    captured: cap,
    enPassant,
    promo: movePromo(m) ? after.board[to] : 0,
    check,
    mate: check && legalMoves(after).length === 0,
    material: Math.round(material / 100),
    ms: Math.min(380, 170 + 45 * dist),
  };
}

type Fx = ReturnType<typeof useGameFx>;

/** Pops up what just happened, from the viewer's point of view (`you` null = a spectator). */
function announce(s: Slide, you: 1 | -1 | null, fx: Fx) {
  const mine = you === null ? null : Math.sign(s.mover) === you;
  const tone = (good: PopTone, bad: PopTone): PopTone => (mine === null ? "info" : mine ? good : bad);
  const lead = you === null ? s.material : s.material * you;
  const leadText =
    lead === 0
      ? "Material level"
      : you === null
        ? `${lead > 0 ? "White" : "Black"} up ${Math.abs(lead)}`
        : lead > 0
          ? `You're up ${lead}`
          : `You're down ${-lead}`;
  const capType = s.captured ? Math.abs(s.captured.piece) : 0;

  if (s.mate) {
    fx.pop("Checkmate!", { tone: tone("great", "bad"), emoji: "♚" });
    vibrate([30, 40, 60]);
    if (mine === false) fx.shake();
    return;
  }
  if (s.promo) {
    fx.pop(`Promoted to ${NAMES[Math.abs(s.promo)]}!`, { tone: tone("great", "warn"), emoji: "👑", sub: s.check ? "…and it's check!" : undefined });
    if (mine) fx.confetti(25);
    vibrate(25);
    return;
  }
  if (s.check) {
    fx.pop("Check!", { tone: tone("good", "warn"), emoji: "⚔️", sub: capType >= KNIGHT ? `${NAMES[capType]} captured · ${leadText}` : undefined });
    vibrate(25);
    if (mine === false && capType === QUEEN) fx.shake();
    return;
  }
  if (capType >= KNIGHT) {
    fx.pop(`${NAMES[capType]} captured!`, { tone: tone("good", "bad"), emoji: mine === false ? "😬" : "💥", sub: leadText });
    if (capType === QUEEN && mine) fx.confetti(25);
    if (mine === false && capType >= ROOK) fx.shake();
    return;
  }
  if (s.enPassant) {
    fx.pop("En passant!", { tone: tone("great", "warn"), emoji: "✨" });
    return;
  }
  if (s.rook) fx.pop("Castled", { tone: "info", emoji: "🏰", sub: mine === false ? "Their king is tucked away" : mine ? "Your king is safe" : undefined });
}

const CSS = `
@keyframes cb-capture { 0% { transform: scale(1); opacity: 1 } 35% { transform: scale(1.25) rotate(-10deg); opacity: 1 }
  100% { transform: translateY(-45%) scale(.15) rotate(30deg); opacity: 0 } }
@keyframes cb-promo { 0% { transform: scale(.4) } 55% { transform: scale(1.35) } 100% { transform: scale(1) } }
@keyframes cb-burst { 0% { transform: scale(.3); opacity: .95 } 100% { transform: scale(1.9); opacity: 0 } }
@media (prefers-reduced-motion: reduce) { .cb-ghost { display: none } .cb-anim { animation: none !important } }
`;

// Wood: maple light squares and walnut dark squares, each with a faint grain.
const GRAIN = "repeating-linear-gradient(97deg, rgba(60,30,10,.06) 0 2px, transparent 2px 6px, rgba(255,255,255,.04) 6px 7px, transparent 7px 11px)";
const LIGHT_SQ = `${GRAIN}, linear-gradient(135deg, #f4dcb0, #e3bf86)`;
const DARK_SQ = `${GRAIN}, linear-gradient(135deg, #b47a46, #8e5a2c)`;

type Props = {
  pos: Position;
  /** True when the viewer may move now (it is their colour's turn). */
  canMove: boolean;
  /** Show Black at the bottom. */
  flipped?: boolean;
  lastMove: number | null;
  onMove: (m: number) => void;
  /** The viewer's colour for popups (1 White, -1 Black, null a spectator). Defaults to the colour at the bottom. */
  you?: 1 | -1 | null;
};

export function ChessBoard({ pos, canMove, flipped = false, lastMove, onMove, you }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [cursor, setCursor] = useState(sqOf(4, flipped ? 6 : 1));
  const [keyboard, setKeyboard] = useState(false); // show the cursor only once the keyboard is used
  const viewer = you === undefined ? (flipped ? -1 : 1) : you;

  // A new move (exactly one ply on from what we showed) slides in; anything else (a reload, an
  // optimistic move taken back, the server confirming a move we already show) just appears.
  const moveKey = `${pos.ply}:${lastMove}`;
  const [seen, setSeen] = useState<{ key: string; pos: Position; slide: Slide | null }>(() => ({ key: moveKey, pos, slide: null }));
  if (seen.key !== moveKey) {
    const slide = lastMove !== null && pos.ply === seen.pos.ply + 1 ? describe(seen.pos, pos, lastMove, moveKey) : null;
    setSeen({ key: moveKey, pos, slide });
  }
  const slide = seen.key === moveKey ? seen.slide : null;
  const [landed, setLanded] = useState<string | null>(null);
  const pieceEls = useRef<(HTMLSpanElement | null)[]>([]);

  const fx = useGameFx();
  const fxRef = useRef(fx);
  useEffect(() => {
    fxRef.current = fx;
  });

  useLayoutEffect(() => {
    if (!slide) return;
    const tracks: { el: HTMLSpanElement; dx: number; dy: number; hop: number }[] = [];
    const track = (from: number, to: number, hop: number) => {
      const el = pieceEls.current[to];
      if (!el) return;
      const [fc, fr] = screenOf(from, flipped);
      const [tc, tr] = screenOf(to, flipped);
      tracks.push({ el, dx: fc - tc, dy: fr - tr, hop });
    };
    // Knights hop over; everything else lifts a little and glides.
    track(slide.from, slide.to, Math.abs(slide.mover) === KNIGHT ? 0.4 : 0.08);
    if (slide.rook) track(slide.rook[0], slide.rook[1], 0.05);
    const frame = (p: number) => {
      const lift = Math.sin(Math.PI * p);
      for (const t of tracks) {
        t.el.style.zIndex = "20";
        t.el.style.transform = `translate(${t.dx * (1 - p) * 100}%, ${(t.dy * (1 - p) - t.hop * lift) * 100}%) scale(${1 + 0.16 * lift})`;
      }
    };
    const reset = () => {
      for (const t of tracks) {
        t.el.style.transform = "";
        t.el.style.zIndex = "";
      }
    };
    frame(0);
    const stop = animate(slide.ms, frame, "inOutCubic", () => {
      reset();
      setLanded(slide.key);
    });
    const timer = setTimeout(() => announce(slide, viewer, fxRef.current), slide.ms * 0.8);
    return () => {
      stop();
      clearTimeout(timer);
      reset();
    };
  }, [slide, flipped, viewer]);

  const moves = useMemo(() => (canMove ? legalMoves(pos) : []), [pos, canMove]);
  const targets = useMemo(() => new Set(moves.filter((m) => moveFrom(m) === selected).map(moveTo)), [moves, selected]);
  const checkSq = inCheck(pos) ? pos.kings[pos.side === 1 ? 0 : 1] : -1;
  const showPromo = canMove && promo;
  const promoting = slide !== null && slide.promo !== 0;
  const sliding = promoting && landed !== slide.key; // still moving: show the pawn until it lands
  const flourish = promoting && landed === slide.key;

  function commit(m: number) {
    setSelected(null);
    setPromo(null);
    onMove(m);
  }

  function tap(sq: number) {
    if (!canMove || promo) return;
    if (selected !== null && targets.has(sq)) {
      const options = moves.filter((m) => moveFrom(m) === selected && moveTo(m) === sq);
      if (options.some((m) => movePromo(m))) setPromo({ from: selected, to: sq });
      else commit(options[0]);
      return;
    }
    const mine = moves.some((m) => moveFrom(m) === sq);
    setSelected(mine && sq !== selected ? sq : null);
  }

  function choosePromotion(piece: number) {
    if (!promo) return;
    const m = moves.find((x) => moveFrom(x) === promo.from && moveTo(x) === promo.to && movePromo(x) === piece);
    if (m !== undefined) commit(m);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (showPromo) {
      const piece = ({ q: QUEEN, r: ROOK, b: BISHOP, n: KNIGHT } as Record<string, number>)[e.key.toLowerCase()];
      if (piece) choosePromotion(piece);
      if (e.key === "Escape") setPromo(null);
      return;
    }
    setKeyboard(true);
    const dir = flipped ? -1 : 1;
    const step: Record<string, [number, number]> = { ArrowUp: [0, dir], ArrowDown: [0, -dir], ArrowLeft: [-dir, 0], ArrowRight: [dir, 0] };
    if (step[e.key]) {
      e.preventDefault();
      const f = Math.min(7, Math.max(0, (cursor & 7) + step[e.key][0]));
      const r = Math.min(7, Math.max(0, (cursor >> 4) + step[e.key][1]));
      setCursor(sqOf(f, r));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tap(cursor);
    } else if (e.key === "Escape") setSelected(null);
  }

  const ghost = slide?.captured;

  return (
    <div
      className="relative rounded-2xl bg-gradient-to-br from-[#6e3f1c] via-[#4a2812] to-[#2a160a] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.18)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:p-2"
      tabIndex={0}
      onKeyDown={onKey}
      aria-label="Chess board"
    >
      <style>{CSS}</style>
      <div className="relative" style={{ containerType: "inline-size" }}>
        <div className="grid aspect-square grid-cols-8 overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.4)]">
          {Array.from({ length: 64 }, (_, i) => {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const r = flipped ? row : 7 - row;
            const f = flipped ? 7 - col : col;
            const sq = sqOf(f, r);
            const p = sliding && sq === slide.to ? slide.mover : pos.board[sq];
            const light = (r + f) % 2 === 1;
            const isLast = lastMove !== null && (moveFrom(lastMove) === sq || moveTo(lastMove) === sq);
            const isTarget = targets.has(sq);
            const flourishHere = flourish && sq === slide.to;
            return (
              <button
                key={sq}
                type="button"
                onClick={() => {
                  setCursor(sq);
                  setKeyboard(false);
                  tap(sq);
                }}
                className="relative flex items-center justify-center"
                style={{ background: light ? LIGHT_SQ : DARK_SQ }}
                aria-label={`${"abcdefgh"[f]}${r + 1}`}
              >
                {isLast && <span className="absolute inset-0 bg-yellow-300/45 shadow-[inset_0_0_10px_rgba(250,204,21,.7)]" />}
                {sq === checkSq && (
                  <span className="absolute inset-0 animate-pulse bg-[radial-gradient(circle,rgba(239,68,68,.95)_0%,rgba(239,68,68,.45)_55%,transparent_75%)]" />
                )}
                {canMove && sq === selected && <span className="absolute inset-0 bg-lime-400/55 shadow-[inset_0_0_12px_rgba(132,204,22,.9)]" />}
                {keyboard && sq === cursor && <span className="absolute inset-0.5 rounded-sm border-2 border-sky-500/90" />}
                {flourishHere && (
                  <span
                    className="cb-anim absolute inset-[8%] rounded-full border-4 border-yellow-300"
                    style={{ animation: "cb-burst 700ms ease-out both", boxShadow: "0 0 18px #facc15" }}
                  />
                )}
                <span
                  ref={(el) => {
                    pieceEls.current[sq] = el;
                  }}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <span className={flourishHere ? "cb-anim" : ""} style={flourishHere ? { animation: "cb-promo 520ms ease-out both" } : undefined}>
                    <Piece p={p} size="9.4cqw" />
                  </span>
                </span>
                {isTarget &&
                  (p ? (
                    <span className="absolute inset-0.5 rounded-full border-[5px] border-rose-500/70" />
                  ) : (
                    <span className="absolute h-1/3 w-1/3 rounded-full bg-emerald-700/60 shadow-[0_0_8px_rgba(4,120,87,.6)]" />
                  ))}
                {col === 0 && <span className="absolute top-0.5 left-0.5 text-[9px] leading-none font-semibold text-[#3b2412]/60">{r + 1}</span>}
                {row === 7 && <span className="absolute right-0.5 bottom-0.5 text-[9px] leading-none font-semibold text-[#3b2412]/60">{"abcdefgh"[f]}</span>}
              </button>
            );
          })}
        </div>

        {/* The captured piece, popping away as the attacker arrives. */}
        {ghost && slide && (
          <div className="pointer-events-none absolute inset-0 z-10">
            <span
              key={slide.key}
              className="cb-ghost absolute flex items-center justify-center"
              style={{
                left: `${screenOf(ghost.sq, flipped)[0] * 12.5}%`,
                top: `${screenOf(ghost.sq, flipped)[1] * 12.5}%`,
                width: "12.5%",
                height: "12.5%",
                animation: `cb-capture 420ms ease-in ${slide.ms * 0.7}ms both`,
              }}
            >
              <Piece p={ghost.piece} size="9.4cqw" />
            </span>
          </div>
        )}
      </div>

      {showPromo && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/70">
          <p className="text-sm text-white/80">Promote to:</p>
          <div className="flex gap-2">
            {[QUEEN, ROOK, BISHOP, KNIGHT].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => choosePromotion(t)}
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-amber-200/30 bg-gradient-to-br from-[#b47a46] to-[#6e3f1c] active:scale-95"
                aria-label={["", "", "Knight", "Bishop", "Rook", "Queen"][t]}
              >
                <Piece p={t * pos.side} size="2.2rem" />
              </button>
            ))}
          </div>
          <button type="button" className="text-sm text-white/60 underline" onClick={() => setPromo(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/** Screen column and row (0-7, row 0 at the top) of a square. */
function screenOf(sq: number, flipped: boolean): [number, number] {
  return [flipped ? 7 - (sq & 7) : sq & 7, flipped ? sq >> 4 : 7 - (sq >> 4)];
}

export const KEYBOARD_HINT = "Keyboard: arrows to move, Enter to pick up and drop, Q/R/B/N to promote.";
