import { describe, expect, it } from "vitest";
import {
  NYUMBA,
  STOP,
  SAFARI,
  applyMove,
  bao,
  computerMove,
  expand,
  isLegal,
  legalMoves,
  moveToString,
  mustCapture,
  newGame,
  outcome,
  parseMove,
  replay,
  replayPvp,
  seedsOf,
  startState,
  traceMove,
  type Move,
  type State,
} from "@/lib/games/arcade/bao";
import { mulberry32 } from "@/lib/games/arcade/rng";

/** A position from per-side pit lists (k = 0..15: A1..A8 then B8..B1) and stores; side 0 to move. */
function position(mine: Record<number, number>, theirs: Record<number, number>, store: [number, number] = [0, 0], house: [boolean, boolean] = [false, false]): State {
  const board = new Uint8Array(32);
  for (const [k, n] of Object.entries(mine)) board[Number(k)] = n;
  for (const [k, n] of Object.entries(theirs)) board[16 + Number(k)] = n;
  return { board, store, house, blocked: -1, turn: 0 };
}

const names = (s: State) => legalMoves(s).map(moveToString).sort();
const total = (s: State) => seedsOf(s, 0) + seedsOf(s, 1);

/** Random legal games, calling `visit` before each move. */
function randomGames(count: number, visit: (s: State, m: Move, plies: number) => void, seed0 = 1) {
  for (let seed = seed0; seed < seed0 + count; seed++) {
    const rand = mulberry32(seed);
    let s = startState();
    let plies = 0;
    while (!outcome(s, plies).over) {
      const ms = legalMoves(s);
      const m = ms[Math.floor(rand() * ms.length)];
      visit(s, m, plies);
      s = applyMove(s, m);
      plies++;
    }
  }
}

/** Plays a whole game for the player with the computer's own search at `strength`, returning the input. */
function playGame(seed: number, stage: number, strength: number): { input: string; result: string | null } {
  const rand = mulberry32(seed * 7 + 1);
  const moves: Move[] = [];
  let g = newGame(seed);
  while (!g.result) {
    moves.push(computerMove(g.state, strength, rand)!);
    g = replay(seed, stage, moves)!;
  }
  return { input: moves.map(moveToString).join(" "), result: g.result };
}

