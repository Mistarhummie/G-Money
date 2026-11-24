import { describe, expect, it } from "vitest";
import { encodeInput, MAX_PULL, newGame, ready, shoot, sling, STAGES, tick, TICK_MS, type SlingState, type Shot } from "@/lib/games/arcade/sling";

const clone = (s: SlingState): SlingState => structuredClone(s);

/** Plays out one shot on a copy and returns how many orbs it popped. */
function tryShot(s: SlingState, px: number, py: number) {
  const c = clone(s);
  if (!shoot(c, px, py)) return -1;
  const before = c.orbs.filter((o) => o.popped).length;
  while (c.stone && c.alive) tick(c);
  return c.orbs.filter((o) => o.popped).length - before;
}

/** A bot that tries a grid of pulls each turn and takes the one that pops the most. */
function play(seed: number, stage: number) {
  const s = newGame(seed, stage);
  const shots: Shot[] = [];
  let t = 0;
  while (s.alive && t < 20_000) {
    t++;
    if (ready(s) && t % 25 === 0) {
      let best = { n: -1, px: -80, py: 40 };
      for (let px = -MAX_PULL; px <= -20; px += 6)
        for (let py = -40; py <= MAX_PULL; py += 6) {
          const n = tryShot(s, px, py);
          if (n > best.n) best = { n, px, py };
        }
      shoot(s, best.px, best.py);
      shots.push({ tick: t, px: best.px, py: best.py });
    }
    tick(s);
  }
  return { s, shots, end: t, input: encodeInput(shots, t) };
}

describe("sling", () => {
  it("every stage can be cleared, and the replay agrees exactly", () => {
    for (let stage = 1; stage <= STAGES.length; stage++) {
      let cleared = 0;
      for (const seed of [11, 12]) {
        const g = play(seed, stage);
        const v = sling.verify({ seed, stage, input: g.input, elapsedMs: g.end * TICK_MS + 1000 });
        expect(v.valid).toBe(true);
        expect(v.score).toBe(g.s.score);
        if (v.cleared) cleared++;
        console.log(`sling stage ${stage} seed ${seed}: ${v.detail}, ${v.score} pts`);
      }
      expect(cleared).toBeGreaterThan(0);
    }
  }, 120_000);

  it("runs out of stones without clearing", () => {
    const s = newGame(3, 1);
    const shots: Shot[] = [];
    let t = 0;
    while (s.alive && t < 20_000) {
      t++;
      if (ready(s)) {
        shoot(s, 60, 0); // pulled forwards: throws backwards, off the field
        shots.push({ tick: t, px: 60, py: 0 });
      }
      tick(s);
    }
    expect(s.alive).toBe(false);
    expect(s.cleared).toBe(false);
    expect(sling.verify({ seed: 3, stage: 1, input: encodeInput(shots, t), elapsedMs: t * TICK_MS }).valid).toBe(true);
  });

  it("rejects shots when no stone is ready, and bad input", () => {
    expect(sling.verify({ seed: 1, stage: 1, input: "5:-80:40,6:-80:40|end:50", elapsedMs: 1e6 }).valid).toBe(false);
    expect(sling.verify({ seed: 1, stage: 1, input: "5:-3:2|end:50", elapsedMs: 1e6 }).valid).toBe(false);
    for (const input of ["", "1:2|end:4", "4:-80:40|end:2", "a|end:1"]) expect(sling.verify({ seed: 1, stage: 1, input, elapsedMs: 1e6 }).valid).toBe(false);
  });
});
