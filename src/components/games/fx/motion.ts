"use client";

import { useEffect, useRef, useState } from "react";

/** Easing curves: t goes 0 → 1. */
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  outBounce: (t: number) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
export type Ease = keyof typeof ease;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Runs `onFrame(progress)` every animation frame for `ms`, with the chosen easing.
 * Returns a cancel function. Finishes at once when the player prefers reduced motion.
 */
export function animate(ms: number, onFrame: (p: number) => void, curve: Ease = "inOutCubic", onDone?: () => void): () => void {
  if (ms <= 0 || prefersReducedMotion()) {
    onFrame(1);
    onDone?.();
    return () => {};
  }
  let raf = 0;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    onFrame(ease[curve](t));
    if (t < 1) raf = requestAnimationFrame(step);
    else onDone?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/**
 * Time for something to fall `distance` units under gravity `g` (units/s²) from rest.
 * Handy for making drops take longer from higher up, as real ones do.
 */
export const fallMs = (distance: number, g = 9000) => Math.sqrt((2 * Math.abs(distance)) / g) * 1000;

/** A number that glides to each new target instead of jumping. */
export function useTweened(target: number, ms = 300, curve: Ease = "outCubic"): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    return animate(
      ms,
      (p) => {
        const v = lerp(start, target, p);
        from.current = v;
        setValue(v);
      },
      curve,
    );
  }, [target, ms, curve]);
  return value;
}

/** Short buzz on phones that support it. Ignored elsewhere. */
export function vibrate(pattern: number | number[] = 15) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported
  }
}
