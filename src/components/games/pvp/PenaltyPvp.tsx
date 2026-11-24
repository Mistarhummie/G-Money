"use client";

import { useEffect, useMemo, useRef } from "react";
import { commitment, GOAL_H, GOAL_W, KEEPER_X, KEEPER_Y, pvpStateOf, replayMatch, ZONE_NAMES } from "@/lib/games/arcade/penalty";
import type { PvpBoardProps } from "@/lib/games/arcade/types";
import { drawSparks, sparks, toWorld, useCanvasLoop, type Spark } from "../fx/canvas";
import { prefersReducedMotion, vibrate } from "../fx/motion";
import { KickDots } from "../PenaltyGame";
import { diveTilt, drawBall, drawGoal, drawKeeper, drawPitch, drawSight, fromScene, OUTCOME_TEXT, SCENE_H, SCENE_W, toScene } from "../penalty/scene";

/** Centre of each keeper zone (cm), for the dive picture. */
const ZONE_AT: [number, number][] = [
  [130, 45],
  [366, 45],
  [602, 45],
  [130, 170],
  [366, 175],
  [602, 170],
];
const ANIM_MS = 900;

const storeKey = (seed: number, names: [string, string], index: number) => `penalty-pick:${seed}:${names.join("|")}:${index}`;

