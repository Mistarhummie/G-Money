"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Shared bits for the canvas games (Brick Blitz, Sling Strike, Darts, Penalty Shootout):
 * a drawing loop that keeps the canvas sharp at any size, a fixed-step game clock, and sparks.
 * All of it is visual or timing only; the game rules never read anything from here.
 */

export type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number; color: string; r: number; g?: number };

/** A ring of sparks at (x, y), in the game's own units. */
export function sparks(x: number, y: number, now: number, color: string, n = 14, speed = 160, life = 520): Spark[] {
  const out: Spark[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const v = speed * (0.4 + Math.random() * 0.8);
    out.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: now, life: life * (0.6 + Math.random() * 0.6), color, r: 1.5 + Math.random() * 2.5 });
  }
  return out;
}

/** Moves and draws sparks (game units, already scaled by the caller's transform), dropping dead ones. */
export function drawSparks(ctx: CanvasRenderingContext2D, list: Spark[], now: number, dt: number): Spark[] {
  const kept: Spark[] = [];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of list) {
    const age = (now - p.born) / p.life;
    if (age >= 1) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy = p.vy * 0.96 + (p.g ?? 300) * dt;
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1 - age * 0.5), 0, Math.PI * 2);
    ctx.fill();
    kept.push(p);
  }
  ctx.restore();
  return kept;
}

/**
 * Runs `draw` every frame with the canvas sized to its box (sharp on high-density screens).
 * `draw` gets the context already scaled so one unit is `px / worldWidth` CSS pixels.
 */
export function useCanvasLoop(
  boxRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  worldWidth: number,
  worldHeight: number,
  draw: (ctx: CanvasRenderingContext2D, now: number, dt: number) => void,
) {
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let px = 0;
    let dpr = 1;
    const resize = () => {
      px = box.clientWidth;
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.max(1, Math.round(px * dpr));
      canvas.height = Math.max(1, Math.round(((px * worldHeight) / worldWidth) * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (px > 0) {
        const k = (px * dpr) / worldWidth;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        drawRef.current(ctx, now, dt);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [boxRef, canvasRef, worldWidth, worldHeight]);
}

/**
 * A fixed-step clock: calls `step` once per `tickMs` of real time while `running`, never racing ahead
 * after the tab was hidden (at most 3 steps a frame). `step` returns false to stop the clock.
 */
export function useFixedStep(running: boolean, tickMs: number, step: () => boolean) {
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let alive = true;
    const frame = (now: number) => {
      acc += now - last;
      last = now;
      let n = 0;
      while (acc >= tickMs && n < 3 && alive) {
        acc -= tickMs;
        n++;
        alive = stepRef.current();
      }
      if (acc > tickMs) acc = tickMs;
      if (alive) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, tickMs]);
}

/** Pointer position inside an element, in world units. */
export function toWorld(e: { clientX: number; clientY: number }, el: HTMLElement, worldWidth: number) {
  const r = el.getBoundingClientRect();
  const k = worldWidth / r.width;
  return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
