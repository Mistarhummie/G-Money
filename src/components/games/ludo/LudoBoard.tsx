"use client";

import { memo, useImperativeHandle, useRef, useState, type Ref } from "react";
import { BASE, COLOUR_NAMES, HOME, SAFE_SQUARES, pathOf, type Capture, type LudoState } from "@/lib/ludo/rules";
import { animate, ease, lerp, prefersReducedMotion } from "../fx/motion";
import { LUDO_COLOURS } from "./colours";
import { TRACK_CELLS, layout, spotOf, type Placed } from "./geometry";

export { LUDO_COLOURS };


const STAR = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.17 : 0.38;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`);
  }
  return pts.join(" ");
})();

/** One colour's corner, home column, start square, star and arrow, drawn for red and turned into place. */
function Arm({ c }: { c: number }) {
  const col = LUDO_COLOURS[c];
  return (
    <g transform={`rotate(${90 * c} 7.5 7.5)`}>
      <rect x={0} y={0} width={6} height={6} fill={`url(#ludo-q${c})`} />
      <rect x={0.95} y={0.95} width={4.1} height={4.1} rx={0.45} fill="#fffdf7" stroke={col.dark} strokeOpacity={0.35} strokeWidth={0.06} />
      <rect x={1.05} y={1.05} width={3.9} height={3.9} rx={0.4} fill="none" stroke="rgba(0,0,0,.08)" strokeWidth={0.12} />
      {[
        [2, 2],
        [4, 2],
        [2, 4],
        [4, 4],
      ].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <circle cx={x} cy={y} r={0.66} fill={col.soft} stroke={col.main} strokeWidth={0.1} />
          <circle cx={x} cy={y + 0.05} r={0.5} fill="none" stroke="rgba(0,0,0,.1)" strokeWidth={0.08} />
        </g>
      ))}
      {/* Home column */}
      {[1, 2, 3, 4, 5].map((x) => (
        <rect key={x} x={x} y={7} width={1} height={1} fill={col.main} stroke="#94a3b8" strokeWidth={0.035} />
      ))}
      {/* Start square, safe, with a star */}
      <rect x={1} y={6} width={1} height={1} fill={col.main} stroke="#94a3b8" strokeWidth={0.035} />
      <polygon points={STAR} transform="translate(1.5 6.5)" fill="#fff" fillOpacity={0.9} />
      {/* Star square, 8 ahead of the start */}
      <polygon points={STAR} transform="translate(6.5 2.5)" fill={col.main} fillOpacity={0.85} stroke={col.dark} strokeWidth={0.03} />
      {/* Arrow into the home column */}
      <path d="M0.18 7.5 H0.62 M0.48 7.3 L0.78 7.5 L0.48 7.7" fill="none" stroke={col.main} strokeWidth={0.13} strokeLinecap="round" strokeLinejoin="round" />
      {/* Home triangle */}
      <polygon points="6,6 6,9 7.5,7.5" fill={`url(#ludo-t${c})`} stroke="#fff" strokeWidth={0.04} />
    </g>
  );
}

/** The printed board. Drawn once; tokens move over it. */
const BoardArt = memo(function BoardArt() {
  return (
    <g>
      <defs>
        {LUDO_COLOURS.map((col, c) => (
          <g key={c}>
            <linearGradient id={`ludo-q${c}`} x1="0" y1="0" x2="1" y2="1" gradientTransform={`rotate(${-90 * c} .5 .5)`}>
              <stop offset="0" stopColor={col.light} />
              <stop offset=".45" stopColor={col.main} />
              <stop offset="1" stopColor={col.dark} />
            </linearGradient>
            <linearGradient id={`ludo-t${c}`} x1="0" y1="0" x2="1" y2="0" gradientTransform={`rotate(${-90 * c} .5 .5)`}>
              <stop offset="0" stopColor={col.main} />
              <stop offset="1" stopColor={col.light} />
            </linearGradient>
            <radialGradient id={`ludo-tok${c}`} cx=".35" cy=".3" r=".75">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset=".22" stopColor={col.light} />
              <stop offset=".6" stopColor={col.main} />
              <stop offset="1" stopColor={col.dark} />
            </radialGradient>
          </g>
        ))}
        <linearGradient id="ludo-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#334155" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      <rect x={-0.35} y={-0.35} width={15.7} height={15.7} rx={0.6} fill="url(#ludo-frame)" />
      <rect x={0} y={0} width={15} height={15} fill="#fffdf7" />
      {TRACK_CELLS.map(([r, c], i) => (
        <rect key={i} x={c} y={r} width={1} height={1} fill="#fffdf7" stroke="#94a3b8" strokeWidth={0.035} />
      ))}
      {[0, 1, 2, 3].map((c) => (
        <Arm key={c} c={c} />
      ))}
      <circle cx={7.5} cy={7.5} r={0.28} fill="#fff" stroke="#cbd5e1" strokeWidth={0.04} />
      <rect x={0} y={0} width={15} height={15} fill="none" stroke="#0f172a" strokeWidth={0.06} />
    </g>
  );
});