describe("bao la kiswahili", () => {
  it("sets up 32 seeds a side: 6 in the nyumba, 2 + 2 to its right, 22 in the store", () => {
    const s = startState();
    for (const side of [0, 1]) {
      const pits = Array.from(s.board.subarray(side * 16, side * 16 + 16));
      expect(pits).toEqual([0, 0, 0, 0, 6, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(s.store[side]).toBe(22);
      expect(seedsOf(s, side as 0 | 1)).toBe(32);
    }
    // Point-symmetric: my nyumba (A5) faces the opponent's A4, which is empty.
    expect(NYUMBA).toBe(4);
    expect(s.board[16 + 7 - NYUMBA]).toBe(0);
    expect(s.house).toEqual([true, true]);
  });

  it("keeps all 64 seeds through every move", () => {
    randomGames(60, (s, m) => {
      expect(total(applyMove(s, m))).toBe(64);
    });
  });

  it("opens in namua: one seed from the store, never into the working nyumba", () => {
    const s = startState();
    expect(mustCapture(s)).toBe(false);
    expect(names(s)).toEqual(["A6<", "A6>", "A7<", "A7>"]);
    const t = traceMove(s, parseMove("A6<")!);
    expect(t.steps[0]).toMatchObject({ kind: "place", k: 5 });
    const after = applyMove(s, parseMove("A6<")!);
    expect(Array.from(after.board.subarray(0, 8))).toEqual([0, 0, 1, 1, 7, 0, 2, 0]);
    expect(after.store).toEqual([21, 22]);
    expect(after.turn).toBe(1);
    // The reply must capture: A5 and A6 face my new seeds; from the centre the kichwa is a choice.
    expect(mustCapture(after)).toBe(true);
    expect(legalMoves(after).every((m) => m.dir === 0 && m.kichwa !== -1)).toBe(true);
    expect(names(after).filter((n) => !/[SX]$/.test(n)).map((n) => n.slice(0, 3))).toEqual(
      expect.arrayContaining(["A5L", "A5R", "A6L", "A6R"]),
    );
  });

  it("namua capture: the seeds go to the kimbi's kichwa, or the chosen one from the centre", () => {
    // My A2 and A4 face their A7 and A5.
    const s = position({ 1: 1, 3: 2, 10: 3 }, { 6: 3, 4: 2, 0: 1 }, [5, 5]);
    expect(names(s)).toEqual(expect.arrayContaining(["A2", "A4L", "A4R"]));
    expect(isLegal(s, parseMove("A2L")!)).toBe(false);
    expect(isLegal(s, parseMove("A4")!)).toBe(false);
    expect(isLegal(s, parseMove("A6>")!)).toBe(false); // capturing is compulsory
    const kimbi = traceMove(s, parseMove("A2")!);
    expect(kimbi.steps.find((st) => st.kind === "capture")).toMatchObject({ side: 1, k: 6, hand: 3 });
    expect(kimbi.steps.find((st) => st.kind === "kichwa")).toMatchObject({ k: 0, dir: 1, chosen: false });
    for (const [token, k, dir] of [["A4L", 0, 1], ["A4R", 7, -1]] as const) {
      const t = traceMove(s, parseMove(token)!);
      expect(t.steps.find((st) => st.kind === "kichwa")).toMatchObject({ k, dir, chosen: true });
      expect(t.captured).toBeGreaterThanOrEqual(2);
    }
  });

  it("mtaji capture keeps the direction, except a kimbi capture turns to its own kichwa", () => {
    // A6< drops into A5 and A4; my A4 was occupied and faces their A5 (k = 7 - 3 = 4).
    const s = position({ 5: 2, 3: 1, 0: 1 }, { 4: 3, 0: 2, 2: 1 });
    const t = traceMove(s, parseMove("A6<")!);
    expect(t.capturing).toBe(true);
    expect(t.steps.find((st) => st.kind === "kichwa")).toMatchObject({ k: 7, dir: -1 });
    // Going right into my A7 (a kimbi): the captured seeds start from the right kichwa, now going left.
    const r = position({ 3: 3, 6: 1 }, { 1: 2, 0: 1, 5: 1 });
    const tr = traceMove(r, parseMove("A4>")!);
    expect(tr.capturing).toBe(true);
    expect(tr.steps.find((st) => st.kind === "kichwa")).toMatchObject({ k: 7, dir: -1 });
    // A pit of 16 or more seeds never captures.
    const big = position({ 0: 16, 5: 1, 7: 1 }, { 2: 3, 1: 2, 7: 1 });
    expect(mustCapture(big)).toBe(false);
  });

  it("takasa: front row first, singletons last, an only kichwa sows to the centre", () => {
    // Mtaji, no captures possible (their front row faces only my empty pits).
    const front = position({ 2: 2, 5: 1, 12: 5 }, { 0: 1 });
    expect(names(front)).toEqual(["A3<", "A3>"]);
    const singles = position({ 2: 1, 5: 1, 12: 5, 9: 2 }, { 0: 1 });
    expect(names(singles)).toEqual(["B4<", "B4>", "B7<", "B7>"]);
    const kichwa = position({ 0: 3 }, { 0: 1 });
    expect(names(kichwa)).toEqual(["A1>"]);
    // Namua without a working nyumba: pits of 2+ only, while there are any.
    const namua = position({ 1: 1, 3: 3 }, { 0: 1 }, [3, 3]);
    expect(names(namua)).toEqual(["A4<", "A4>"]);
  });

  it("nyumba: taxed when it is the only front pit, stops a takasa, offers safari after a capture", () => {
    // Only the nyumba occupied: it is taxed (2 seeds sown) and stays a nyumba.
    const only = position({ 4: 8 }, { 0: 1 }, [4, 4], [true, true]);
    expect(names(only)).toEqual(["A5<", "A5>"]);
    const tax = traceMove(only, parseMove("A5>")!);
    expect(tax.steps[1]).toMatchObject({ kind: "tax", k: NYUMBA, hand: 2 });
    expect(tax.final.board[NYUMBA]).toBe(7);
    expect(tax.final.house[0]).toBe(true);
    // With another front pit, a working nyumba may not be played (a singleton is fine).
    const other = position({ 4: 8, 6: 1 }, { 0: 1 }, [4, 4], [true, true]);
    expect(names(other)).toEqual(["A7<", "A7>"]);
    // A takasa whose lap ends in the working nyumba stops there.
    const stop = position({ 4: 8, 2: 1 }, { 0: 1 }, [4, 4], [true, true]);
    const st = traceMove(stop, parseMove("A3>")!);
    expect(st.reason).toBe("nyumba");
    expect(st.final.board[NYUMBA]).toBe(9);
    // A capture whose sowing ends in the nyumba: stop (X) or safari (S).
    const cap = position({ 0: 1, 3: 1, 4: 8 }, { 7: 5, 0: 1 }, [4, 4], [true, true]);
    expect(names(cap)).toEqual(["A1S", "A1X"]);
    const lala = traceMove(cap, parseMove("A1X")!);
    expect(lala.reason).toBe("lala");
    expect(lala.final.house[0]).toBe(true);
    const safari = traceMove(cap, parseMove("A1S")!);
    expect(safari.steps.some((s) => s.kind === "safari")).toBe(true);
    expect(safari.final.house[0]).toBe(false);
    expect(isLegal(cap, parseMove("A1")!)).toBe(false);
    // Capturing the opponent's nyumba ends its powers.
    const raid = position({ 3: 1, 6: 1 }, { 4: 7, 0: 1 }, [4, 4], [true, true]);
    const r = applyMove(raid, parseMove("A4L")!);
    expect(r.board[16 + NYUMBA]).toBe(0);
    expect(r.house[1]).toBe(false);
  });

  it("switches from namua to mtaji when the store is empty", () => {
    let checked = 0;
    randomGames(30, (s, m, plies) => {
      const side = s.turn;
      const after = applyMove(s, m);
      if (plies < 44) {
        expect(s.store[side]).toBe(22 - Math.floor(plies / 2));
        expect(after.store[side]).toBe(s.store[side] - 1);
        expect(m.pit).toBeLessThan(8);
      } else {
        expect(s.store).toEqual([0, 0]);
        expect(m.dir).not.toBe(0);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(0);
  });

  it("kutakatia blocks a single threatened pit for one turn", () => {
    let seen = 0;
    randomGames(150, (s) => {
      if (s.blocked < 0) return;
      seen++;
      expect(mustCapture(s)).toBe(false);
      expect(legalMoves(s).some((m) => m.pit === s.blocked)).toBe(false);
    });
    expect(seen).toBeGreaterThan(0);
  });

  it("ends the game on an empty front row or no move", () => {
    const empty = position({ 2: 2 }, { 9: 2 });
    empty.turn = 1;
    expect(outcome(empty, 50)).toMatchObject({ over: true, winner: 0, detail: "Front row emptied" });
    const stuck = position({ 2: 1, 5: 1, 9: 1, 10: 1 }, { 3: 5 });
    expect(outcome(stuck, 50)).toMatchObject({ over: true, winner: 1, detail: "No moves left" });
    expect(outcome(startState(), 200)).toMatchObject({ over: true, winner: null });
  });

  it("spells every move one way, in at most 4 characters", () => {
    randomGames(40, (s) => {
      for (const m of legalMoves(s)) {
        const t = moveToString(m);
        expect(t.length).toBeLessThanOrEqual(bao.pvp!.maxMoveLength);
        expect(parseMove(t)).toEqual(m);
      }
    });
    expect(parseMove("B1<")).toEqual({ pit: 15, dir: 1, kichwa: -1, nyumba: 0 });
    expect(parseMove("A3RS")).toEqual({ pit: 2, dir: 0, kichwa: 7, nyumba: SAFARI });
    expect(parseMove("A8X")).toEqual({ pit: 7, dir: 0, kichwa: -1, nyumba: STOP });
    for (const junk of ["C3>", "A9>", "a3>", "A3>>", "A", "A3+", ""]) expect(parseMove(junk)).toBeNull();
  });

  it("traces each move step by step, ending on exactly the applyMove state", () => {
    let captures = 0;
    let relays = 0;
    randomGames(80, (s, m) => {
      const t = traceMove(s, m);
      const next = applyMove(s, m);
      expect(t.final).toEqual(next);
      const last = t.steps[t.steps.length - 1];
      expect(last.kind).toBe("end");
      expect(Array.from(last.board)).toEqual(Array.from(next.board));
      expect(last.store).toEqual(next.store);
      for (const step of t.steps) {
        let n = step.store[0] + step.store[1] + step.hand;
        for (const x of step.board) n += x;
        expect(n).toBe(64);
      }
      captures += t.captures;
      relays += t.relays;
    });
    expect(captures).toBeGreaterThan(0);
    expect(relays).toBeGreaterThan(0);
  });

  it("lists the same moves in expand and legalMoves", () => {
    randomGames(20, (s) => {
      expect(expand(s).map((c) => moveToString(c.move))).toEqual(legalMoves(s).map(moveToString));
    });
  });

  describe("against the computer", () => {
    const won = (() => {
      for (let seed = 1; seed < 40; seed++) {
        const g = playGame(seed, 1, 5);
        if (g.result === "win") return { seed, ...g };
      }
      throw new Error("no win found");
    })();

    it("verifies a won game as cleared, and the same seed gives the same game", () => {
      const v = bao.verify({ seed: won.seed, stage: 1, input: won.input, elapsedMs: 600_000 });
      expect(v).toMatchObject({ valid: true, cleared: true, flagged: false });
      expect(v.score).toBeGreaterThan(1000);
      expect(v.score).toBeLessThan(2000);
      expect(playGame(won.seed, 1, 5)).toEqual({ input: won.input, result: won.result });
    });

    it("treats stopping early as a loss and flags inhuman speed", () => {
      const first = won.input.split(" ")[0];
      expect(bao.verify({ seed: won.seed, stage: 1, input: first, elapsedMs: 60_000 })).toMatchObject({ valid: true, cleared: false, score: 0 });
      expect(bao.verify({ seed: 5, stage: 2, input: "", elapsedMs: 60_000 })).toMatchObject({ valid: true, cleared: false, score: 0 });
      expect(bao.verify({ seed: won.seed, stage: 1, input: won.input, elapsedMs: 100 }).flagged).toBe(true);
    });

    it("rejects junk, illegal moves and moves after the end", () => {
      for (const input of ["hello", "A9>", "A6", "a6>", "A6>,A7<", "A5>", "A6>X"]) {
        expect(bao.verify({ seed: 1, stage: 1, input, elapsedMs: 60_000 }).valid).toBe(false);
      }
      expect(bao.verify({ seed: won.seed, stage: 1, input: `${won.input} A6>`, elapsedMs: 600_000 }).valid).toBe(false);
      expect(bao.verify({ seed: 1, stage: 1, input: Array(101).fill("A6>").join(" "), elapsedMs: 600_000 }).valid).toBe(false);
    });

    it("verifies long games at the top stage in well under 200 ms", () => {
      let worst = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const { input } = playGame(seed, 5, seed % 3 === 0 ? 5 : 1);
        const t = performance.now();
        expect(bao.verify({ seed, stage: 5, input, elapsedMs: 600_000 }).valid).toBe(true);
        worst = Math.max(worst, performance.now() - t);
      }
      expect(worst).toBeLessThan(200);
    });
  });

  describe("player vs player", () => {
    /** Two searching players; returns the move list (each in its mover's own notation). */
    function pvpGame(seed: number, stage0: number, stage1: number): string[] {
      const rand = mulberry32(seed);
      const moves: string[] = [];
      let g = replayPvp(moves)!;
      while (!g.over) {
        moves.push(moveToString(computerMove(g.state, g.state.turn === 0 ? stage0 : stage1, rand)!));
        g = replayPvp(moves)!;
      }
      return moves;
    }

    it("replays a full game to the right winner", () => {
      const moves = pvpGame(77, 5, 2);
      const end = replayPvp(moves)!;
      const state = bao.pvp!.replay(77, moves)!;
      expect(state).toMatchObject({ over: true, winner: end.winner });
      expect(end.winner).not.toBeNull();
      expect(outcome(end.state, end.plies).winner).toBe(end.winner);
      expect(bao.pvp!.replay(77, moves.slice(0, -1))).toMatchObject({ over: false, turn: ((moves.length - 1) % 2) as 0 | 1 });
    });

    it("matches the vs-computer game when the same moves are played", () => {
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
      expect(state.winner).toBe(vsComputer.result === "win" ? 0 : vsComputer.result === "loss" ? 1 : null);
    });

    it("returns null for illegal, malformed and after-the-end moves", () => {
      expect(bao.pvp!.replay(1, ["A5>"])).toBeNull(); // the working nyumba while A6 and A7 are there
      expect(bao.pvp!.replay(1, ["A6"])).toBeNull();
      expect(bao.pvp!.replay(1, ["B9>"])).toBeNull();
      expect(bao.pvp!.replay(1, ["a6>"])).toBeNull();
      expect(bao.pvp!.replay(1, [""])).toBeNull();
      expect(bao.pvp!.replay(1, ["A6<", "A5"])).toBeNull(); // a central capture needs its kichwa
      expect(bao.pvp!.replay(1, ["A6<", "A5L"])).not.toBeNull();
      const moves = pvpGame(5, 3, 3);
      expect(replayPvp(moves)!.over).toBe(true);
      expect(bao.pvp!.replay(5, [...moves, "A6>"])).toBeNull();
      expect(bao.pvp!.maxMoveLength).toBe(4);
    });

    it("replays long games quickly", () => {
      let worst = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const moves = pvpGame(seed, 1, 1);
        const t = performance.now();
        expect(bao.pvp!.replay(seed, moves)).not.toBeNull();
        worst = Math.max(worst, performance.now() - t);
      }
      expect(worst).toBeLessThan(200);
    });
  });
});
