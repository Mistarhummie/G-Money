"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { prefersReducedMotion } from "../fx/motion";

/** Cube rotation [x, y] in degrees that shows each value to the viewer. Opposite faces add up to 7. */
const SHOW: Record<number, [number, number]> = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 2: [90, 0] };
/** A slight tilt at rest so the die reads as a cube, not a square. */
const TILT: [number, number] = [-16, 18];

/** Where each face sits on the cube (CSS), and its value. */
const FACES: { v: number; t: string }[] = [
  { v: 1, t: "" },
  { v: 6, t: "rotateY(180deg)" },
  { v: 3, t: "rotateY(90deg)" },
  { v: 4, t: "rotateY(-90deg)" },
  { v: 5, t: "rotateX(90deg)" },
  { v: 2, t: "rotateX(-90deg)" },
];

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

/** Speeds up from rest, spins fastest a third of the way in, then slows smoothly to a stop. */
const tumbleCurve = (t: number) => 1 - (1 - t) ** 3 * (1 + 3 * t);
/** Already spinning: just slow down to a stop. */
const settleCurve = (t: number) => 1 - (1 - t) ** 3;

function Face({ v, t, half }: { v: number; t: string; half: number }) {
  return (
    <div
      className="absolute inset-0 rounded-[18%] border border-black/10"
      style={{
        transform: `${t} translateZ(${half}px)`,
        background: "radial-gradient(circle at 30% 25%, #ffffff 0%, #f7f3ea 55%, #e2dccd 100%)",
        boxShadow: "inset 0 0 6px rgba(0,0,0,.18)",
        backfaceVisibility: "hidden",
      }}
    >
      {PIPS[v].map(([x, y], i) => (
        <span
          key={i}
          className="absolute block rounded-full"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: v === 1 ? "24%" : "17%",
            height: v === 1 ? "24%" : "17%",
            transform: "translate(-50%, -50%)",
            background: v === 1 ? "radial-gradient(circle at 35% 30%, #ff6b6b, #c62828)" : "radial-gradient(circle at 35% 30%, #4b5563, #0b0f19)",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,.6)",
          }}
        />
      ))}
    </div>
  );
}

/**
 * A 3D die. While `spinning` it tumbles freely (waiting for the server); when a new `rollKey` arrives
 * with a `value` it tumbles, bounces and slows to a stop showing that value, then calls `onSettled`.
 */
export function Die({
  value,
  rollKey,
  spinning = false,
  size = 44,
  dim = false,
  speed = 1,
  onSettled,
}: {
  value: number | null;
  rollKey: number;
  spinning?: boolean;
  size?: number;
  dim?: boolean;
  /** >1 plays the tumble faster (to catch up when several moves arrive at once). */
  speed?: number;
  onSettled?: () => void;
}) {
  const cube = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  // The face showing when the die first appears: the last value rolled, if any.
  const [rest] = useState<[number, number]>(() => {
    const [x, y] = SHOW[value ?? 1];
    return [x + TILT[0], y + TILT[1]];
  });
  const angle = useRef<[number, number]>(rest);
  const spinningRef = useRef(false);
  const settled = useRef(onSettled);
  useLayoutEffect(() => {
    settled.current = onSettled;
  });

  const draw = (x: number, y: number, lift = 0) => {
    angle.current = [x, y];
    if (cube.current) cube.current.style.transform = `translateY(${-lift}px) rotateX(${x}deg) rotateY(${y}deg)`;
    if (shadow.current) {
      const k = 1 - Math.min(0.5, lift / (size * 1.2));
      shadow.current.style.transform = `scale(${k})`;
      shadow.current.style.opacity = String(0.45 * k);
    }
  };

  // Free spin while the roll is on its way.
  useEffect(() => {
    if (!spinning) return;
    spinningRef.current = true;
    let raf = 0;
    let last = performance.now();
    let v = 0;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      v = Math.min(900, v + 3000 * dt); // degrees per second, speeding up
      const [x, y] = angle.current;
      draw(x + v * dt, y + v * 0.8 * dt, size * 0.35 * Math.abs(Math.sin(now / 140)));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [spinning]); // eslint-disable-line react-hooks/exhaustive-deps

  // Settle on the server's number.
  useEffect(() => {
    if (!rollKey || value == null) return;
    const [tx, ty] = SHOW[value];
    const [sx, sy] = angle.current;
    const fromSpin = spinningRef.current;
    spinningRef.current = false;
    // Land on the right face after a few whole turns, always rolling forwards.
    const turns = (from: number, to: number, extra: number) => {
      let end = to + 360 * Math.ceil((from - to) / 360) + 360 * extra;
      if (end < from) end += 360;
      return end;
    };
    const ex = turns(sx, tx + TILT[0], fromSpin ? 1 : 2);
    const ey = turns(sy, ty + TILT[1], fromSpin ? 1 : 2);
    const ms = (fromSpin ? 650 : 950) / speed;
    if (prefersReducedMotion()) {
      draw(tx + TILT[0], ty + TILT[1]);
      settled.current?.();
      return;
    }
    const curve = fromSpin ? settleCurve : tumbleCurve;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const p = curve(t);
      // Bounces that die away: each hop lower and quicker than the last.
      const lift = size * 0.55 * Math.abs(Math.sin(Math.PI * 2.4 * t)) * (1 - t) ** 2;
      draw(sx + (ex - sx) * p, sy + (ey - sy) * p, lift);
      if (t < 1) raf = requestAnimationFrame(step);
      else {
        draw(tx + TILT[0], ty + TILT[1]);
        settled.current?.();
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [rollKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const half = size / 2;
  const wrap: CSSProperties = { width: size, height: size, perspective: size * 6 };
  return (
    <div className={`relative transition-opacity duration-300 ${dim ? "opacity-35" : ""}`} style={wrap} aria-hidden>
      <div
        ref={shadow}
        className="absolute left-[8%] right-[8%] rounded-[50%] bg-black/60 blur-[3px]"
        style={{ bottom: -size * 0.14, height: size * 0.22, opacity: 0.45 }}
      />
      <div
        ref={cube}
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d", transform: `rotateX(${rest[0]}deg) rotateY(${rest[1]}deg)` }}
      >
        {FACES.map((f) => (
          <Face key={f.v} v={f.v} t={f.t} half={half} />
        ))}
      </div>
    </div>
  );
}
