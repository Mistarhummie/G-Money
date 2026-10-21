import { describe, expect, it } from "vitest";
import {
  applyMove,
  bao,
  computerMove,
  legalMoves,
  moveToString,
  newGame,
  parseMove,
  replay,
  replayPvp,
  seedsOf,
  startBoard,
  type Board,
  type Move,
} from "@/lib/games/arcade/bao";
import { mulberry32 } from "@/lib/games/arcade/rng";

/** The board seen from the computer's side, so the computer's own search can play for the player. */
const flip = (b: Board) => {
  const o = new Uint8Array(32);
  o.set(b.subarray(16), 0);
  o.set(b.subarray(0, 16), 16);
  return o;
};

/** Plays a whole game for the player with a search of `depth`, returning the input string. */
function playGame(seed: number, stage: number, depth: number): { input: string; result: string | null } {
  const rand = mulberry32(seed * 7 + 1);
  const moves: Move[] = [];
  let g = newGame(seed);
  while (!g.result) {
    const m = computerMove(flip(g.board), 1, depth, rand)!;
    moves.push(m);
    g = replay(seed, stage, moves)!;
  }
  return { input: moves.map(moveToString).join(" "), result: g.result };
}

describe("bao", () => {
  it("starts with 2 seeds in each of 32 pits and the same game for the same seed", () => {
    const b = startBoard();
    expect(seedsOf(b, 0) + seedsOf(b, 1)).toBe(64);
    expect(playGame(11, 3, 2)).toEqual(playGame(11, 3, 2));
  });

  it("keeps all 64 seeds through any move", () => {
    const rand = mulberry32(3);
    let b = startBoard();
    let side: 0 | 1 = 0;
    for (let i = 0; i < 30; i++) {
      const ms = legalMoves(b, side);
      if (!ms.length) break;
      b = applyMove(b, side, ms[Math.floor(rand() * ms.length)]);
      expect(seedsOf(b, 0) + seedsOf(b, 1)).toBe(64);
      side = (1 - side) as 0 | 1;
    }
  });

  it("parses the move notation", () => {
    expect(parseMove("B3+")).toEqual({ pit: 2, dir: 1 });
    expect(parseMove("A1-")).toEqual({ pit: 15, dir: -1 });
    expect(parseMove("A8+")).toEqual({ pit: 8, dir: 1 });
    expect(parseMove("C3+")).toBeNull();
    expect(moveToString({ pit: 12, dir: -1 })).toBe("A4-");
  });

  it("verifies a won game at stage 1 as cleared", () => {
    const { input, result } = playGame(2024, 1, 4);
    expect(result).toBe("win");
    const v = bao.verify({ seed: 2024, stage: 1, input, elapsedMs: 600_000 });
    expect(v.valid).toBe(true);
    expect(v.cleared).toBe(true);
    expect(v.score).toBeGreaterThan(1000);
    expect(v.score).toBeLessThan(2000);
    expect(v.flagged).toBe(false);
  });

  it("treats stopping early as a loss and flags inhuman speed", () => {
    const { input } = playGame(5, 2, 1);
    const first = input.split(" ")[0];
    expect(bao.verify({ seed: 5, stage: 2, input: first, elapsedMs: 60_000 })).toMatchObject({ valid: true, cleared: false, score: 0 });
    expect(bao.verify({ seed: 5, stage: 2, input: "", elapsedMs: 60_000 })).toMatchObject({ valid: true, cleared: false, score: 0 });
    expect(bao.verify({ seed: 5, stage: 2, input, elapsedMs: 100 }).flagged).toBe(true);
  });

  it("rejects junk, illegal moves and moves after the end", () => {
    for (const input of ["hello", "B9+", "B3", "b3+", "B3+,B4-"]) {
      expect(bao.verify({ seed: 1, stage: 1, input, elapsedMs: 60_000 }).valid).toBe(false);
    }
    // At the start capturing is compulsory, so some pit/direction pairs are illegal.
    const g = newGame(1);
    const legal = legalMoves(g.board, 0).map(moveToString);
    const illegal = ["A1+", "A1-", "B1+", "B1-", "B8+", "B8-"].find((t) => !legal.includes(t));
    if (illegal) expect(bao.verify({ seed: 1, stage: 1, input: illegal, elapsedMs: 60_000 }).valid).toBe(false);
    const { input } = playGame(2024, 1, 4);
    expect(bao.verify({ seed: 2024, stage: 1, input: `${input} B1+`, elapsedMs: 600_000 }).valid).toBe(false);
    expect(bao.verify({ seed: 1, stage: 1, input: Array(101).fill("B1+").join(" "), elapsedMs: 600_000 }).valid).toBe(false);
  });

  it("verifies the longest games at the top stage in well under 3 seconds", () => {
    let worst = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { input } = playGame(seed, 5, seed % 3 === 0 ? 3 : 1);
      const t = performance.now();
      expect(bao.verify({ seed, stage: 5, input, elapsedMs: 600_000 }).valid).toBe(true);
      worst = Math.max(worst, performance.now() - t);
    }
    expect(worst).toBeLessThan(3000);
  });

  describe("player vs player", () => {
    /** Two searching players; returns the move list (each in its mover's own notation). */
    function pvpGame(seed: number, depth0: number, depth1: number): string[] {
      const rand = mulberry32(seed);
      const moves: string[] = [];
      let g = replayPvp(moves)!;
      while (!g.over) {
        const m = computerMove(g.board, g.turn, g.turn === 0 ? depth0 : depth1, rand)!;
        moves.push(moveToString(m));
        g = replayPvp(moves)!;
      }
      return moves;
    }

    it("replays a full game to the right winner", () => {
      const moves = pvpGame(77, 4, 2);
      const state = bao.pvp!.replay(77, moves)!;
      expect(state.over).toBe(true);
      // The side that made the last move won (the other side was left without a move), unless drawn at 200 plies.
      if (moves.length < 200) expect(state.winner).toBe(((moves.length - 1) % 2) as 0 | 1);
      expect(bao.pvp!.replay(77, moves.slice(0, -1))).toMatchObject({ over: false, turn: ((moves.length - 1) % 2) as 0 | 1 });
    });

    it("matches the vs-computer game when the same moves are played", () => {
      // Interleave the player's moves with the computer's replies from a vs-computer game.
      const { input } = playGame(2024, 3, 3);
      const mine = input.split(" ").map((t) => parseMove(t)!);
      const all: string[] = [];
      for (let i = 1; i <= mine.length; i++) {
        const g = replay(2024, 3, mine.slice(0, i))!;
        all.push(moveToString(mine[i - 1]));
        if (g.lastComputerMove && g.plies === all.length + 1) all.push(moveToString(g.lastComputerMove));
      }
      const vsComputer = replay(2024, 3, mine)!;
      const state = bao.pvp!.replay(0, all)!;
      expect(state.over).toBe(true);
      expect(state.winner).toBe(vsComputer.result === "win" ? 0 : 1);
    });

    it("returns null for illegal, malformed and after-the-end moves", () => {
      const start = replayPvp([])!;
      const legal = legalMoves(start.board, 0).map(moveToString);
      const illegal = ["A1+", "A1-", "B1+", "B1-", "A8+", "B8-"].find((t) => !legal.includes(t))!;
      expect(bao.pvp!.replay(1, [illegal])).toBeNull();
      expect(bao.pvp!.replay(1, ["B9+"])).toBeNull();
      expect(bao.pvp!.replay(1, ["b3+"])).toBeNull();
      expect(bao.pvp!.replay(1, [""])).toBeNull();
      const moves = pvpGame(5, 3, 3);
      const end = replayPvp(moves)!;
      expect(end.over).toBe(true);
      expect(bao.pvp!.replay(5, [...moves, legal[0]])).toBeNull();
      expect(bao.pvp!.maxMoveLength).toBe(3);
    });

    it("replays long games quickly", () => {
      let worst = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const moves = pvpGame(seed, 1, 1);
        const t = performance.now();
        expect(bao.pvp!.replay(seed, moves)).not.toBeNull();
        worst = Math.max(worst, performance.now() - t);
      }
      expect(worst).toBeLessThan(200);
    });
  });
});
