import { describe, expect, it } from "vitest";
import {
  applyShot,
  computerMove,
  encodePlace,
  encodeShot,
  initialState,
  placeCue,
  placementError,
  playComputer,
  legalTargets,
  pool,
  replayPvp,
  shotError,
  simulate,
  type State,
} from "@/lib/games/arcade/pool";

/** Plays a full game where the player uses the computer's own shot logic at `playerStage`. */
function selfPlay(seed: number, stage: number, playerStage: number) {
  let s = initialState(seed);
  const toks: string[] = [];
  while (s.winner === null) {
    if (s.turn === 1) {
      s = playComputer(s, stage, seed);
      continue;
    }
    if (s.isBreak) {
      toks.push(encodePlace(635, 2100));
      s = placeCue(s, 635, 2100) as State;
      const shot = { tx: 635, ty: 635, power: 100 };
      toks.push(encodeShot(shot));
      s = applyShot(s, shot, false).state;
      continue;
    }
    const mv = computerMove(s, playerStage, seed + 77);
    if (mv.place) {
      toks.push(encodePlace(mv.place[0], mv.place[1]));
      s = placeCue(s, mv.place[0], mv.place[1]) as State;
    }
    toks.push(encodeShot(mv.shot));
    s = applyShot(s, mv.shot, false).state;
  }
  return { state: s, input: toks.join(";") };
}

/** A clumsy but honest player: random placements and random full-power shots. */
function randomPlay(seed: number, stage: number) {
  let s = initialState(seed);
  const toks: string[] = [];
  let a = seed * 99 + 1;
  const rnd = () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
  while (s.winner === null) {
    if (s.turn === 1) {
      s = playComputer(s, stage, seed);
      continue;
    }
    if (s.ballInHand) {
      let x = 0;
      let y = 0;
      do {
        x = 100 + Math.floor(rnd() * 1000);
        y = s.isBreak ? 1950 + Math.floor(rnd() * 500) : 100 + Math.floor(rnd() * 2300);
      } while (placementError(s, x, y));
      toks.push(encodePlace(x, y));
      s = placeCue(s, x, y) as State;
    }
    const shot = { tx: Math.floor(rnd() * 1270), ty: Math.floor(rnd() * 2540), power: 100 };
    if (shotError(s, shot)) continue;
    toks.push(encodeShot(shot));
    s = applyShot(s, shot, false).state;
  }
  return { state: s, input: toks.join(";") };
}

