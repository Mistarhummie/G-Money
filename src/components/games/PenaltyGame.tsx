"use client";

import { useEffect, useRef, useState } from "react";
import {
  canDive, canKick, cpuKick, cpuSaves, dive, encodeInput, KEEPER_X, KEEPER_Y, keeperAt, kick, KICK_FLIGHT, MAX_MS, newGame, stageConfig, swayAt,
  tick, TICK_MS, type Action, type KickRecord, type PenaltyState,
} from "@/lib/games/arcade/penalty";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { drawSparks, sparks, toWorld, useCanvasLoop, useFixedStep, type Spark } from "./fx/canvas";
import { useGameFx } from "./fx/GameFx";
import { prefersReducedMotion, vibrate } from "./fx/motion";
import { diveTilt, drawBall, drawGoal, drawKeeper, drawKicker, drawPitch, drawSight, fromScene, OUTCOME_TEXT, SCENE_H, SCENE_W, toScene } from "./penalty/scene";
import { useReportProgress } from "./useProgress";

const END_MS = MAX_MS - 15_000;
const RUN_UP = 40;

type View = { kicks: KickRecord[]; you: number; cpu: number; phase: PenaltyState["phase"]; active: boolean; score: number; cleared: boolean };
const snapshot = (s: PenaltyState): View => ({
  kicks: s.kicks.slice(),
  you: s.you,
  cpu: s.cpu,
  phase: s.phase,
  active: s.ticks >= s.phaseAt,
  score: s.score,
  cleared: s.cleared,
});

