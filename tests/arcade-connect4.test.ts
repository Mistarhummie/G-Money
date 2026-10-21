import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/games/arcade/rng";
import { canPlay, cellAt, computerMove, connect4, newGame, play, winningLine, type C4State } from "@/lib/games/arcade/connect4";

/** Let the module's own search pick the player's column, as if the player were the computer at `stage`. */
function playerMove(s: C4State, stage: number, rand: () => number) {
  return computerMove({ ...s, bits: [{ ...s.bits[0] }, { ...s.bits[1] }, { ...s.bits[2] }], heights: s.heights.slice(), history: s.history.slice(), stage, rand });
}

function playGame(seed: number, stage: number, playerStage: number) {
  const s = newGame(seed, stage);
  const rand = mulberry32(seed + 999);
  let input = "";
  while (s.result === 0) {
    const c = playerMove(s, playerStage, rand);
    input += c;
    play(s, c);
    if (s.result === 0) play(s, computerMove(s));
  }
  return { input, result: s.result, state: s };
}

describe("connect4 rules", () => {
  it("same seed gives the same start and the same computer replies", () => {
    const a = newGame(5, 2);
    const b = newGame(5, 2);
    play(a, 3);
    play(b, 3);
    expect(computerMove(a)).toBe(computerMove(b));
  });

  it("detects four in a row and fills columns from the bottom", () => {
    const s = newGame(1, 1);
    // Player 0,1,2,3 along the bottom; the other side stacks on column 6.
    for (const c of [0, 6, 1, 6, 2, 6]) play(s, c);
    expect(s.result).toBe(0);
    expect(cellAt(s, 6, 2)).toBe(2);
    play(s, 3);
    expect(s.result).toBe(1);
    expect(winningLine(s)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(canPlay(s, 4)).toBe(false);
    const full = newGame(1, 1);
    for (const c of [0, 0, 0, 0, 0, 0]) play(full, c);
    expect(play(full, 0)).toBe(false);
  });

  it("the computer takes a win and blocks one", () => {
    const s = newGame(1, 2);
    for (const c of [0, 6, 1, 6, 2]) play(s, c);
    expect(computerMove(s)).toBe(3); // must block the bottom row
    const t = newGame(1, 2);
    for (const c of [0, 6, 0, 6, 1, 6, 5]) play(t, c);
    expect(computerMove(t)).toBe(6); // wins on column 6
  });
});

describe("connect4 verify", () => {
  it("a won game at stage 1 verifies as cleared", () => {
    const game = playGame(4, 1, 4);
    expect(game.result).toBe(1);
    const v = connect4.verify({ seed: 4, stage: 1, input: game.input, elapsedMs: game.input.length * 3000 });
    expect(v).toMatchObject({ valid: true, cleared: true, flagged: false });
    expect(v.score).toBeGreaterThan(1000);
    expect(v.score).toBeLessThan(2000);
  });

  it("flags inhumanly fast play and treats stopping early as a loss", () => {
    const game = playGame(4, 1, 4);
    expect(connect4.verify({ seed: 4, stage: 1, input: game.input, elapsedMs: 500 }).flagged).toBe(true);
    expect(connect4.verify({ seed: 4, stage: 3, input: "33", elapsedMs: 5000 })).toMatchObject({ valid: true, cleared: false, score: 0 });
  });

  it("rejects junk, full columns and moves after the end", () => {
    expect(connect4.verify({ seed: 1, stage: 1, input: "abc", elapsedMs: 5000 }).valid).toBe(false);
    expect(connect4.verify({ seed: 1, stage: 1, input: "7", elapsedMs: 5000 }).valid).toBe(false);
    expect(connect4.verify({ seed: 1, stage: 1, input: "0000000", elapsedMs: 5000 }).valid).toBe(false); // a 7th disc cannot fit in column 0
    const game = playGame(4, 1, 4);
    expect(connect4.verify({ seed: 4, stage: 1, input: game.input + "3", elapsedMs: 60000 }).valid).toBe(false);
  });

  it("verifies the slowest of many hardest-stage games in under 3 seconds", () => {
    let worst = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const game = playGame(seed, 5, 1 + (seed % 5));
      const t = performance.now();
      expect(connect4.verify({ seed, stage: 5, input: game.input, elapsedMs: 60000 }).valid).toBe(true);
      worst = Math.max(worst, performance.now() - t);
    }
    console.log(`connect4 stage 5: worst verify ${worst.toFixed(0)} ms`);
    expect(worst).toBeLessThan(3000);
  });
});

describe("connect4 pvp", () => {
  const replay = connect4.pvp!.replay;
  const split = (s: string) => s.split("");

  it("replays a two-player game to the right winner", () => {
    expect(replay(1, [])).toEqual({ turn: 0, over: false, winner: null });
    expect(replay(1, split("06162"))).toEqual({ turn: 1, over: false, winner: null });
    expect(replay(1, split("061626"))).toMatchObject({ over: false, turn: 0 });
    expect(replay(1, split("0616263"))).toMatchObject({ over: true, winner: 0 });
    expect(replay(1, split("50616263"))).toMatchObject({ over: true, winner: 1 });
  });

  it("returns null for illegal, malformed and after-the-end moves", () => {
    expect(replay(1, ["7"])).toBeNull();
    expect(replay(1, ["33"])).toBeNull();
    expect(replay(1, ["a"])).toBeNull();
    expect(replay(1, split("0000000"))).toBeNull(); // column 0 is full (or won) before the 7th disc
    expect(replay(1, split("06162634"))).toBeNull();
  });

  it("replays a full-board draw quickly", () => {
    // Random play that avoids completing four whenever it can, until a game fills the board.
    let draw: string[] | null = null;
    for (let seed = 1; !draw && seed < 500; seed++) {
      const rand = mulberry32(seed);
      const moves: string[] = [];
      for (;;) {
        const options = ["0", "1", "2", "3", "4", "5", "6"].filter((c) => replay(1, [...moves, c]));
        if (!options.length) break;
        const safe = options.filter((c) => !replay(1, [...moves, c])!.over);
        const pick = (safe.length ? safe : options)[Math.floor(rand() * (safe.length || options.length))];
        moves.push(pick);
        if (replay(1, moves)!.over) break;
      }
      if (moves.length === 42 && replay(1, moves)!.winner === null) draw = moves;
    }
    expect(draw).not.toBeNull();
    const t = performance.now();
    expect(replay(1, draw!)).toMatchObject({ over: true, winner: null });
    const ms = performance.now() - t;
    console.log(`connect4 pvp: 42 moves replayed in ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(200);
  });
});
