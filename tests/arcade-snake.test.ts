import { describe, expect, it } from "vitest";
import { cloneState, encodeInput, newGame, SIZE, snake, stageConfig, step, turn, type Dir, type SnakeState, type Turn } from "@/lib/games/arcade/snake";

const DIRS: Dir[] = ["U", "D", "L", "R"];

/** Free cells reachable from the head, and the path length to the food (a breadth-first flood fill). */
function room(s: SnakeState): { n: number; dist: number } {
  const seen = new Uint8Array(SIZE * SIZE);
  const depth = new Map<number, number>([[s.body[0], 0]]);
  const queue = [s.body[0]];
  seen[s.body[0]] = 1;
  let n = 0;
  let dist = 999;
  for (let qi = 0; qi < queue.length; qi++) {
    const cell = queue[qi];
    if (cell === s.food) dist = Math.min(dist, depth.get(cell)!);
    const r = Math.floor(cell / SIZE);
    const c = cell % SIZE;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let nr = r + dr;
      let nc = c + dc;
      if (s.wrap) {
        nr = (nr + SIZE) % SIZE;
        nc = (nc + SIZE) % SIZE;
      } else if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const k = nr * SIZE + nc;
      if (seen[k] || s.walls[k] || s.occupied[k]) continue;
      seen[k] = 1;
      n++;
      depth.set(k, depth.get(cell)! + 1);
      queue.push(k);
    }
  }
  return { n, dist };
}

/** A simple honest bot: head for the food, never into a dead end if it can help it. */
function play(seed: number, stage: number, maxTicks: number, stopAt = Infinity) {
  const s = newGame(seed, stage);
  const turns: Turn[] = [];
  let t = 0;
  while (s.alive && t < maxTicks && s.eaten < stopAt) {
    t++;
    let best: Dir = s.dir;
    let bestScore = -Infinity;
    for (const d of DIRS) {
      const trial = cloneState(s);
      if (d !== trial.dir && !turn(trial, d)) continue;
      step(trial);
      if (!trial.alive) continue;
      const { n: space, dist } = room(trial);
      const score = (space >= trial.body.length ? 1000 : space) - dist + (trial.eaten > s.eaten ? 2000 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    if (turn(s, best)) turns.push({ tick: t, dir: best });
    step(s);
  }
  return { input: encodeInput(turns, t), state: s, ticks: t };
}

describe("snake", () => {
  it("starts the same for the same seed", () => {
    expect(newGame(42, 1).food).toBe(newGame(42, 1).food);
    expect(newGame(42, 3).body).toEqual(newGame(42, 3).body);
  });

  it("verifies an honest game as cleared at every stage", () => {
    for (let stage = 1; stage <= 5; stage++) {
      const { target, tickMs } = stageConfig(stage);
      const { input, state, ticks } = play(1234 + stage, stage, 20_000, target);
      expect(state.eaten).toBe(target);
      const v = snake.verify({ seed: 1234 + stage, stage, input, elapsedMs: ticks * tickMs + 500 });
      expect(v).toMatchObject({ valid: true, cleared: true, score: target * 10 * stage, flagged: false });
    }
  });

  it("verifies a game that ends in a crash", () => {
    // Straight right on the walled stage hits the wall on move 12.
    expect(snake.verify({ seed: 1, stage: 2, input: "|end:12", elapsedMs: 5000 }).valid).toBe(true);
    expect(snake.verify({ seed: 1, stage: 2, input: "|end:13", elapsedMs: 5000 })).toMatchObject({ valid: false });
    // Stage 1 wraps around, so the same run is fine.
    expect(snake.verify({ seed: 1, stage: 1, input: "|end:12", elapsedMs: 5000 }).valid).toBe(true);
  });

  it("rejects junk and too-fast input", () => {
    for (const input of ["", "end:5", "abc|end:5", "3:U,2:L|end:9", "3:U,3:L|end:9", "3:X|end:9", "12:U|end:5"]) {
      expect(snake.verify({ seed: 1, stage: 1, input, elapsedMs: 60_000 }).valid).toBe(false);
    }
    expect(snake.verify({ seed: 1, stage: 1, input: "|end:100", elapsedMs: 1000 })).toMatchObject({ valid: false, detail: "Played faster than real time" });
    expect(snake.verify({ seed: 1, stage: 1, input: "|end:99999999", elapsedMs: 1e9 }).valid).toBe(false);
  });

  it("verifies the longest hardest game in under 3 seconds", () => {
    const { tickMs } = stageConfig(5);
    const maxTicks = Math.floor(snake.timeLimitMs / tickMs);
    const { input, ticks } = play(99, 5, maxTicks);
    const t0 = performance.now();
    const v = snake.verify({ seed: 99, stage: 5, input, elapsedMs: ticks * tickMs });
    const ms = performance.now() - t0;
    console.log(`snake stage 5: ${ticks} ticks, verify ${ms.toFixed(1)} ms`);
    expect(v.valid).toBe(true);
    expect(ms).toBeLessThan(3000);

    // Worst case: a turn on every tick for the full 30 minutes, circling a 2×2 square.
    let seed = 1;
    while ([8 * SIZE + 3, 8 * SIZE + 4, 9 * SIZE + 3, 9 * SIZE + 4].includes(newGame(seed, 5).food)) seed++;
    const cycle: Dir[] = ["D", "L", "U", "R"];
    const turns: Turn[] = Array.from({ length: maxTicks }, (_, i) => ({ tick: i + 1, dir: cycle[i % 4] }));
    const long = encodeInput(turns, maxTicks);
    const t1 = performance.now();
    const w = snake.verify({ seed, stage: 5, input: long, elapsedMs: maxTicks * tickMs });
    const ms2 = performance.now() - t1;
    console.log(`snake stage 5 worst case: ${maxTicks} ticks, ${long.length} chars, verify ${ms2.toFixed(1)} ms`);
    expect(w).toMatchObject({ valid: true, flagged: true });
    expect(ms2).toBeLessThan(3000);
  });
});
