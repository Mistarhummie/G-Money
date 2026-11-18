import { describe, expect, it } from "vitest";
import { canMove, g2048, maxTile, move, newGame, slideBoard, type Board, type Dir } from "@/lib/games/arcade/g2048";

const DIRS: Dir[] = ["D", "L", "R", "U"];

/** Board quality: empty cells, big tiles in the bottom-left corner, smooth rows. */
function evaluate(b: Board): number {
  let empty = 0;
  let corner = 0;
  let rough = 0;
  for (let i = 0; i < 16; i++) {
    if (!b[i]) empty++;
    const r = Math.floor(i / 4);
    const c = i % 4;
    corner += b[i] * (r + (3 - c));
    if (c < 3) rough += Math.abs(b[i] - b[i + 1]);
    if (r < 3) rough += Math.abs(b[i] - b[i + 4]);
  }
  return empty * 200 + corner - rough;
}

/** Two-ply greedy bot (ignores where new tiles land). */
function play(seed: number, stopAt = Infinity) {
  let state = newGame(seed);
  let moves = "";
  while (canMove(state.board) && maxTile(state.board) < stopAt) {
    let best: Dir | null = null;
    let bestScore = -Infinity;
    for (const d of DIRS) {
      const one = slideBoard(state.board, d);
      if (!one) continue;
      let score = evaluate(one.board) + one.gained;
      for (const d2 of DIRS) {
        const two = slideBoard(one.board, d2);
        if (two) score = Math.max(score, evaluate(two.board) + one.gained + two.gained);
      }
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    state = move(seed, state, best!)!;
    moves += best;
  }
  return { state, moves };
}

describe("2048", () => {
  it("starts the same for the same seed with two tiles", () => {
    expect(newGame(5)).toEqual(newGame(5));
    expect(newGame(5).board.filter((v) => v).length).toBe(2);
  });

  it("merges each tile once per move and scores the merges", () => {
    const board = [2, 2, 2, 2, 4, 0, 4, 0, 0, 0, 0, 0, 8, 8, 16, 0];
    const res = slideBoard(board, "L")!;
    expect(res.board.slice(0, 4)).toEqual([4, 4, 0, 0]);
    expect(res.board.slice(4, 8)).toEqual([8, 0, 0, 0]);
    expect(res.board.slice(12, 16)).toEqual([16, 16, 0, 0]);
    expect(res.gained).toBe(4 + 4 + 8 + 16);
    expect(slideBoard([2, 4, 8, 16, ...Array(12).fill(0)], "L")).toBeNull();
  });

  it("verifies an honest game that reaches 512", () => {
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const { state, moves } = play(seed, 512);
      if (maxTile(state.board) < 512) continue;
      found = true;
      const v = g2048.verify({ seed, stage: 1, input: moves, elapsedMs: moves.length * 300 });
      expect(v).toMatchObject({ valid: true, cleared: true, score: state.score, flagged: false });
      // The same moves do not clear the 1024 stage.
      expect(g2048.verify({ seed, stage: 2, input: moves, elapsedMs: moves.length * 300 }).cleared).toBe(false);
    }
    expect(found).toBe(true);
  });

  it("rejects junk, no-op moves and flags inhuman speed", () => {
    expect(g2048.verify({ seed: 1, stage: 1, input: "UDX", elapsedMs: 10_000 }).valid).toBe(false);
    // Find a move that changes nothing on the first board and check it is refused.
    const start = newGame(11);
    const noop = (["U", "D", "L", "R"] as Dir[]).find((d) => !slideBoard(start.board, d));
    if (noop) expect(g2048.verify({ seed: 11, stage: 1, input: noop, elapsedMs: 10_000 }).valid).toBe(false);
    const { moves } = play(3, 128);
    expect(g2048.verify({ seed: 3, stage: 1, input: moves, elapsedMs: 1000 })).toMatchObject({ valid: true, flagged: true });
    expect(g2048.verify({ seed: 3, stage: 1, input: "L".repeat(30_000), elapsedMs: 1e7 }).valid).toBe(false);
  });

  it("verifies a long game at the top stage in under 3 seconds", () => {
    const { moves } = play(42);
    const t0 = performance.now();
    const v = g2048.verify({ seed: 42, stage: 4, input: moves, elapsedMs: moves.length * 200 });
    const ms = performance.now() - t0;
    console.log(`2048 stage 4: ${moves.length} moves, verify ${ms.toFixed(1)} ms`);
    expect(v.valid).toBe(true);
    expect(ms).toBeLessThan(3000);
  });
});