// ---------------------------------------------------------------- tokens

function Token({ colour }: { colour: number }) {
  const col = LUDO_COLOURS[colour];
  return (
    <>
      <ellipse data-shadow cx={0} cy={0.2} rx={0.33} ry={0.14} fill="rgba(0,0,0,.35)" />
      <g data-body>
        <circle cx={0} cy={0.06} r={0.36} fill={col.dark} />
        <circle cx={0} cy={0.02} r={0.34} fill={`url(#ludo-tok${colour})`} />
        <circle cx={0} cy={-0.1} r={0.19} fill={`url(#ludo-tok${colour})`} stroke="#fff" strokeWidth={0.05} />
        <ellipse cx={-0.07} cy={-0.17} rx={0.07} ry={0.045} fill="#fff" fillOpacity={0.8} />
      </g>
    </>
  );
}

export type BoardHandle = {
  /** Plays a move: the token hops square by square, then any captured tokens slide back to base. */
  playMove(ev: { seat: number; token: number; from: number; to: number; captured: Capture[] }, before: LudoState, after: LudoState, speed: number): Promise<void>;
};

const tf = (p: Placed) => `translate(${p.x.toFixed(3)} ${p.y.toFixed(3)}) scale(${p.scale})`;

export function LudoBoard({
  state,
  movable,
  onPick,
  activeSeat,
  timerFrac,
  mySeat,
  ref,
}: {
  state: LudoState;
  /** Tokens of the player to move that may be tapped. Empty when it isn't the viewer's choice. */
  movable: number[];
  onPick: (token: number) => void;
  activeSeat: number | null;
  /** Time left for the player to move, 1 → 0; null when there is no clock. */
  timerFrac: number | null;
  mySeat: number | null;
  ref?: Ref<BoardHandle>;
}) {
  const els = useRef(new Map<string, SVGGElement>());
  const [lifted, setLifted] = useState<string | null>(null);
  const placed = layout(state);
  const colours = state.setup.colours;

  useImperativeHandle(ref, () => ({
    async playMove(ev, before, after, speed) {
      const key = `${ev.seat}-${ev.token}`;
      setLifted(key);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const el = els.current.get(key);
      if (!el || prefersReducedMotion()) return;
      const c = colours[ev.seat];
      const startAt = layout(before)[ev.seat][ev.token];
      const endAt = layout(after)[ev.seat][ev.token];
      const steps = pathOf(ev.from, ev.to);
      const points: Placed[] = steps.map((p, i) => (i === steps.length - 1 ? endAt : { ...spotOf(c, ev.token, p), scale: 1 }));
      const body = el.querySelector<SVGGElement>("[data-body]");
      const shadow = el.querySelector<SVGEllipseElement>("[data-shadow]");
      const pose = (p: Placed, lift: number, sx = 1, sy = 1) => {
        el.setAttribute("transform", tf(p));
        body?.setAttribute("transform", `translate(0 ${(-lift + 0.3 * (1 - sy)).toFixed(3)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`);
        if (shadow) shadow.setAttribute("transform", `scale(${(1 - Math.min(0.45, lift * 0.5)).toFixed(3)})`);
      };
      let from = startAt;
      for (let i = 0; i < points.length; i++) {
        const to = points[i];
        const outOfBase = ev.from === BASE;
        const ms = (outOfBase ? 420 : 170) / speed;
        const height = outOfBase ? 1.3 : 0.5;
        await new Promise<void>((done) =>
          animate(
            ms,
            (t) => {
              const k = ease.inOutCubic(t);
              pose({ x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), scale: lerp(from.scale, to.scale, k) }, height * 4 * t * (1 - t));
            },
            "linear",
            done,
          ),
        );
        // A little squash on every landing, a bigger one on the last.
        const last = i === points.length - 1;
        const squash = last ? 0.24 : 0.1;
        await new Promise<void>((done) =>
          animate(last ? 160 / speed : 60 / speed, (t) => pose(to, 0, 1 + squash * Math.sin(Math.PI * t) * 0.8, 1 - squash * Math.sin(Math.PI * t)), "linear", done),
        );
        from = to;
      }
      body?.removeAttribute("transform");
      shadow?.removeAttribute("transform");
      // Captured tokens slide back to their base.
      if (ev.captured.length) {
        await Promise.all(
          ev.captured.map(
            (cap) =>
              new Promise<void>((done) => {
                const ce = els.current.get(`${cap.seat}-${cap.token}`);
                if (!ce) return done();
                const a = layout(before)[cap.seat][cap.token];
                const b = layout(after)[cap.seat][cap.token];
                const cb = ce.querySelector<SVGGElement>("[data-body]");
                animate(
                  650 / speed,
                  (t) => {
                    ce.setAttribute("transform", tf({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), scale: lerp(a.scale, b.scale, t) }));
                    cb?.setAttribute("transform", `translate(0 ${(-0.9 * Math.sin(Math.PI * t)).toFixed(3)}) rotate(${(t * 360).toFixed(1)})`);
                  },
                  "outCubic",
                  () => {
                    cb?.removeAttribute("transform");
                    done();
                  },
                );
              }),
          ),
        );
      }
    },
  }));

  // Draw order: still tokens, then the ones you can tap, then the one in the air.
  const order: [number, number][] = [];
  state.tokens.forEach((row, seat) => row.forEach((_, t) => order.push([seat, t])));
  const rank = ([seat, t]: [number, number]) => {
    const key = `${seat}-${t}`;
    if (key === lifted) return 3;
    if (seat === state.turn && movable.includes(t)) return 2;
    return state.tokens[seat][t] >= HOME ? 0 : 1;
  };
  order.sort((a, b) => rank(a) - rank(b));

  const ring = activeSeat !== null && !state.over ? colours[activeSeat] : null;

  return (
    <svg viewBox="-0.4 -0.4 15.8 15.8" className="block h-auto w-full touch-manipulation select-none" role="img" aria-label="Ludo board">
      <style>{`
        @keyframes ludo-glow { 0%,100% { opacity: .95; transform: scale(1) } 50% { opacity: .35; transform: scale(1.18) } }
        @keyframes ludo-ring { 0%,100% { stroke-opacity: 1 } 50% { stroke-opacity: .45 } }
        .ludo-glow { animation: ludo-glow 1s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        .ludo-tok:focus { outline: none }
        .ludo-tok:focus-visible .ludo-focus { stroke: #38bdf8; stroke-width: .09 }
      `}</style>
      <BoardArt />

      {/* Whose turn: a ring round their base that runs down with their clock. */}
      {ring !== null && (
        <g transform={`rotate(${90 * ring} 7.5 7.5)`} pointerEvents="none">
          <rect x={0.12} y={0.12} width={5.76} height={5.76} rx={0.5} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={0.2} />
          <rect
            x={0.12}
            y={0.12}
            width={5.76}
            height={5.76}
            rx={0.5}
            fill="none"
            stroke={timerFrac !== null && timerFrac < 0.3 ? "#ef4444" : "#ffffff"}
            strokeWidth={0.2}
            pathLength={100}
            strokeDasharray={timerFrac === null ? undefined : `${(timerFrac * 100).toFixed(2)} 100`}
            strokeLinecap="round"
            style={timerFrac === null ? { animation: "ludo-ring 1.2s ease-in-out infinite" } : { transition: "stroke-dasharray .3s linear" }}
          />
        </g>
      )}

      {order.map(([seat, t]) => {
        const key = `${seat}-${t}`;
        const can = seat === state.turn && movable.includes(t);
        const progress = state.tokens[seat][t];
        const where = progress === BASE ? "in base" : progress >= HOME ? "home" : SAFE_SQUARES.has(progress) ? "on a safe square" : `${progress} squares out`;
        return (
          <g
            key={key}
            ref={(el) => {
              if (el) els.current.set(key, el);
              else els.current.delete(key);
            }}
            transform={tf(placed[seat][t])}
            className={can ? "ludo-tok cursor-pointer" : "ludo-tok"}
            role={can ? "button" : undefined}
            tabIndex={can ? 0 : undefined}
            aria-label={can ? `Move ${COLOUR_NAMES[colours[seat]]} token ${t + 1}, ${where}` : undefined}
            onClick={can ? () => onPick(t) : undefined}
            onKeyDown={
              can
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onPick(t);
                    }
                  }
                : undefined
            }
          >
            {can && <circle className="ludo-glow" cx={0} cy={0} r={0.5} fill="none" stroke="#fff" strokeWidth={0.1} pointerEvents="none" />}
            {can && <circle cx={0} cy={0} r={0.58} fill="transparent" />}
            <circle className="ludo-focus" cx={0} cy={0} r={0.44} fill="none" stroke="none" />
            <Token colour={colours[seat]} />
            {seat === mySeat && progress !== BASE && progress < HOME && (
              <circle cx={0} cy={-0.1} r={0.05} fill="#fff" pointerEvents="none" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
