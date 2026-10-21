import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/games/arcade/rng";
import { computerMove, drafts, legalMoves, newGame, notation, play, startBoard, type DraftsState } from "@/lib/games/arcade/drafts";

/** Let the module's own search pick the player's move, as if the player were the computer at `stage`. */
function playerMove(s: DraftsState, stage: number, rand: () => number) {
  return computerMove({ ...s, board: s.board.slice(), stage, rand });
}

/** Play a whole game: the player searches at `playerStage`, the computer at `stage`. Returns the input. */
function playGame(seed: number, stage: number, playerStage: number) {
  const s = newGame(seed, stage);
  const rand = mulberry32(seed + 12345);
  const tokens: string[] = [];
  while (s.result === 0) {
    const m = playerMove(s, playerStage, rand);
    tokens.push(notation(m));
    play(s, m);
    if (s.result === 0) play(s, computerMove(s));
  }
  return { input: tokens.join(" "), result: s.result, moves: tokens.length };
}

describe("drafts rules", () => {
  it("starts with 12 men each and the standard opening moves", () => {
    const b = startBoard();
    expect(b.filter((p) => p === 1)).toHaveLength(12);
    expect(b.filter((p) => p === -1)).toHaveLength(12);
    expect(legalMoves(b, 1).map(notation).sort()).toEqual(["21-17", "22-17", "22-18", "23-18", "23-19", "24-19", "24-20"]);
  });

  it("same seed gives the same start and the same computer replies", () => {
    const a = newGame(7, 3);
    const b = newGame(7, 3);
    expect(Array.from(a.board)).toEqual(Array.from(b.board));
    play(a, a.moves.find((m) => notation(m) === "22-18")!);
    play(b, b.moves.find((m) => notation(m) === "22-18")!);
    expect(notation(computerMove(a))).toEqual(notation(computerMove(b)));
  });

  it("forces captures, lets men capture backwards and chains jumps", () => {
    const b = new Int8Array(32);
    b[17] = 1; // player man on 18
    b[13] = -1; // computer man on 14 (diagonal ahead, up-left)
    b[21] = -1; // computer man on 22 (behind, down-left)
    b[5] = -1; // computer man on 6
    const moves = legalMoves(b, 1).map(notation).sort();
    // Captures only: forward 18x9 (jumping 14) then 9x2 (jumping 6); backward 18x25 (jumping 22).
    expect(moves).toEqual(["18x25", "18x9x2"]);
  });

  it("lets kings fly and capture from a distance", () => {
    const b = new Int8Array(32);
    b[28] = 2; // player king on 29 (bottom-left corner)
    b[10] = -1; // computer man on 11, far up the long diagonal
    const moves = legalMoves(b, 1).map(notation).sort();
    // 29 -> 25 -> 22 -> 18 -> 15 -> [11] -> 8 or 4
    expect(moves).toEqual(["29x4", "29x8"]);
    const quiet = new Int8Array(32);
    quiet[28] = 2;
    expect(legalMoves(quiet, 1).map(notation)).toEqual(["29-25", "29-22", "29-18", "29-15", "29-11", "29-8", "29-4"]);
  });
});

describe("drafts verify", () => {
  it("a won game at stage 1 verifies as cleared", () => {
    const game = playGame(3, 1, 4);
    expect(game.result).toBe(1);
    const v = drafts.verify({ seed: 3, stage: 1, input: game.input, elapsedMs: game.moves * 5000 });
    expect(v).toMatchObject({ valid: true, cleared: true, flagged: false });
    expect(v.score).toBeGreaterThan(1000);
    expect(v.score).toBeLessThan(2000);
  });

  it("flags inhumanly fast play", () => {
    const game = playGame(3, 1, 4);
    expect(drafts.verify({ seed: 3, stage: 1, input: game.input, elapsedMs: 1000 }).flagged).toBe(true);
  });

  it("stopping early is a valid loss", () => {
    expect(drafts.verify({ seed: 1, stage: 2, input: "22-18", elapsedMs: 5000 })).toMatchObject({ valid: true, cleared: false, score: 0 });
    expect(drafts.verify({ seed: 1, stage: 2, input: "", elapsedMs: 5000 })).toMatchObject({ valid: true, cleared: false, score: 0 });
  });

  it("rejects junk and illegal moves", () => {
    expect(drafts.verify({ seed: 1, stage: 1, input: "hello", elapsedMs: 5000 }).valid).toBe(false);
    expect(drafts.verify({ seed: 1, stage: 1, input: "22-17", elapsedMs: 5000 }).valid).toBe(true);
    expect(drafts.verify({ seed: 1, stage: 1, input: "22-15", elapsedMs: 5000 }).valid).toBe(false);
    expect(drafts.verify({ seed: 1, stage: 1, input: "18-22", elapsedMs: 5000 }).valid).toBe(false);
    expect(drafts.verify({ seed: 1, stage: 1, input: "22-18 ".repeat(200), elapsedMs: 5000 }).valid).toBe(false);
  });

  it("verifies a full-length game at the hardest stage in under 3 seconds", () => {
    // A weak searching player against the Master computer drags the game out to the 200-ply limit.
    const game = playGame(20, 5, 2);
    expect(game.moves).toBeGreaterThan(60);
    const t = performance.now();
    const v = drafts.verify({ seed: 20, stage: 5, input: game.input, elapsedMs: game.moves * 5000 });
    const ms = performance.now() - t;
    console.log(`drafts stage 5: ${game.moves} player moves, verify ${ms.toFixed(0)} ms`);
    expect(v.valid).toBe(true);
    expect(ms).toBeLessThan(3000);
  });
});
