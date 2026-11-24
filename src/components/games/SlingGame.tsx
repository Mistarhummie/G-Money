"use client";

import { useEffect, useRef, useState } from "react";
import {
  clampPull, encodeInput, GROUND, guidePath, H, MAX_MS, MAX_PULL, MIN_PULL, newGame, ready, shoot, SLING_X, SLING_Y, stageConfig, STONE_R, tick,
  TICK_MS, W, type Shot, type SlingState,
} from "@/lib/games/arcade/sling";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { drawSparks, sparks, toWorld, useCanvasLoop, useFixedStep, type Spark } from "./fx/canvas";
import { useGameFx } from "./fx/GameFx";
import { prefersReducedMotion, useTweened, vibrate } from "./fx/motion";
import { useReportProgress } from "./useProgress";

const END_MS = MAX_MS - 15_000;

type View = { score: number; stones: number; popped: number; ready: boolean; alive: boolean; cleared: boolean };
const snapshot = (s: SlingState): View => ({
  score: s.score,
  stones: s.stones,
  popped: s.orbs.filter((o) => o.popped).length,
  ready: ready(s),
  alive: s.alive,
  cleared: s.cleared,
});

export default function SlingGame({ seed, stage, onFinish, onProgress, timeUp }: GameComponentProps) {
  const cfg = stageConfig(stage);
  const [preview] = useState(() => newGame(seed, stage));
  const totalOrbs = preview.orbs.length;
  const [view, setView] = useState<View>(() => snapshot(preview));
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const fx = useGameFx();
  const shownScore = useTweened(view.score, 300);
  useReportProgress(onProgress, started, view.score, `${view.popped}/${totalOrbs} orbs`);

  const game = useRef<SlingState>(preview);
  const shots = useRef<Shot[]>([]);
  const ticks = useRef(0);
  const finished = useRef(false);
  const queued = useRef<{ px: number; py: number } | null>(null);
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  });
  const fxRef = useRef(fx);
  useEffect(() => {
    fxRef.current = fx;
  });
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visual = useRef({ sparks: [] as Spark[], trail: [] as [number, number][], popAt: new Map<number, number>(), snapAt: 0 });

  function finish() {
    if (finished.current) return;
    finished.current = true;
    setOver(true);
    finishRef.current(encodeInput(shots.current, ticks.current));
  }
  useEffect(() => {
    if (timeUp) finish();
  }, [timeUp]);

  useFixedStep(started && !over, TICK_MS, () => {
    const s = game.current;
    if (finished.current) return false;
    const t = ++ticks.current;
    const q = queued.current;
    if (q && ready(s)) {
      queued.current = null;
      if (shoot(s, q.px, q.py)) {
        shots.current.push({ tick: t, px: q.px, py: q.py });
        visual.current.trail = [];
        visual.current.snapAt = performance.now();
        vibrate(12);
      }
    }
    tick(s);
    const now = performance.now();
    const v = visual.current;
    const calm = prefersReducedMotion();
    for (const e of s.events) {
      if (e.kind === "pop") {
        const o = s.orbs[e.orb];
        v.popAt.set(e.orb, now);
        if (!calm) v.sparks.push(...sparks(o.x, o.y, now, "#5eead4", 22, 260, 700));
        vibrate(15);
        fxRef.current.pop(e.combo > 1 ? `Combo x${e.combo}! +${e.points}` : `+${e.points}`, { tone: e.combo > 1 ? "great" : "good", emoji: "💥", ms: 900 });
      } else if (e.kind === "break") {
        const b = s.blocks[e.block];
        if (!calm) v.sparks.push(...sparks(b.x + b.w / 2, b.y + b.h / 2, now, "#f59e0b", 18, 200, 650));
        fxRef.current.shake();
      } else if (e.kind === "crack") {
        const b = s.blocks[e.block];
        if (!calm) v.sparks.push(...sparks(b.x + b.w / 2, b.y + b.h / 2, now, "#fbbf24", 6, 120, 400));
      } else if (e.kind === "bounce" && e.spring) {
        fxRef.current.pop("Boing!", { tone: "info", emoji: "🌀", ms: 700 });
      } else if (e.kind === "clear") {
        fxRef.current.confetti(70);
        fxRef.current.pop("All orbs popped!", { tone: "great", emoji: "🏆", sub: e.bonus ? `+${e.bonus} for stones left` : undefined });
      }
    }
    if (t % 4 === 0 || s.events.length || !s.alive) setView(snapshot(s));
    if (!s.alive) {
      if (!s.cleared) fxRef.current.pop("Out of stones", { tone: "bad", emoji: "🪨" });
      finish();
      return false;
    }
    if (t * TICK_MS >= END_MS) {
      finish();
      return false;
    }
    return true;
  });

  useCanvasLoop(boxRef, canvasRef, W, H, (ctx, now, dt) => {
    const s = game.current;
    const v = visual.current;
    const calm = prefersReducedMotion();

    // Night sky and hills.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#0b1020");
    sky.addColorStop(0.7, "#1e1b4b");
    sky.addColorStop(1, "#312e81");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 40; i++) {
      const x = (i * 197) % W;
      const y = (i * 89) % 260;
      ctx.globalAlpha = 0.2 + 0.3 * (calm ? 1 : Math.abs(Math.sin(now / 900 + i)));
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#1a1740";
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.quadraticCurveTo(200, GROUND - 70, 420, GROUND - 20);
    ctx.quadraticCurveTo(620, GROUND - 60, W, GROUND - 10);
    ctx.lineTo(W, GROUND);
    ctx.fill();
    const ground = ctx.createLinearGradient(0, GROUND, 0, H);
    ground.addColorStop(0, "#22d3a6");
    ground.addColorStop(0.08, "#065f46");
    ground.addColorStop(1, "#022c22");
    ctx.fillStyle = ground;
    ctx.fillRect(0, GROUND, W, H - GROUND);

    // Paths of moving orbs.
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = "rgba(94,234,212,0.18)";
    ctx.lineWidth = 2;
    for (const o of s.orbs) {
      if (o.popped || !o.def.period) continue;
      ctx.beginPath();
      ctx.moveTo(o.def.x, o.def.y);
      ctx.lineTo(o.def.x2!, o.def.y2!);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Blocks.
    for (const b of s.blocks) {
      if (b.kind === "wood" && b.hp <= 0) continue;
      if (b.kind === "wood") {
        ctx.fillStyle = b.hp === 1 ? "#92400e" : "#b45309";
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 3;
        ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
        if (b.w >= 30 && b.h >= 30) {
          ctx.beginPath();
          ctx.moveTo(b.x + 3, b.y + 3);
          ctx.lineTo(b.x + b.w - 3, b.y + b.h - 3);
          ctx.stroke();
        }
        if (b.hp === 1) {
          ctx.strokeStyle = "rgba(11,16,32,0.8)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(b.x + b.w * 0.3, b.y);
          ctx.lineTo(b.x + b.w * 0.45, b.y + b.h * 0.5);
          ctx.lineTo(b.x + b.w * 0.35, b.y + b.h);
          ctx.stroke();
        }
      } else if (b.kind === "steel") {
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        g.addColorStop(0, "#e2e8f0");
        g.addColorStop(0.5, "#64748b");
        g.addColorStop(1, "#334155");
        ctx.fillStyle = g;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = "#0f172a";
        for (const [x, y] of [[b.x + 4, b.y + 4], [b.x + b.w - 6, b.y + 4], [b.x + 4, b.y + b.h - 6], [b.x + b.w - 6, b.y + b.h - 6]]) ctx.fillRect(x, y, 2, 2);
      } else {
        ctx.fillStyle = "#22d3a6";
        ctx.shadowColor = "#22d3a6";
        ctx.shadowBlur = calm ? 0 : 12;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 6);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#064e3b";
        ctx.lineWidth = 2;
        for (let x = b.x + 8; x < b.x + b.w - 4; x += 10) {
          ctx.beginPath();
          ctx.moveTo(x, b.y + 3);
          ctx.lineTo(x + 5, b.y + b.h - 3);
          ctx.stroke();
        }
      }
    }

    // Orbs: glowing, gently pulsing; a ring bursts out when popped.
    s.orbs.forEach((o, i) => {
      const popped = v.popAt.get(i);
      if (o.popped) {
        if (popped !== undefined && now - popped < 400 && !calm) {
          const k = (now - popped) / 400;
          ctx.strokeStyle = `rgba(94,234,212,${1 - k})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r + k * 30, 0, Math.PI * 2);
          ctx.stroke();
        }
        return;
      }
      const pulse = calm ? 0 : Math.sin(now / 300 + i) * 2;
      ctx.fillStyle = "rgba(94,234,212,0.16)";
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r + 8 + pulse, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(o.x - o.r * 0.35, o.y - o.r * 0.35, 1, o.x, o.y, o.r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, "#5eead4");
      g.addColorStop(1, "#0d9488");
      ctx.fillStyle = g;
      ctx.shadowColor = "#5eead4";
      ctx.shadowBlur = calm ? 0 : 16;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Sling frame (back arm, then band and stone, then front arm).
    const d = drag.current;
    const pull = d ? clampPull(d.px, d.py) ?? { px: d.px, py: d.py } : null;
    const pullLen = pull ? Math.min(MAX_PULL, Math.hypot(pull.px, pull.py)) : 0;
    const restX = SLING_X;
    const restY = SLING_Y;
    const hold = pull && pullLen > 0 ? [restX + (pull.px / Math.max(1, Math.hypot(pull.px, pull.py))) * pullLen, restY + (pull.py / Math.max(1, Math.hypot(pull.px, pull.py))) * pullLen] : [restX, restY];
    ctx.lineCap = "round";
    ctx.strokeStyle = "#a16207";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(SLING_X, GROUND);
    ctx.lineTo(SLING_X, SLING_Y + 30);
    ctx.lineTo(SLING_X - 22, SLING_Y - 14);
    ctx.stroke();
    const showStone = ready(s) || !started;
    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(SLING_X - 22, SLING_Y - 14);
    ctx.lineTo(hold[0], hold[1]);
    ctx.lineTo(SLING_X + 22, SLING_Y - 14);
    ctx.stroke();
    if (showStone && !over) {
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.arc(hold[0], hold[1], STONE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(15,23,42,0.35)";
      ctx.beginPath();
      ctx.arc(hold[0] + 3, hold[1] + 3, STONE_R * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(SLING_X, SLING_Y + 30);
    ctx.lineTo(SLING_X + 22, SLING_Y - 14);
    ctx.stroke();

    // Aiming guide: a short dotted start of the flight (none on the last stage).
    if (pull && pullLen >= MIN_PULL && cfg.guide > 0) {
      const pts = guidePath(s, Math.round(pull.px), Math.round(pull.py), cfg.guide);
      pts.forEach(([x, y], i) => {
        ctx.globalAlpha = 0.9 - (i / pts.length) * 0.7;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    if (pull) {
      // Power bar under the sling.
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(SLING_X - 40, GROUND + 14, 80, 6);
      ctx.fillStyle = pullLen >= MAX_PULL ? "#f43f5e" : "#22d3a6";
      ctx.fillRect(SLING_X - 40, GROUND + 14, (80 * pullLen) / MAX_PULL, 6);
    }

    // The stone in flight.
    const st = s.stone;
    if (st) {
      if (!calm) {
        v.trail.push([st.x, st.y]);
        if (v.trail.length > 14) v.trail.shift();
        v.trail.forEach(([x, y], i) => {
          ctx.globalAlpha = ((i + 1) / v.trail.length) * 0.3;
          ctx.fillStyle = "#c4b5fd";
          ctx.beginPath();
          ctx.arc(x, y, STONE_R * ((i + 1) / v.trail.length), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "#e2e8f0";
      ctx.shadowColor = "#a78bfa";
      ctx.shadowBlur = calm ? 0 : 10;
      ctx.beginPath();
      ctx.arc(st.x, st.y, STONE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Wind sock.
    if (s.wind) {
      const k = s.wind / 0.03;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "600 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Wind ${k > 0 ? "→" : "←"} ${Math.round(Math.abs(k) * 10)}`, W / 2, 28);
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 50 * k, 40);
      ctx.lineTo(W / 2 + 50 * k, 40);
      ctx.stroke();
    }
    v.sparks = drawSparks(ctx, v.sparks, now, dt);
  });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (over) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toWorld(e, e.currentTarget, W);
    drag.current = { sx: p.x, sy: p.y, px: 0, py: 0 };
    if (!started) setStarted(true);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const p = toWorld(e, e.currentTarget, W);
    d.px = p.x - d.sx;
    d.py = p.y - d.sy;
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || over) return;
    const c = clampPull(d.px, d.py);
    if (!c) return;
    queued.current = { px: Math.round(c.px), py: Math.round(c.py) };
  }

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-center justify-between gap-2 text-sm text-white/70">
        <span className="flex items-center gap-2">
          <span aria-label={`${view.stones} stones left`}>
            {Array.from({ length: cfg.stones }, (_, i) => (
              <span key={i} className={i < view.stones ? "text-white" : "text-white/20"}>●</span>
            ))}
          </span>
          <span>
            🔮 {view.popped}/{totalOrbs}
          </span>
          <span>
            <span className="font-semibold text-amber-200">{Math.round(shownScore).toLocaleString()}</span> pts
          </span>
        </span>
        <button type="button" className="underline" onClick={finish} disabled={over}>
          Give up
        </button>
      </div>
      <div
        className="relative mx-auto w-full overflow-hidden rounded-2xl border border-mint/25 shadow-[0_0_30px_rgba(34,211,166,0.15)]"
        style={{ aspectRatio: `${W} / ${H}`, touchAction: "none", maxWidth: fx.fullscreen ? "calc((100dvh - 12rem) * 1.6)" : 820 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
      >
        <div ref={boxRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="block h-full w-full" role="img" aria-label="Sling Strike field" />
        </div>
        {!started && !over && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 p-6 text-center text-white/85">
            <p className="text-lg font-semibold">{cfg.name}</p>
            <p>Drag back anywhere and let go to throw</p>
            <p className="text-xs text-white/60">Pull further for more power</p>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-white/50">{cfg.goal}</p>
    </div>
  );
}
