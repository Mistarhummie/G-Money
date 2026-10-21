import { describe, expect, it } from "vitest";
import {
  chessbot,
  computerMove,
  fromFen,
  fromUci,
  gameStatus,
  legalMoves,
  perft,
  play,
  replay,
  startPosition,
  toUci,
  MAX_PLIES,
  type Position,
} from "@/lib/games/arcade/chessbot";

/** Plays White with the engine itself (at `whiteStage` strength) against the stage's computer. */
function scriptGame(seed: number, stage: number, whiteStage: number): string[] {
  let pos: Position = startPosition();
  const moves: string[] = [];
  while (!gameStatus(pos).over && moves.length < MAX_PLIES / 2) {
    const m = computerMove(pos, seed + 99, whiteStage);
    moves.push(toUci(m));
    pos = play(pos, m);
    if (gameStatus(pos).over) break;
    pos = play(pos, computerMove(pos, seed, stage));
  }
  return moves;
}

describe("chessbot rules", () => {
  it("generates exactly the right moves (perft)", () => {
    expect(perft(startPosition(), 4)).toBe(197281);
    expect(perft(fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"), 3)).toBe(97862);
    expect(perft(fromFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"), 5)).toBe(674624);
    expect(perft(fromFen("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1"), 4)).toBe(422333);
    expect(perft(fromFen("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8"), 3)).toBe(62379);
  });

  it("detects mate, stalemate and insufficient material", () => {
    expect(gameStatus(fromFen("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1"))).toMatchObject({ over: true, winner: 1, reason: "Checkmate" });
    expect(gameStatus(fromFen("7k/8/6QK/8/8/8/8/8 b - - 0 1"))).toMatchObject({ over: true, winner: 0, reason: "Stalemate" });
    expect(gameStatus(fromFen("8/8/4k3/8/8/2B5/4K3/8 w - - 0 1"))).toMatchObject({ over: true, winner: 0 });
    expect(gameStatus(fromFen("8/8/4k3/8/8/2R5/4K3/8 w - - 0 1")).over).toBe(false);
  });

  it("requires the promotion piece and handles en passant and castling", () => {
    const promo = fromFen("8/4P3/8/8/8/8/k7/4K3 w - - 0 1");
    expect(fromUci(promo, "e7e8")).toBeNull();
    expect(fromUci(promo, "e7e8n")).not.toBeNull();
    const ep = fromFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    const epMove = fromUci(ep, "e5d6")!;
    expect(play(ep, epMove).board[0x43]).toBe(0); // the d5 pawn is gone
    const castle = fromFen("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    const after = play(castle, fromUci(castle, "e1g1")!);
    expect(after.board[0x05]).toBe(4); // rook on f1
    expect(legalMoves(after).length).toBeGreaterThan(0);
  });
});

describe("chessbot verify", () => {
  it("same seed gives the same computer replies", () => {
    const a = replay(42, 3, "e2e4 g1f3 f1c4");
    const b = replay(42, 3, "e2e4 g1f3 f1c4");
    expect("pos" in a && "pos" in b && a.pos.history).toEqual("pos" in b && b.pos.history);
  });

  it("an honest win at stage 1 verifies as cleared", () => {
    let found = false;
    for (let seed = 1; seed < 20 && !found; seed++) {
      const moves = scriptGame(seed, 1, 4);
      const v = chessbot.verify({ seed, stage: 1, input: moves.join(" "), elapsedMs: 600_000 });
      expect(v.valid).toBe(true);
      if (v.cleared) {
        found = true;
        expect(v.score).toBe(1000 + Math.max(0, 1000 - moves.length * 10));
        expect(v.detail).toBe("Checkmate");
        expect(v.flagged).toBe(false);
        // The same game played at robot speed is flagged.
        expect(chessbot.verify({ seed, stage: 1, input: moves.join(" "), elapsedMs: 1000 }).flagged).toBe(true);
      }
    }
    expect(found).toBe(true);
  });

  it("stopping early is a loss", () => {
    const v = chessbot.verify({ seed: 5, stage: 2, input: "e2e4 d2d4", elapsedMs: 60_000 });
    expect(v).toMatchObject({ valid: true, cleared: false, score: 0 });
  });

  it("rejects illegal and junk input", () => {
    expect(chessbot.verify({ seed: 1, stage: 1, input: "e2e5", elapsedMs: 9000 }).valid).toBe(false);
    expect(chessbot.verify({ seed: 1, stage: 1, input: "hello world", elapsedMs: 9000 }).valid).toBe(false);
    expect(chessbot.verify({ seed: 1, stage: 1, input: "e7e5", elapsedMs: 9000 }).valid).toBe(false);
    expect(chessbot.verify({ seed: 1, stage: 1, input: "e2e4 ".repeat(300), elapsedMs: 9000 }).valid).toBe(false);
  });

  it("verifies the longest game at the hardest stage in under 3 seconds", () => {
    // The longest engine-vs-engine game we found at the top stage (67 White moves, a repetition draw).
    let worst = 0;
    for (const seed of [1]) {
      const moves = scriptGame(seed, 5, 4);
      const t = performance.now();
      const v = chessbot.verify({ seed, stage: 5, input: moves.join(" "), elapsedMs: 1_800_000 });
      worst = Math.max(worst, performance.now() - t);
      expect(v.valid).toBe(true);
    }
    console.log(`chessbot stage 5 worst verify: ${worst.toFixed(0)}ms`);
    expect(worst).toBeLessThan(3000);
  });

  it("100 top-stage searches of a busy middlegame fit in 3 seconds (upper bound for any game)", () => {
    const busy = fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
    const t = performance.now();
    for (let i = 0; i < MAX_PLIES / 2; i++) computerMove(busy, i, 5);
    const ms = performance.now() - t;
    console.log(`chessbot 100 busy stage 5 searches: ${ms.toFixed(0)}ms`);
    expect(ms).toBeLessThan(3000);
  });
});

describe("chessbot two-player", () => {
  const rules = chessbot.pvp!;

  it("replays a game to the right winner", () => {
    // Fool's mate: Black (side 1) wins.
    const fools = ["f2f3", "e7e5", "g2g4", "d8h4"];
    expect(rules.replay(0, fools.slice(0, 3))).toEqual({ turn: 1, over: false, winner: null });
    expect(rules.replay(0, fools)).toMatchObject({ over: true, winner: 1, detail: "Checkmate" });
    // Scholar's mate: White (side 0) wins.
    expect(rules.replay(7, ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"])).toMatchObject({ over: true, winner: 0 });
  });

  it("ends a draw with no winner", () => {
    const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"];
    expect(rules.replay(0, shuffle)).toMatchObject({ over: true, winner: null, detail: "Draw by threefold repetition" });
  });

  it("rejects illegal moves and moves after the end", () => {
    expect(rules.replay(0, ["e2e5"])).toBeNull();
    expect(rules.replay(0, ["e7e5"])).toBeNull(); // Black can't move first
    expect(rules.replay(0, ["junk"])).toBeNull();
    expect(rules.replay(0, ["f2f3", "e7e5", "g2g4", "d8h4", "e2e4"])).toBeNull();
    expect(rules.replay(0, Array(300).fill("e2e4"))).toBeNull();
  });

  it("replays a long game quickly", () => {
    // Engine plays both sides for up to the 200-ply cap.
    let pos = startPosition();
    const moves: string[] = [];
    while (!gameStatus(pos).over) {
      const m = computerMove(pos, moves.length, 2);
      moves.push(toUci(m));
      pos = play(pos, m);
    }
    const t = performance.now();
    const state = rules.replay(0, moves);
    const ms = performance.now() - t;
    console.log(`chessbot pvp replay of ${moves.length} plies: ${ms.toFixed(0)}ms`);
    expect(state?.over).toBe(true);
    expect(ms).toBeLessThan(200);
  });
});
