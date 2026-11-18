"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type PopTone = "good" | "great" | "info" | "warn" | "bad";
export type PopOptions = { tone?: PopTone; emoji?: string; sub?: string; ms?: number };

type Pop = { id: number; text: string } & Required<Pick<PopOptions, "tone" | "ms">> & Pick<PopOptions, "emoji" | "sub">;

type Fx = {
  /** Shows a short popup over the board, e.g. pop("Double capture!", { tone: "great", emoji: "🔥" }). */
  pop: (text: string, opts?: PopOptions) => void;
  /** A burst of confetti from the middle of the board. */
  confetti: (pieces?: number) => void;
  /** A quick shake of the board, for hits and fouls. */
  shake: () => void;
  fullscreen: boolean;
};

const noop: Fx = { pop: () => {}, confetti: () => {}, shake: () => {}, fullscreen: false };
const FxContext = createContext<Fx>(noop);

/** Popups, confetti and shake for whatever game is inside the nearest GameFrame. Safe to call outside one. */
export const useGameFx = () => useContext(FxContext);

const TONES: Record<PopTone, string> = {
  good: "from-emerald-400 to-teal-500 text-emerald-950",
  great: "from-fuchsia-500 via-amber-400 to-yellow-300 text-black",
  info: "from-sky-400 to-indigo-500 text-white",
  warn: "from-amber-400 to-orange-500 text-black",
  bad: "from-rose-500 to-red-600 text-white",
};

const CONFETTI_COLOURS = ["#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#a78bfa", "#f87171", "#facc15"];

type Piece = { id: number; x: number; y: number; vx: number; vy: number; rot: number; vr: number; colour: string; size: number };

/**
 * Wraps a game: adds a fullscreen button, popups, confetti and shake.
 * Fullscreen uses the browser's real fullscreen where it exists, and fills the window otherwise (iPhone Safari).
 */
export function GameFrame({
  children,
  toolbar,
  help,
  aspect = 1,
}: {
  children: ReactNode;
  toolbar?: ReactNode;
  help?: ReactNode;
  /** Board width over height, so wide boards (Bao) can use the whole width of a landscape screen. */
  aspect?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [shaking, setShaking] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const nextId = useRef(1);

  const pop = useCallback((text: string, opts: PopOptions = {}) => {
    const id = nextId.current++;
    const ms = opts.ms ?? 1400;
    // At most three at once; the oldest goes first.
    setPops((p) => [...p.slice(-2), { id, text, tone: opts.tone ?? "good", emoji: opts.emoji, sub: opts.sub, ms }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), ms);
  }, []);

  const shake = useCallback(() => {
    setShaking(false);
    requestAnimationFrame(() => setShaking(true));
    setTimeout(() => setShaking(false), 450);
  }, []);

  const confetti = useCallback((count = 60) => {
    const made: Piece[] = Array.from({ length: count }, () => ({
      id: nextId.current++,
      x: 50,
      y: 45,
      vx: (Math.random() - 0.5) * 90,
      vy: -40 - Math.random() * 60,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 720,
      colour: CONFETTI_COLOURS[Math.floor(Math.random() * CONFETTI_COLOURS.length)],
      size: 6 + Math.random() * 6,
    }));
    setPieces((p) => [...p, ...made]);
  }, []);

  // Confetti physics: gravity pulls each piece down, air drag slows it, and it is dropped once off the board.
  useEffect(() => {
    if (!pieces.length) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setPieces((ps) =>
        ps
          .map((p) => ({
            ...p,
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            vx: p.vx * (1 - 1.2 * dt),
            vy: p.vy + 120 * dt,
            rot: p.rot + p.vr * dt,
          }))
          .filter((p) => p.y < 115),
      );
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pieces.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && fullscreen && document.fullscreenEnabled) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    // Stop the page behind scrolling while the game fills the screen.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  async function toggle() {
    if (fullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setFullscreen(false);
      return;
    }
    setFullscreen(true);
    if (document.fullscreenEnabled && ref.current) await ref.current.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  }

  const fx = useMemo(() => ({ pop, confetti, shake, fullscreen }), [pop, confetti, shake, fullscreen]);

  return (
    <FxContext.Provider value={fx}>
      <div
        ref={ref}
        className={
          fullscreen
            ? "fixed inset-0 z-50 flex flex-col overflow-auto bg-gradient-to-b from-[#0b1d2e] via-[#07130e] to-[#1a0b26] p-3"
            : "relative"
        }
      >
        <style>{`
          @keyframes gfx-pop { 0% { transform: translate(-50%, 20px) scale(.6); opacity: 0 } 15% { transform: translate(-50%, 0) scale(1.08); opacity: 1 }
            25% { transform: translate(-50%, 0) scale(1) } 80% { opacity: 1 } 100% { transform: translate(-50%, -24px) scale(.95); opacity: 0 } }
          @keyframes gfx-shake { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-7px) } 40% { transform: translateX(6px) }
            60% { transform: translateX(-4px) } 80% { transform: translateX(2px) } }
        `}</style>
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {help}
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
            aria-label={fullscreen ? "Exit full screen" : "Play full screen"}
          >
            {fullscreen ? "✕ Exit" : "⛶ Full screen"}
          </button>
        </div>
        <div
          className={`relative ${fullscreen ? "mx-auto my-auto w-full" : ""}`}
          style={fullscreen ? { maxWidth: `min(100%, calc((100dvh - 7rem) * ${aspect}))` } : undefined}
        >
          <div style={shaking ? { animation: "gfx-shake .45s ease-out" } : undefined}>{children}</div>
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            {pops.map((p, i) => (
              <div
                key={p.id}
                className={`absolute left-1/2 whitespace-nowrap rounded-2xl bg-gradient-to-r px-4 py-2 text-center shadow-2xl shadow-black/50 ${TONES[p.tone]}`}
                style={{ top: `${18 + i * 16}%`, animation: `gfx-pop ${p.ms}ms ease-out forwards` }}
              >
                <div className="text-lg font-extrabold tracking-tight">
                  {p.emoji && <span className="mr-1">{p.emoji}</span>}
                  {p.text}
                </div>
                {p.sub && <div className="text-xs font-medium opacity-80">{p.sub}</div>}
              </div>
            ))}
            {pieces.map((p) => (
              <span
                key={p.id}
                className="absolute block rounded-[2px]"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: p.size,
                  height: p.size * 0.5,
                  background: p.colour,
                  transform: `rotate(${p.rot}deg)`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </FxContext.Provider>
  );
}