export function KickDots({ kicks, label, mine }: { kicks: { outcome: string }[]; label: string; mine?: boolean }) {
  const n = Math.max(5, kicks.length);
  return (
    <div className="flex items-center gap-2">
      <span className={`w-16 truncate text-xs ${mine ? "text-white" : "text-white/60"}`}>{label}</span>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: n }, (_, i) => {
          const k = kicks[i];
          return (
            <span
              key={i}
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                !k ? "border border-white/20" : k.outcome === "goal" ? "bg-mint text-navy" : "bg-rose-500/80 text-white"
              }`}
            >
              {k ? (k.outcome === "goal" ? "✓" : "✕") : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function PenaltyGame({ seed, stage, onFinish, onProgress, timeUp }: GameComponentProps) {
  const cfg = stageConfig(stage);
  const [preview] = useState(() => newGame(seed, stage));
  const [view, setView] = useState<View>(() => snapshot(preview));
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const fx = useGameFx();
  useReportProgress(onProgress, started, view.score, `${view.you}–${view.cpu}`);

  const game = useRef<PenaltyState>(preview);
  const actions = useRef<Action[]>([]);
  const ticks = useRef(0);
  const finished = useRef(false);
  const aim = useRef<[number, number]>([560, 70]);
  const queued = useRef<{ a: "K" | "D"; x: number; y: number } | null>(null);
  const holding = useRef(false);
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
  const visual = useRef({ sparks: [] as Spark[], netAt: 0 });

  function finish() {
    if (finished.current) return;
    finished.current = true;
    setOver(true);
    finishRef.current(encodeInput(actions.current, ticks.current));
  }
  useEffect(() => {
    if (timeUp) finish();
  }, [timeUp]);

  function announce(k: KickRecord, s: PenaltyState) {
    const yours = k.by === "you";
    const good = yours ? k.outcome === "goal" : k.outcome !== "goal";
    const text = !yours && k.outcome === "saved" ? "What a save!" : OUTCOME_TEXT[k.outcome];
    fxRef.current.pop(text, { tone: good ? "great" : "bad", emoji: good ? (yours ? "⚽" : "🧤") : "😬", sub: `${s.you}–${s.cpu}`, ms: 1300 });
    vibrate(good ? [15, 30, 15] : 30);
    const at = performance.now() + (yours ? KICK_FLIGHT * TICK_MS : 0);
    if (k.outcome === "goal") {
      setTimeout(() => {
        visual.current.netAt = performance.now();
        if (!prefersReducedMotion()) {
          const [sx, sy] = toScene(k.x, k.y);
          visual.current.sparks.push(...sparks(sx, sy, performance.now(), yours ? "#22d3a6" : "#f43f5e", 20, 220, 700));
        }
      }, Math.max(0, at - performance.now()));
    }
  }

  useFixedStep(started && !over, TICK_MS, () => {
    const s = game.current;
    if (finished.current) return false;
    const t = ++ticks.current;
    const before = s.kicks.length;
    tick(s);
    const q = queued.current;
    if (q) {
      if (q.a === "K" && canKick(s)) {
        queued.current = null;
        if (kick(s, q.x, q.y)) actions.current.push({ tick: t, a: "K", x: q.x, y: q.y });
      } else if (q.a === "D" && canDive(s)) {
        queued.current = null;
        if (dive(s, q.x, q.y)) actions.current.push({ tick: t, a: "D", x: q.x, y: q.y });
      } else if (!(q.a === "K" ? s.phase === "kick" : s.phase === "save")) queued.current = null;
    }
    for (let i = before; i < s.kicks.length; i++) announce(s.kicks[i], s);
    if (t % 4 === 0 || s.kicks.length !== before || !s.alive) setView(snapshot(s));
    if (!s.alive) {
      if (s.cleared) {
        setTimeout(() => fxRef.current.confetti(80), 600);
        fxRef.current.pop("You win the shootout!", { tone: "great", emoji: "🏆", sub: `${s.you}–${s.cpu}`, ms: 2200 });
      } else fxRef.current.pop(s.you === s.cpu ? "Level after ten each" : "Beaten on penalties", { tone: "bad", sub: `${s.you}–${s.cpu}`, ms: 2200 });
      setTimeout(finish, 1200);
      return false;
    }
    if (t * TICK_MS >= END_MS) {
      finish();
      return false;
    }
    return true;
  });

  useCanvasLoop(boxRef, canvasRef, SCENE_W, SCENE_H, (ctx, now, dt) => {
    const s = game.current;
    const v = visual.current;
    const calm = prefersReducedMotion();
    const t = s.ticks;
    const netShake = calm ? 0 : Math.max(0, 1 - (now - v.netAt) / 400) * Math.sin(now / 25) * 4;
    drawPitch(ctx, calm, now);
    drawGoal(ctx, netShake);

    const last = s.kicks[s.kicks.length - 1];
    const savePhase = s.phase === "save" && t >= s.phaseAt;
    const afterYourKick = s.lastKick && last?.by === "you" && (s.phase !== "kick" || t < s.phaseAt) && !savePhase;
    const afterCpuKick = last?.by === "cpu" && s.phase !== "save" && (t < s.phaseAt || s.phase === "over");

    if (savePhase || afterCpuKick) {
      // You're in goal (mint gloves, violet kit), the computer kicks.
      const target = savePhase ? cpuKick(s) : ([last.x, last.y] as const);
      const strike = s.strikeAt;
      const arrive = s.arriveAt;
      const d = s.dive;
      const [kx, ky] = d ? keeperAt(d.x, d.y, Math.min(t, arrive) - d.at) : [KEEPER_X, KEEPER_Y];
      const p = d ? Math.min(1, (Math.min(t, arrive) - d.at) / 12) : 0;
      drawKeeper(ctx, kx, ky, d ? diveTilt(d.x, d.y, p) : 0, "#7c3aed", "#22d3a6");
      if (savePhase && t < strike) drawKicker(ctx, 1 - (strike - t) / RUN_UP, "#f59e0b");
      const bt = t < strike ? 0 : (t - strike) / (arrive - strike);
      const out = last?.by === "cpu" ? last.outcome : null;
      if (afterCpuKick && out === "saved") {
        // Parried away.
        const k = Math.min(1, (t - arrive) / 30);
        drawBall(ctx, target[0] + (target[0] < 366 ? -1 : 1) * 200 * k, target[1] + 120 * k, 1, now / 80);
      } else drawBall(ctx, target[0], target[1], savePhase ? bt : 1, t * 0.4);
    } else {
      // You kick; the computer keeper (amber) waits, then dives after your shot.
      let kx = KEEPER_X;
      let ky = KEEPER_Y;
      let tilt = 0;
      const lk = s.lastKick;
      if (afterYourKick && lk) {
        const p = Math.min(1, (t - lk.at) / KICK_FLIGHT);
        const toBall = lk.outcome === "saved" ? 1 : cpuSaves(s.stage, lk.x, lk.y, 0) ? 0.55 : 0.6;
        const tx = KEEPER_X + (lk.x - KEEPER_X) * toBall;
        const ty = Math.max(40, KEEPER_Y + (lk.y - KEEPER_Y) * toBall);
        kx = KEEPER_X + (tx - KEEPER_X) * p;
        ky = KEEPER_Y + (ty - KEEPER_Y) * p;
        tilt = diveTilt(tx, ty, p);
      }
      drawKeeper(ctx, kx, ky, tilt);
      if (afterYourKick && lk) {
        const p = (t - lk.at) / KICK_FLIGHT;
        if (lk.outcome === "post" && p > 1) {
          const k = Math.min(1, (p - 1) * 1.5);
          drawBall(ctx, lk.x + (lk.x < 366 ? 60 : -60) * k, Math.max(0, lk.y - 80 * k), 1 - 0.4 * k, now / 60);
        } else drawBall(ctx, lk.x, lk.y, Math.min(1, p), t * 0.4);
      } else {
        drawBall(ctx, 366, 0, 0, 0);
        if (!over && s.alive && (t >= s.phaseAt || !started)) {
          const { dx, dy } = swayAt(s, t);
          drawSight(ctx, aim.current[0] + dx, aim.current[1] + dy, 1, calm);
        }
      }
    }
    v.sparks = drawSparks(ctx, v.sparks, now, dt);
  });

  function cm(e: React.PointerEvent<HTMLDivElement>): [number, number] {
    const p = toWorld(e, e.currentTarget, SCENE_W);
    const [x, y] = fromScene(p.x, p.y);
    return [Math.round(Math.max(-140, Math.min(872, x))), Math.round(Math.max(0, Math.min(380, y)))];
  }
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (over) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const s = game.current;
    const p = cm(e);
    if (!started) setStarted(true);
    if (s.phase === "save") {
      // Diving: tap where the ball is going.
      queued.current = { a: "D", x: Math.max(-60, Math.min(792, p[0])), y: Math.min(300, p[1]) };
      return;
    }
    aim.current = p;
    holding.current = true;
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (game.current.phase !== "kick") return;
    if (e.pointerType !== "mouse" && !holding.current) return;
    aim.current = cm(e);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!holding.current) return;
    holding.current = false;
    if (game.current.phase !== "kick" || over) return;
    aim.current = cm(e);
    queued.current = { a: "K", x: aim.current[0], y: aim.current[1] };
  }

  const yours = view.kicks.filter((k) => k.by === "you");
  const theirs = view.kicks.filter((k) => k.by === "cpu");
  const prompt = over
    ? view.cleared
      ? "You won the shootout!"
      : "Shootout over"
    : !started
      ? "Tap the goal to start"
      : view.phase === "kick"
        ? view.active
          ? "Your kick: aim, and let go when the sight is on your spot"
          : "Get ready to shoot…"
        : view.active
          ? "In goal: tap where the ball is going to dive"
          : "Swap: you're in goal next";

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <KickDots kicks={yours} label="You" mine />
          <KickDots kicks={theirs} label="Computer" />
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-white">
            {view.you}–{view.cpu}
          </p>
          <button type="button" className="text-sm text-white/70 underline" onClick={finish} disabled={over}>
            Give up
          </button>
        </div>
      </div>
      <div
        className="relative mx-auto w-full overflow-hidden rounded-2xl border border-mint/25 shadow-[0_0_30px_rgba(34,211,166,0.15)]"
        style={{ aspectRatio: `${SCENE_W} / ${SCENE_H}`, touchAction: "none", maxWidth: fx.fullscreen ? "calc((100dvh - 13rem) * 1.5)" : 800, cursor: "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (holding.current = false)}
      >
        <div ref={boxRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="block h-full w-full" role="img" aria-label="Penalty shootout" />
        </div>
        {!started && !over && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 p-6 text-center text-white/85">
            <p className="text-lg font-semibold">{cfg.name}</p>
            <p>You shoot first. Aim at the goal and let go to shoot.</p>
            <p className="text-xs text-white/60">Then go in goal and tap where the ball is going.</p>
          </div>
        )}
      </div>
      <p className={`text-center text-sm ${view.phase === "save" && view.active ? "font-semibold text-amber-200" : "text-white/70"}`}>{prompt}</p>
    </div>
  );
}