describe("pool", () => {
  it("racks the same way for the same seed", () => {
    expect(initialState(42)).toEqual(initialState(42));
    expect(initialState(42).balls).not.toEqual(initialState(43).balls);
    const s = initialState(42);
    // The 8 sits in the middle of the third row; the back corners hold one solid and one stripe.
    expect(s.balls[8].x).toBe(635);
    const back = s.balls.map((b, i) => ({ b, i })).filter(({ b }) => b.y < 450 && Math.abs(b.x - 635) > 100);
    expect(back.map(({ i }) => (i < 8 ? "solid" : "stripe")).sort()).toEqual(["solid", "stripe"]);
  });

  it("simulates the same shot identically (golden checksum)", () => {
    const s = placeCue(initialState(1), 600, 2100) as State;
    const a = simulate(s.balls, { tx: 635, ty: 635, power: 100 }, false);
    const b = simulate(s.balls, { tx: 635, ty: 635, power: 100 }, true);
    expect(a.balls).toEqual(b.balls);
    let sum = 0;
    for (const ball of a.balls) sum += ball.on ? ball.x * 3 + ball.y * 7 : 1;
    // Guards against accidental changes to the physics (which would break old replays).
    expect(sum).toMatchInlineSnapshot(`93212.62841229906`);
  });

  it("verifies an honest won game as cleared", () => {
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const { state, input } = selfPlay(seed, 1, 5);
      if (state.winner !== 0) continue;
      found = true;
      const v = pool.verify({ seed, stage: 1, input, elapsedMs: 10 * 60 * 1000 });
      expect(v.valid).toBe(true);
      expect(v.cleared).toBe(true);
      expect(v.score).toBeGreaterThanOrEqual(1000);
      expect(v.score).toBeLessThan(2000);
      expect(v.flagged).toBe(false);
      // Too fast (more than one shot per second) is flagged.
      expect(pool.verify({ seed, stage: 1, input, elapsedMs: 1000 }).flagged).toBe(true);
    }
    expect(found).toBe(true);
  });

  it("verifies a lost game and a resignation as valid losses", () => {
    const { state, input } = selfPlay(3, 5, 1);
    const v = pool.verify({ seed: 3, stage: 5, input, elapsedMs: 600000 });
    expect(v.valid).toBe(true);
    expect(v.cleared).toBe(state.winner === 0);
    expect(pool.verify({ seed: 3, stage: 5, input: "", elapsedMs: 5000 })).toMatchObject({ valid: true, cleared: false, score: 0 });
    const firstTwo = input.split(";").slice(0, 2).join(";");
    expect(pool.verify({ seed: 3, stage: 5, input: firstTwo, elapsedMs: 60000 })).toMatchObject({ valid: true, cleared: false, score: 0 });
  });

  it("rejects junk and illegal input", () => {
    const v = (input: string) => pool.verify({ seed: 9, stage: 2, input, elapsedMs: 600000 });
    expect(v("hello").valid).toBe(false);
    expect(v("s:635,635").valid).toBe(false);
    expect(v("s:635,635,50").valid).toBe(false); // must place the cue ball for the break
    expect(v("p:635,1000;s:635,635,50").valid).toBe(false); // break placement must be behind the line
    expect(v("p:635,2100;s:635,635,101").valid).toBe(false);
    expect(v("p:635,2100;s:635,635,0").valid).toBe(false);
    expect(v("p:635,2100;p:635,2100").valid).toBe(false);
    expect(v("p:635,2100;s:635,2100,50").valid).toBe(false); // aiming at the cue ball itself
    expect(v("p:635,2100;s:635,635,50").valid).toBe(true);
    const { input } = selfPlay(4, 2, 3);
    expect(v(input + ";s:1,1,50").valid).toBe(false); // moves after the game ended
  });

  it("verifies worst-case games quickly", () => {
    let worst = 0;
    for (const stage of [1, 5]) {
      for (let seed = 1; seed <= 6; seed++) {
        const { input } = randomPlay(seed, stage);
        const t0 = performance.now();
        const v = pool.verify({ seed, stage, input, elapsedMs: 600000 });
        worst = Math.max(worst, performance.now() - t0);
        expect(v.valid).toBe(true);
      }
    }
    // Upper bound: 120 full-power breaks (the longest kind of shot) in one replay.
    const s = placeCue(initialState(5), 635, 2100) as State;
    const t0 = performance.now();
    for (let k = 0; k < 120; k++) simulate(s.balls, { tx: 635 + (k % 7), ty: 635, power: 100 }, false);
    worst = Math.max(worst, performance.now() - t0);
    expect(worst).toBeLessThan(3000);
  });

  describe("two players", () => {
    /** Two honest players: side 0 uses the strong shot logic, side 1 the weak one. One element per visit. */
    function pvpGame(seed: number) {
      let s = initialState(seed);
      const moves: string[] = [];
      while (s.winner === null) {
        const mv = s.isBreak ? { place: [635, 2100] as [number, number], shot: { tx: 635, ty: 635, power: 100 } } : computerMove(s, s.turn === 0 ? 5 : 1, seed + s.turn);
        let move = "";
        if (mv.place) {
          move = encodePlace(mv.place[0], mv.place[1]) + ";";
          s = placeCue(s, mv.place[0], mv.place[1]) as State;
        }
        moves.push(move + encodeShot(mv.shot));
        s = applyShot(s, mv.shot, false).state;
      }
      return { state: s, moves };
    }

    it("replays a legal game to the right winner, with the right side to move", () => {
      const { state, moves } = pvpGame(11);
      const end = pool.pvp!.replay(11, moves);
      expect(end).not.toBeNull();
      expect(end!.over).toBe(true);
      expect(end!.winner).toBe(state.winner === -1 ? null : state.winner);
      for (const n of [0, 1, 2, 5]) {
        const mid = pool.pvp!.replay(11, moves.slice(0, n));
        expect(mid).toMatchObject({ over: false, turn: replayPvp(11, moves.slice(0, n))!.turn });
      }
      expect(pool.pvp!.replay(11, [])).toMatchObject({ turn: 0, over: false });
    });

    it("rejects illegal moves and moves after the end", () => {
      const r = (moves: string[]) => pool.pvp!.replay(11, moves);
      expect(r(["s:635,635,100"])).toBeNull(); // the break needs the cue ball placed first
      expect(r(["p:635,1500;s:635,635,100"])).toBeNull(); // not behind the line
      expect(r(["p:635,2100"])).toBeNull(); // placement without a shot
      expect(r(["p:635,2100;s:635,635,100;s:635,635,50"])).toBeNull(); // two shots in one move
      expect(r(["p:635,2100;s:635,635,0"])).toBeNull();
      expect(r(["hello"])).toBeNull();
      const ok = r(["p:635,2100;s:635,635,100"]);
      expect(ok).not.toBeNull();
      // Placing when you do not have ball in hand is illegal.
      const s1 = replayPvp(11, ["p:635,2100;s:635,635,100"])!;
      if (!s1.ballInHand) expect(r(["p:635,2100;s:635,635,100", "p:600,2000;s:600,600,50"])).toBeNull();
      const { moves } = pvpGame(11);
      expect(r([...moves, "s:600,600,50"])).toBeNull();
      expect(legalTargets(initialState(11)).length).toBe(15);
    });

    it("replays a long game quickly", () => {
      let worst = 0;
      for (let seed = 1; seed <= 5; seed++) {
        let a = seed * 31 + 7;
        const rnd = () => {
          a = (a * 1103515245 + 12345) % 2147483648;
          return a / 2147483648;
        };
        let s = initialState(seed);
        const moves: string[] = [];
        while (s.winner === null) {
          let move = "";
          let st = s;
          if (s.ballInHand) {
            let x = 0;
            let y = 0;
            do {
              x = 100 + Math.floor(rnd() * 1000);
              y = s.isBreak ? 1950 + Math.floor(rnd() * 500) : 100 + Math.floor(rnd() * 2300);
            } while (placementError(s, x, y));
            move = encodePlace(x, y) + ";";
            st = placeCue(s, x, y) as State;
          }
          const tg = legalTargets(st);
          const b = st.balls[tg[Math.floor(rnd() * tg.length)]];
          const shot = { tx: Math.round(b.x + (rnd() - 0.5) * 60), ty: Math.round(b.y + (rnd() - 0.5) * 60), power: 60 + Math.floor(rnd() * 41) };
          if (shotError(st, shot)) continue;
          moves.push(move + encodeShot(shot));
          s = applyShot(st, shot, false).state;
        }
        const t0 = performance.now();
        expect(pool.pvp!.replay(seed, moves)).not.toBeNull();
        worst = Math.max(worst, performance.now() - t0);
      }
      expect(worst).toBeLessThan(200);
    });
  });
});
