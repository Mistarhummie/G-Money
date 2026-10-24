"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { canMove, maxTile, move, newGame, stageConfig, type Dir, type State } from "@/lib/games/arcade/g2048";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { useGameFx, type PopOptions } from "./fx/GameFx";
import { prefersReducedMotion, useTweened, vibrate } from "./fx/motion";
import { slideTiles, tilesFor, tileStyle, type Tile } from "./g2048/tiles";
import { useReportProgress } from "./useProgress";

const KEYS: Record<string, Dir> = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R", w: "U", s: "D", a: "L", d: "R" };

/** Tiles are 22.75% of the board with 3% gaps, so one cell along is 25.75/22.75 of a tile's own width. */
const TILE = 22.75;
const PITCH = ((TILE + 3) / TILE) * 100;
const SLIDE_MS = 130;
const at = (cell: number) => `translate(${(cell % 4) * PITCH}%, ${Math.floor(cell / 4) * PITCH}%)`;
/** The longest a session may stay open (matches the game's time limit). */
const SESSION_MS = 30 * 60 * 1000;

type Game = { state: State; moves: string; tiles: Tile[]; gained: number };

export default function Game2048({ seed, stage, onFinish, onProgress }: GameComponentProps) {
  const { target } = stageConfig(stage);
  const [game, setGame] = useState<Game>(() => {
    const state = newGame(seed);
    return { state, moves: "", tiles: tilesFor(state.board), gained: 0 };
  });
  const [done, setDone] = useState(false);
  // The latest game, updated at once so two quick key presses never play from a stale board.
  const live = useRef(game);
  const ended = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const els = useRef(new Map<number, HTMLDivElement>());
  const fx = useGameFx();
  const { state, moves } = game;
  const shownScore = useTweened(state.score, 300);
  const best = maxTile(state.board);
  useReportProgress(onProgress, moves.length > 0, state.score, `best tile ${best}`);
  const reached = best >= target;
  const stuck = !canMove(state.board);

  // Popups: at most one a second, except the ones that must be seen.
  const lastPop = useRef(0);
  const say = (text: string, opts: PopOptions, force = false) => {
    const now = performance.now();
    if (!force && now - lastPop.current < 1000) return;
    lastPop.current = now;
    fx.pop(text, opts);
  };

  function finish() {
    if (ended.current) return;
    ended.current = true;
    setDone(true);
    onFinish(live.current.moves);
  }

  function play(dir: Dir) {
    if (ended.current) return;
    // Moves that change nothing are not sent.
    const prev = live.current;
    const next = move(seed, prev.state, dir);
    if (!next) return;
    const { tiles, merges } = slideTiles(prev.tiles, dir, next.board);
    live.current = { state: next, moves: prev.moves + dir, tiles, gained: next.score - prev.state.score };
    setGame(live.current);
    celebrate(prev.state.board, next.board, merges);
    if (!canMove(next.board)) {
      fx.shake();
      vibrate([30, 40, 30]);
      finish();
    }
  }

  /** Popups for what this move made (one at a time, most important first). */
  function celebrate(before: number[], after: number[], merges: number[]) {
    const was = maxTile(before);
    const now = maxTile(after);
    const half = target / 2;
    if (merges.length) vibrate(merges.length > 1 ? 15 : 8);
    if (now > was && now >= target && was < target) {
      say(`${target}!`, { tone: "great", emoji: "🏆", sub: "Target made. Keep going or press Finish" }, true);
      fx.confetti(25);
    } else if (now > was && now >= half && was < half) {
      say("Halfway to target", { tone: "info", emoji: "🚀", sub: `${now} made, ${target} to go` });
    } else if (now > was && now >= 128) {
      say(`New tile ${now}`, { tone: now >= 1024 ? "great" : "good", emoji: "✨" });
    } else if (merges.length >= 3) {
      say(`Combo x${merges.length}`, { tone: merges.length >= 4 ? "great" : "good", emoji: "🔥" });
    } else {
      const free = (b: number[]) => b.filter((v) => !v).length;
      if (free(after) <= 1 && free(before) > 1 && canMove(after)) say("Almost full!", { tone: "warn", emoji: "⚠️" });
    }
  }

  // Tiles glide from where they were (ease-out), merged tiles pop with a little overshoot, new ones grow in.
  useLayoutEffect(() => {
    const map = els.current;
    for (const el of map.values()) for (const a of el.getAnimations()) a.finish();
    if (prefersReducedMotion() || !moves) return;
    for (const t of game.tiles) {
      const el = map.get(t.id);
      if (!el) continue;
      if (t.kind === "move" || t.kind === "ghost") {
        el.animate(
          [
            { transform: at(t.from), opacity: 1 },
            { transform: at(t.cell), opacity: 1 },
          ],
          { duration: SLIDE_MS, easing: "cubic-bezier(.2,.8,.3,1)" },
        );
      } else if (t.kind === "merged") {
        el.animate(
          [
            { transform: `${at(t.cell)} scale(0.4)`, filter: "brightness(1.8)" },
            { transform: `${at(t.cell)} scale(1.22)`, filter: "brightness(1.4)", offset: 0.55 },
            { transform: `${at(t.cell)} scale(1)`, filter: "brightness(1)" },
          ],
          { duration: 230, delay: SLIDE_MS - 10, easing: "ease-out", fill: "backwards" },
        );
      } else if (t.kind === "new") {
        el.animate(
          [
            { transform: `${at(t.cell)} scale(0)`, opacity: 0 },
            { transform: `${at(t.cell)} scale(1.08)`, opacity: 1, offset: 0.7 },
            { transform: `${at(t.cell)} scale(1)`, opacity: 1 },
          ],
          { duration: 200, delay: SLIDE_MS + 20, easing: "ease-out", fill: "backwards" },
        );
      }
    }
  }, [game.tiles, moves]);

  // The session only counts for 30 minutes: warn near the end.
  const fxRef = useRef(fx);
  useEffect(() => {
    fxRef.current = fx;
  });
  useEffect(() => {
    if (done) return;
    const start = performance.now();
    const warned = { minute: false, ten: false };
    const timer = setInterval(() => {
      const left = SESSION_MS - (performance.now() - start);
      if (!warned.minute && left <= 60_000) {
        warned.minute = true;
        fxRef.current.pop("1 minute left", { tone: "warn", emoji: "⏳" });
      }
      if (!warned.ten && left <= 10_000) {
        warned.ten = true;
        fxRef.current.pop("Last 10 seconds", { tone: "bad", emoji: "⏰" });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [done]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEYS[e.key];
      if (!dir) return;
      e.preventDefault();
      play(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    play(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U");
  }

  const progress = Math.min(1, Math.log2(best) / Math.log2(target));

  return (
    <div className="flex flex-col gap-3 select-none">
      <style>{`@keyframes g2048-gain { 0% { transform: translateY(4px); opacity: 0 } 20% { opacity: 1 } 100% { transform: translateY(-18px); opacity: 0 } }`}</style>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm text-white/70">
          <span className="relative">
            <span className="font-semibold text-amber-200">{Math.round(shownScore).toLocaleString()}</span> pts · {moves.length} moves
            {game.gained > 0 && (
              <span
                key={moves.length}
                className="pointer-events-none absolute -top-1 left-0 font-bold text-emerald-300"
                style={{ animation: "g2048-gain .7s ease-out forwards" }}
              >
                +{game.gained}
              </span>
            )}
          </span>
          <button
            type="button"
            className={reached ? "rounded-full bg-emerald-500 px-3 py-1 font-semibold text-emerald-950" : "underline"}
            onClick={finish}
            disabled={done}
          >
            {reached ? "Finish" : "Give up"}
          </button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 via-fuchsia-500 to-amber-400 transition-[width] duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div
        className="relative mx-auto aspect-square w-full rounded-2xl border border-sky-300/20 bg-gradient-to-br from-[#0f1b3d] via-[#120d2e] to-[#1f0b2e] shadow-[0_0_32px_rgba(56,189,248,0.15)]"
        style={{ touchAction: "none", containerType: "inline-size", maxWidth: fx.fullscreen ? "calc(100dvh - 13rem)" : undefined }}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={onTouchEnd}
      >
        <div className="absolute inset-[3%]">
          {Array.from({ length: 16 }, (_, i) => (
            <div
              key={i}
              className="absolute left-0 top-0 rounded-[12%] bg-white/[0.06] shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]"
              style={{ width: `${TILE}%`, height: `${TILE}%`, transform: at(i) }}
            />
          ))}
          {game.tiles.map((t) => {
            const digits = String(t.value).length;
            return (
              <div
                key={t.id}
                ref={(el) => {
                  if (el) els.current.set(t.id, el);
                  else els.current.delete(t.id);
                }}
                className="absolute left-0 top-0 flex items-center justify-center rounded-[12%] font-extrabold tabular-nums will-change-transform"
                style={{
                  width: `${TILE}%`,
                  height: `${TILE}%`,
                  transform: at(t.cell),
                  opacity: t.kind === "ghost" ? 0 : 1,
                  zIndex: t.kind === "merged" ? 3 : t.kind === "ghost" ? 1 : 2,
                  fontSize: `${digits <= 2 ? 10 : digits === 3 ? 8.5 : digits === 4 ? 6.8 : 5.6}cqw`,
                  ...tileStyle(t.value),
                }}
              >
                {t.value}
              </div>
            );
          })}
        </div>
        {stuck && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/55 text-2xl font-bold text-white">No moves left</div>
        )}
      </div>

      <p className="text-center text-xs text-white/50">
        {reached ? `You made ${target}! Keep going for more points, or press Finish.` : `Swipe or use the arrow keys. Make a ${target} tile.`}
      </p>
    </div>
  );
}
