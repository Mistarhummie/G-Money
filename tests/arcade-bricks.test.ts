import { describe, expect, it } from "vitest";
import { aim, bricks, encodeInput, launch, newGame, replay, speedAt, RAMP_TICKS, STAGES, tick, TICK_MS, MAX_SPEED, type BricksAction } from "@/lib/games/arcade/bricks";

/** A bot that follows the ball, aiming to hit it with one end of the paddle so it angles across the field. */
function play(seed: number, stage: number, maxTicks = 60_000) {
  const s = newGame(seed, stage);
  const actions: BricksAction[] = [];
  let t = 0;
  let lastX = -1;
  while (s.alive && t < maxTicks) {
    t++;
    if (s.held && t % 40 === 0 && launch(s)) actions.push({ tick: t, a: "L" });
    else if (!s.held) {
      const lean = ((Math.floor(t / 300) % 3) - 1) * (s.paddleW / 3);
      const x = Math.max(0, Math.min(400, Math.round(s.ball.x + lean)));
      if (x !== lastX) {
        aim(s, x);
        actions.push({ tick: t, x });
        lastX = x;
      }
    }
    tick(s);
  }
  return { s, actions, end: t, input: encodeInput(actions, t) };
}

describe("bricks", () => {
  it("speeds up every 15 seconds, up to a cap", () => {
    expect(speedAt(1, 0)).toBe(STAGES[0].speed);
    expect(speedAt(1, RAMP_TICKS)).toBeGreaterThan(speedAt(1, RAMP_TICKS - 1));
    expect(speedAt(5, 10_000_000)).toBe(MAX_SPEED);
  });

  it("a careful player can clear every stage, and the replay agrees exactly", () => {
    for (let stage = 1; stage <= STAGES.length; stage++) {
      let cleared = 0;
      for (const seed of [1, 2, 3]) {
        const g = play(seed, stage);
        const v = bricks.verify({ seed, stage, input: g.input, elapsedMs: g.end * TICK_MS + 1000 });
        expect(v.valid).toBe(true);
        expect(v.score).toBe(g.s.score);
        expect(v.cleared).toBe(g.s.cleared);
        if (g.s.cleared) cleared++;
      }
      console.log(`bricks stage ${stage}: cleared ${cleared}/3`);
      expect(cleared).toBeGreaterThan(0);
    }
  });

  it("doing nothing loses all three balls (the ball launches by itself)", () => {
    const s = newGame(5, 1);
    let t = 0;
    while (s.alive && t < 10_000) {
      t++;
      tick(s);
    }
    expect(s.alive).toBe(false);
    expect(s.cleared).toBe(false);
    expect(s.lives).toBe(0);
    expect(bricks.verify({ seed: 5, stage: 1, input: `|end:${t}`, elapsedMs: t * TICK_MS }).valid).toBe(true);
    expect(bricks.verify({ seed: 5, stage: 1, input: `|end:${t + 1}`, elapsedMs: t * TICK_MS + 100 }).valid).toBe(false);
  });

  it("rejects bad input", () => {
    for (const input of ["", "x|end:5", "1:L", "1:500|end:5", "5:L,3:L|end:9", "1:L|end:999999999"]) {
      expect(bricks.verify({ seed: 1, stage: 1, input, elapsedMs: 1e9 }).valid).toBe(false);
    }
    expect(bricks.verify({ seed: 1, stage: 1, input: "|end:1000", elapsedMs: 1000 }).detail).toBe("Played faster than real time");
    expect(typeof replay(1, 1, [], 10)).toBe("object");
  });
});
