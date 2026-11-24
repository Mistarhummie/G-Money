import { describe, expect, it } from "vitest";
import { CX, CY, darts, encodeInput, newGame, ready, scoreAt, STAGES, swayAt, throwDart, tick, TICK_MS, type DartsState, type Throw } from "@/lib/games/arcade/darts";

/** Field point at `r` mm from the centre, `deg` degrees clockwise from the top. */
const at = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)] as const;
};

describe("darts board", () => {
  it("scores every ring and sector like a real board", () => {
    expect(scoreAt(CX, CY).label).toBe("Bull");
    expect(scoreAt(CX + 10, CY).points).toBe(25);
    expect(scoreAt(...at(103, 0)).label).toBe("T20");
    expect(scoreAt(...at(166, 0)).label).toBe("D20");
    expect(scoreAt(...at(130, 18)).label).toBe("1");
    expect(scoreAt(...at(103, 90)).label).toBe("T6");
    expect(scoreAt(...at(103, 180)).label).toBe("T3");
    expect(scoreAt(...at(103, 270)).label).toBe("T11");
    expect(scoreAt(...at(166, 270 + 18)).label).toBe("D14");
    expect(scoreAt(...at(175, 0)).points).toBe(0);
    const order = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    order.forEach((n, k) => expect(scoreAt(...at(130, k * 18 + 4)).base).toBe(n));
  });
});

/** A bot that throws when the sway is near its smallest, aiming at T20 (and at the finish on countdowns). */
function play(seed: number, stage: number) {
  const s = newGame(seed, stage);
  const throws: Throw[] = [];
  const cfg = STAGES[stage - 1];
  const aimFor = (st: DartsState): readonly [number, number] => {
    if (cfg.mode === "countdown") {
      const l = st.left;
      if (l === 50) return [CX, CY];
      if (l <= 40 && l % 2 === 0) {
        const k = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5].indexOf(l / 2);
        return at(166, k * 18);
      }
      if (l < 60) {
        const target = l > 40 ? l - 40 : 1;
        const k = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5].indexOf(Math.min(20, target));
        return at(130, k * 18);
      }
    }
    return at(103, 0);
  };
  let t = 0;
  while (s.alive && t < 50_000) {
    t++;
    tick(s);
    const { dx, dy } = swayAt(s, s.ticks);
    if (ready(s) && Math.abs(dx) + Math.abs(dy) < s.sway * 0.25) {
      const [x, y] = aimFor(s);
      const th = { tick: t, x: Math.round(x - 0), y: Math.round(y) };
      throwDart(s, th.x, th.y);
      throws.push(th);
    }
  }
  return { s, throws, end: t, input: encodeInput(throws, t) };
}

describe("darts", () => {
  it("a steady player can clear each stage, and the replay agrees", () => {
    for (let stage = 1; stage <= STAGES.length; stage++) {
      let cleared = 0;
      for (const seed of [1, 2, 3, 4]) {
        const g = play(seed, stage);
        const v = darts.verify({ seed, stage, input: g.input, elapsedMs: g.end * TICK_MS + 500 });
        expect(v.valid).toBe(true);
        expect(v.score).toBe(g.s.score);
        if (v.cleared) cleared++;
        console.log(`darts stage ${stage} seed ${seed}: ${v.detail} ${v.cleared ? "cleared" : ""}`);
      }
      expect(cleared).toBeGreaterThan(0);
    }
  });

  it("rejects throws before the next dart is ready, and bad input", () => {
    expect(darts.verify({ seed: 1, stage: 1, input: "40:200:100,41:200:100|end:41", elapsedMs: 1e6 }).valid).toBe(false);
    expect(darts.verify({ seed: 1, stage: 1, input: "40:200:100,90:200:100|end:90", elapsedMs: 1e6 }).valid).toBe(true);
    for (const input of ["", "1:2|end:4", "4:900:40|end:5", "a|end:1"]) expect(darts.verify({ seed: 1, stage: 1, input, elapsedMs: 1e6 }).valid).toBe(false);
  });
});