function randomSecret(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Two-player penalty shootout. Side 1 kicks first (side 0 opens by picking a dive). The keeper picks a zone in secret (only a
 * fingerprint goes to the server), the kicker shoots, then the keeper's screen reveals the pick.
 */
export default function PenaltyPvp({ seed, moves, mySide, names, onMove, disabled }: PvpBoardProps) {
  const match = useMemo(() => replayMatch(seed, moves), [seed, moves]);
  const sent = useRef<number | null>(null);
  const aim = useRef<[number, number] | null>(null);
  const holding = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visual = useRef({ sparks: [] as Spark[], kickAt: 0, seen: -1 });

  const state = match && pvpStateOf(match);
  const amKeeper = !!match && mySide === match.keeper;
  const amKicker = !!match && mySide === match.kicker;
  const waitingOnMe = !!match && !!state && !state.over && mySide === state.turn && !disabled;

  function send(move: string) {
    sent.current = moves.length;
    onMove(move);
  }

  // A new kick finished: play it.
  const kicks = match?.kicks.length ?? 0;
  useEffect(() => {
    const v = visual.current;
    if (v.seen === -1) {
      v.seen = kicks;
      return;
    }
    if (kicks > v.seen && match) {
      v.seen = kicks;
      v.kickAt = performance.now();
      const k = match.kicks[kicks - 1];
      setTimeout(() => {
        vibrate(k.outcome === "goal" ? [15, 30, 15] : 25);
        if (k.outcome === "goal" && !prefersReducedMotion()) {
          const [sx, sy] = toScene(k.x, k.y);
          v.sparks.push(...sparks(sx, sy, performance.now(), "#22d3a6", 20, 220, 700));
        }
      }, ANIM_MS * 0.6);
    }
  }, [kicks, match]);

  // The keeper's own pick for the kick in progress, saved on this device when it was made.
  const myPick = useMemo(() => {
    if (!match || match.step !== 2 || !amKeeper) return null;
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey(seed, names, moves.length - 2)) ?? "null") as { zone: number; secret: string } | null;
      return saved && commitment(saved.zone, saved.secret) === match.pending.commit ? saved : null;
    } catch {
      return null;
    }
  }, [match, amKeeper, seed, names, moves.length]);
  const lost = !!match && match.step === 2 && amKeeper && !myPick;

  // The keeper's screen reveals the pick as soon as the kick is in.
  useEffect(() => {
    if (!myPick || disabled || sent.current === moves.length) return;
    sent.current = moves.length;
    onMove(`r:${myPick.zone}:${myPick.secret}`);
  }, [myPick, disabled, moves.length, onMove]);

  function pickZone(zone: number) {
    if (!waitingOnMe || !match || match.step !== 0 || !amKeeper) return;
    const secret = randomSecret();
    try {
      localStorage.setItem(storeKey(seed, names, moves.length), JSON.stringify({ zone, secret }));
    } catch {
      // Without storage the pick can't be revealed later; still let the player try.
    }
    send(`c:${commitment(zone, secret)}`);
  }

  const canShoot = waitingOnMe && match?.step === 1 && amKicker;
  function cm(e: React.PointerEvent<HTMLDivElement>): [number, number] {
    const p = toWorld(e, e.currentTarget, SCENE_W);
    const [x, y] = fromScene(p.x, p.y);
    return [Math.round(Math.max(-140, Math.min(GOAL_W + 140, x))), Math.round(Math.max(0, Math.min(380, y)))];
  }

  useCanvasLoop(boxRef, canvasRef, SCENE_W, SCENE_H, (ctx, now, dt) => {
    const v = visual.current;
    const calm = prefersReducedMotion();
    drawPitch(ctx, calm, now);
    drawGoal(ctx, 0);
    const last = match?.kicks[match.kicks.length - 1];
    const p = last ? Math.min(1, (now - v.kickAt) / ANIM_MS) : 0;
    const fresh = last && now - v.kickAt < 2600;
    if (last && fresh) {
      const [zx, zy] = ZONE_AT[last.zone];
      const kp = Math.min(1, p * 1.4);
      drawKeeper(ctx, KEEPER_X + (zx - KEEPER_X) * kp, KEEPER_Y + (zy - KEEPER_Y) * kp, diveTilt(zx, zy, kp), last.kicker === mySide ? "#f59e0b" : "#7c3aed");
      if (last.outcome === "saved" && p >= 1) {
        const k = Math.min(1, (now - v.kickAt - ANIM_MS) / 400);
        drawBall(ctx, last.x + (last.x < 366 ? -180 : 180) * k, last.y + 100 * k, 1, now / 80);
      } else drawBall(ctx, last.x, last.y, p, now / 120);
      if (p >= 1) {
        ctx.fillStyle = last.outcome === "goal" ? "#22d3a6" : "#f43f5e";
        ctx.font = "800 44px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.shadowColor = "#0b1020";
        ctx.shadowBlur = 12;
        ctx.fillText(OUTCOME_TEXT[last.outcome], SCENE_W / 2, 90);
        ctx.shadowBlur = 0;
      }
    } else {
      drawKeeper(ctx, KEEPER_X, KEEPER_Y, 0, amKeeper ? "#7c3aed" : "#f59e0b");
      drawBall(ctx, 366, 0, 0, 0);
      if (canShoot && aim.current) drawSight(ctx, aim.current[0], aim.current[1], 1, calm);
    }
    v.sparks = drawSparks(ctx, v.sparks, now, dt);
  });

  if (!match || !state) return <div className="rounded-2xl bg-black/30 p-6 text-center text-white/70">This match could not be loaded.</div>;

  const name = (side: 0 | 1) => (mySide === side ? `${names[side]} (you)` : names[side]);
  const showZones = waitingOnMe && match.step === 0 && amKeeper;
  const status = state.over
    ? state.winner === null
      ? state.detail ?? "Draw"
      : `${names[state.winner]} wins${state.detail ? ` · ${state.detail}` : ""}`
    : lost
      ? "Your keeper pick was made on another device or browser. Open the match there to reveal it, or the clock will run out."
      : mySide === null
        ? `${names[match.kicker]} kicks, ${names[match.keeper]} keeps`
        : match.step === 0
          ? amKeeper
            ? "You're in goal: pick where to dive. It stays secret until the kick is taken."
            : `${names[match.keeper]} is picking where to dive…`
          : match.step === 1
            ? amKicker
              ? "Your kick: tap or drag to aim, let go to shoot. Close to the post is risky."
              : `${names[match.kicker]} is lining up the kick…`
            : "Kick taken. Revealing the keeper's dive…";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          {([0, 1] as const).map((side) => (
            <KickDots key={side} kicks={match.kicks.filter((k) => k.kicker === side)} label={name(side)} mine={mySide === side} />
          ))}
        </div>
        <p className="text-2xl font-bold tabular-nums text-white">
          {match.goals[0]}–{match.goals[1]}
        </p>
      </div>
      <div
        className="relative mx-auto w-full overflow-hidden rounded-2xl border border-mint/25"
        style={{ aspectRatio: `${SCENE_W} / ${SCENE_H}`, touchAction: "none", maxWidth: 800 }}
        onPointerDown={(e) => {
          if (!canShoot) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          holding.current = true;
          aim.current = cm(e);
        }}
        onPointerMove={(e) => {
          if (canShoot && (holding.current || e.pointerType === "mouse")) aim.current = cm(e);
        }}
        onPointerUp={(e) => {
          if (!holding.current || !canShoot) return;
          holding.current = false;
          const [x, y] = cm(e);
          send(`k:${x}:${y}`);
        }}
      >
        <div ref={boxRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="block h-full w-full" role="img" aria-label="Penalty shootout" />
        </div>
        {showZones && (
          <div className="absolute grid grid-cols-3 grid-rows-2 gap-1" style={zoneBox()}>
            {[3, 4, 5, 0, 1, 2].map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => pickZone(z)}
                className="rounded-lg border border-mint/40 bg-mint/10 text-xs font-semibold text-white/90 transition hover:bg-mint/30 active:scale-95"
              >
                {ZONE_NAMES[z]}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className={`text-center text-sm ${state.over ? "font-semibold text-emerald-200" : waitingOnMe ? "font-semibold text-amber-200" : "text-white/70"}`}>{status}</p>
    </div>
  );
}

/** The goal mouth as a percentage box over the scene, for the zone buttons. */
function zoneBox(): React.CSSProperties {
  const [x0, y0] = toScene(0, GOAL_H);
  const [x1, y1] = toScene(GOAL_W, 0);
  return { left: `${(x0 / SCENE_W) * 100}%`, top: `${(y0 / SCENE_H) * 100}%`, width: `${((x1 - x0) / SCENE_W) * 100}%`, height: `${((y1 - y0) / SCENE_H) * 100}%` };
}
