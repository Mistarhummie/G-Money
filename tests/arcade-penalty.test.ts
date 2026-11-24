import { describe, expect, it } from "vitest";
import {
  canDive, canKick, commitment, cpuKick, decided, dive, encodeInput, kick, KEEPER_X, keeperAt, newGame, penalty, placement, pvpError,
  replayMatch, STAGES, swayAt, tick, TICK_MS, zoneOf, type Action,
} from "@/lib/games/arcade/penalty";

/** A bot: shoots low into the corner away from its last kick when the sway is small, and dives a few ticks after the strike. */
function play(seed: number, stage: number, react = 14) {
  const s = newGame(seed, stage);
  const actions: Action[] = [];
  let t = 0;
  let side = 1;
  while (s.alive && t < 60_000) {
    t++;
    tick(s);
    if (canKick(s)) {
      const { dx, dy } = swayAt(s, s.ticks);
      if (Math.abs(dx) + Math.abs(dy) < 6) {
        side = -side;
        const x = side < 0 ? 75 : 657;
        kick(s, x, 60);
        actions.push({ tick: t, a: "K", x, y: 60 });
      }
    }
    if (canDive(s) && s.ticks >= s.strikeAt + react) {
      const [x, y] = cpuKick(s);
      const dx = Math.max(0, Math.min(732, x));
      const dy = Math.max(0, Math.min(244, y));
      dive(s, dx, dy);
      actions.push({ tick: t, a: "D", x: dx, y: dy });
    }
  }
  return { s, actions, end: t, input: encodeInput(actions, t) };
}

describe("penalty", () => {
  it("places shots: in, post, wide, over", () => {
    expect(placement(366, 100)).toBe("in");
    expect(placement(2, 100)).toBe("post");
    expect(placement(366, 246)).toBe("post");
    expect(placement(-40, 100)).toBe("wide");
    expect(placement(366, 300)).toBe("over");
  });

  it("decides shootouts like the real thing", () => {
    expect(decided(3, 0, 3, 3)).toBe(true);
    expect(decided(3, 1, 3, 3)).toBe(false);
    expect(decided(4, 4, 5, 5)).toBe(false);
    expect(decided(5, 4, 5, 5)).toBe(true);
    expect(decided(6, 5, 6, 6)).toBe(true);
    expect(decided(6, 5, 6, 5)).toBe(false);
  });

  it("the keeper's dive is limited by speed", () => {
    expect(keeperAt(KEEPER_X + 1000, 90, 10)[0]).toBeCloseTo(KEEPER_X + 180);
  });

  it("a quick, accurate player can win every stage, and the replay agrees", () => {
    for (let stage = 1; stage <= STAGES.length; stage++) {
      let won = 0;
      for (const seed of [1, 2, 3]) {
        const g = play(seed, stage);
        const v = penalty.verify({ seed, stage, input: g.input, elapsedMs: g.end * TICK_MS + 500 });
        expect(v.valid).toBe(true);
        expect(v.score).toBe(g.s.score);
        if (v.cleared) won++;
        console.log(`penalty stage ${stage} seed ${seed}: ${v.detail} ${v.cleared ? "won" : ""}`);
      }
      expect(won).toBeGreaterThan(0);
    }
  });

  it("a slow keeper concedes", () => {
    const g = play(1, 5, 60);
    expect(g.s.cpu).toBeGreaterThan(2);
  });

  it("rejects moves at the wrong time", () => {
    expect(penalty.verify({ seed: 1, stage: 1, input: "1:D:300:100|end:5", elapsedMs: 1e6 }).valid).toBe(false);
    expect(penalty.verify({ seed: 1, stage: 1, input: "1:K:300:100,2:K:300:100|end:5", elapsedMs: 1e6 }).valid).toBe(false);
  });
});

describe("penalty, two players", () => {
  const secret = (n: number) => n.toString(16).padStart(16, "0");
  it("keeps the keeper's choice hidden until revealed, and checks it", () => {
    const c = commitment(0, secret(1));
    expect(replayMatch(1, [`c:${c}`, "k:100:50", `r:1:${secret(1)}`])).toBeNull(); // revealed a different zone
    const m = replayMatch(1, [`c:${c}`, "k:100:50", `r:0:${secret(1)}`])!;
    expect(m.kicks).toHaveLength(1);
    expect(m.kicker).toBe(1);
    expect(m.keeper).toBe(0);
  });

  it("saves when the keeper picks the ball's zone, swaps roles, and ends 3–0", () => {
    const moves: string[] = [];
    let saves = 0;
    for (let k = 0; k < 6; k++) {
      const sec = secret(100 + k);
      const { dx, dy } = pvpError(sec);
      // Side 0 shoots safe into the low centre-left; side 1 keeps... side 1 always shoots at the keeper's zone.
      const aim = k % 2 === 0 ? [140, 60] : [366, 60];
      const landZone = zoneOf(aim[0] + dx, Math.max(0, aim[1] + dy));
      const zone = k % 2 === 0 ? (landZone + 1) % 3 : landZone;
      if (k % 2 === 1) saves++;
      moves.push(`c:${commitment(zone, sec)}`, `k:${aim[0]}:${aim[1]}`, `r:${zone}:${sec}`);
    }
    const m = replayMatch(1, moves)!;
    expect(saves).toBe(3);
    expect(m.goals).toEqual([3, 0]);
    expect(m.over).toBe(true);
    expect(m.winner).toBe(0);
    expect(replayMatch(1, [...moves, `c:${commitment(0, secret(9))}`])).toBeNull();
  });
});
