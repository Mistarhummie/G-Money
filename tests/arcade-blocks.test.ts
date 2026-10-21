import { describe, expect, it } from "vitest";
import {
  act,
  blocks,
  CELLS,
  encodeInput,
  fits,
  H,
  MAX_TICKS,
  newGame,
  nextPiece,
  stageConfig,
  tick,
  TICK_MS,
  W,
  type Action,
  type BlocksState,
  type TimedAction,
} from "@/lib/games/arcade/blocks";

/** Classic placement heuristic: low stack, few holes, flat surface, lines cleared. */
function evaluate(board: Uint8Array, type: number, rot: number, x: number): number {
  let y = 0;
  if (!fits(board, type, rot, x, 0)) return -Infinity;
  while (fits(board, type, rot, x, y + 1)) y++;
  const b = board.slice();
  for (const [r, c] of CELLS[type][rot]) b[(y + r) * W + x + c] = 1;
  let lines = 0;
  const rows: number[] = [];
  for (let row = 0; row < H; row++) {
    let full = true;
    for (let col = 0; col < W; col++) if (!b[row * W + col]) full = false;
    if (full) lines++;
    else rows.push(row);
  }
  const kept = rows.flatMap((row) => Array.from(b.subarray(row * W, row * W + W)));
  const grid = new Uint8Array(W * H);
  grid.set(kept, (H - rows.length) * W);
  let agg = 0;
  let holes = 0;
  let bump = 0;
  let prev = -1;
  for (let col = 0; col < W; col++) {
    let h = 0;
    let seen = false;
    for (let row = 0; row < H; row++) {
      if (grid[row * W + col]) {
        if (!seen) h = H - row;
        seen = true;
      } else if (seen) holes++;
    }
    agg += h;
    if (prev >= 0) bump += Math.abs(h - prev);
    prev = h;
  }
  return -0.51 * agg + 0.76 * lines - 0.36 * holes - 0.18 * bump;
}

/** Plays a whole game with the heuristic bot: one piece every `gap` ticks, placed with rotations, moves and a hard drop. */
function play(seed: number, stage: number, gap: number, stopAtLines = Infinity, maxTicks = MAX_TICKS) {
  const s = newGame(seed, stage);
  const actions: TimedAction[] = [];
  let t = 0;
  const run = (a: Action) => {
    if (s.alive && act(s, a)) actions.push({ tick: t, a });
  };
  while (s.alive && t < maxTicks && s.lines < stopAtLines) {
    t++;
    if (t % gap === 0) {
      const { type } = s.piece;
      let best = { score: -Infinity, rot: 0, x: s.piece.x };
      for (let rot = 0; rot < 4; rot++)
        for (let x = -2; x < W; x++) {
          const score = evaluate(s.board, type, rot, x);
          if (score > best.score) best = { score, rot, x };
        }
      for (let k = 0; k < best.rot; k++) run("C");
      while (s.piece.x > best.x && act(s, "L")) actions.push({ tick: t, a: "L" });
      while (s.piece.x < best.x && act(s, "R")) actions.push({ tick: t, a: "R" });
      run("S");
      run("H");
    }
    tick(s);
  }
  return { s, input: encodeInput(actions, t), ticks: t, actions: actions.length };
}

const verifyGame = (seed: number, stage: number, g: { input: string; ticks: number }) =>
  blocks.verify({ seed, stage, input: g.input, elapsedMs: g.ticks * TICK_MS + 1000 });

describe("blocks", () => {
  it("starts the same for the same seed and deals each bag of 7 once", () => {
    const a = newGame(7, 1);
    const b = newGame(7, 1);
    expect([a.piece.type, nextPiece(a)]).toEqual([b.piece.type, nextPiece(b)]);
    expect(new Set([a.piece.type, ...a.queue.slice(0, 6)]).size).toBe(7);
  });

  it("verifies an honest game as cleared", () => {
    for (let stage = 1; stage <= 5; stage++) {
      const { target } = stageConfig(stage);
      const g = play(500 + stage, stage, 40, target);
      expect(g.s.lines).toBeGreaterThanOrEqual(target);
      const v = verifyGame(500 + stage, stage, g);
      expect(v).toMatchObject({ valid: true, cleared: true, score: g.s.score, flagged: false });
    }
  });

  it("verifies a game that tops out without input", () => {
    const s = newGame(3, 5);
    let t = 0;
    while (s.alive) {
      t++;
      tick(s);
    }
    expect(blocks.verify({ seed: 3, stage: 5, input: `|end:${t}`, elapsedMs: 60_000 })).toMatchObject({ valid: true, cleared: false, score: 0 });
    expect(blocks.verify({ seed: 3, stage: 5, input: `|end:${t + 1}`, elapsedMs: 60_000 }).valid).toBe(false);
  });

  it("rejects junk and too-fast input", () => {
    for (const input of ["", "end:5", "x|end:5", "3:L,2:R|end:9", "3:Q|end:9", "12:L|end:5", "0:L|end:5"]) {
      expect(blocks.verify({ seed: 1, stage: 1, input, elapsedMs: 60_000 }).valid).toBe(false);
    }
    expect(blocks.verify({ seed: 1, stage: 1, input: "|end:1000", elapsedMs: 1000 })).toMatchObject({ valid: false, detail: "Played faster than real time" });
    expect(blocks.verify({ seed: 1, stage: 1, input: "|end:9999999", elapsedMs: 1e9 }).valid).toBe(false);
  });

  it("allows several moves in one tick", () => {
    const s = newGame(9, 1) as BlocksState;
    expect(blocks.verify({ seed: 9, stage: 1, input: "1:L,1:L,1:C,2:H|end:2", elapsedMs: 1000 }).valid).toBe(s.alive);
  });

  it("verifies a long game at the top stage in under 3 seconds", () => {
    const g = play(77, 5, 10);
    const t0 = performance.now();
    const v = verifyGame(77, 5, g);
    const ms = performance.now() - t0;
    console.log(`blocks stage 5: ${g.ticks} ticks, ${g.actions} actions, ${g.input.length} chars, ${g.s.lines} lines, verify ${ms.toFixed(1)} ms`);
    expect(v.valid).toBe(true);
    expect(ms).toBeLessThan(3000);

    // The full 30 minutes of ticks (stage 1, slow enough for one piece every 150 ticks).
    const full = play(78, 1, 150);
    expect(full.ticks).toBe(MAX_TICKS);
    const t1 = performance.now();
    expect(verifyGame(78, 1, full).valid).toBe(true);
    console.log(`blocks stage 1, ${full.ticks} ticks: verify ${(performance.now() - t1).toFixed(1)} ms`);
    expect(performance.now() - t1).toBeLessThan(3000);
  });
});
