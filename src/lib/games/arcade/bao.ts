import { mulberry32, randInt, tooFast } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * Bao la Kiswahili: the full Bao of the Swahili coast (Zanzibar, Tanzania, Kenya), played on the
 * carved 4 x 8 board with a square nyumba (house) in each player's front row.
 *
 * Rule source: Alex de Voogt's tournament rules as written up on Mancala World ("Bao la Kiswahili"
 * and its rules quiz, which cite de Voogt 1995 and Kronenburg et al. 2006), checked against Wikipedia's
 * "Bao (game)". Where the write-ups differ we follow de Voogt as reported on Mancala World:
 *  - the nyumba's special powers (tax, a non-capturing sowing stopping in it, stop-or-safari) belong
 *    to the namua stage; in the mtaji stage the nyumba sows like any pit (Mancala World: "the player
 *    must safari" in mtaji), though it still cannot be takasiaed;
 *  - kimbi = the two end pits at each end of the front row (A1, A2 and A7, A8);
 *  - kutakatia (takasia) is applied as written there, in both stages (in practice it can only happen
 *    once someone is in the mtaji stage: in namua a threat always gives the other side a capture too).
 *
 * BOARD. Each player owns two rows of 8 pits: the front (inner) row A1..A8 facing the opponent and
 * the back (outer) row B1..B8, both numbered from that player's own left. A1 and A8 are the kichwa
 * (heads); A1, A2, A7, A8 are the kimbi. A5 is the nyumba (point-symmetric: the two nyumba are not
 * opposite each other). Each player starts with 32 seeds: 6 in the nyumba, 2 in A6 and 2 in A7, and
 * 22 in the store (in hand).
 *
 * NAMUA STAGE (while you still have seeds in your store). Each turn you put one seed from the store
 * into a non-empty pit of your front row.
 *  - Capture (compulsory when possible): if the pit was occupied and the opponent's pit facing it has
 *    seeds, you take those seeds and sow them from a kichwa: from the left kichwa (going right) if the
 *    capture was in your left kimbi, from the right kichwa (going left) if in your right kimbi,
 *    otherwise from the kichwa of your choice. Your own seeds stay where they are.
 *  - Otherwise (takasa) you lift the pit you added to and sow it in either direction. You may not use
 *    a functional nyumba unless it is your only occupied front pit; then it is taxed: only 2 seeds
 *    are lifted and sown, and it stays a nyumba. Without a functional nyumba you must use a pit with
 *    2+ seeds if there is one.
 * MTAJI STAGE (store empty). Lift any pit with 2 to 15 seeds whose first lap ends in an occupied
 * front pit facing an occupied opponent pit: that is a capture, and you must make one if you can.
 * Otherwise (takasa) lift a front pit with 2+ seeds, or, only if every front pit has 0 or 1 seed, a
 * back pit with 2+ seeds, and sow it either way. A pit of 16+ seeds never captures.
 *
 * SOWING. One seed per pit around your own 16 pits (they form a loop; clockwise runs left to right
 * along your front row). When a lap's last seed falls:
 *  - in an empty pit: the turn ends;
 *  - in a capturing move, in an occupied front pit facing opponent seeds: capture again. The seeds
 *    are sown from a kichwa: a capture in a kimbi uses the kichwa at that end (this can reverse the
 *    direction), otherwise the direction is kept (going right: left kichwa; going left: right kichwa);
 *  - in your functional nyumba during the namua stage: a non-capturing move ends there; a capturing
 *    move lets you stop (lala) or go on (safari), which lifts the house and ends its powers;
 *  - in a takasiaed pit during a non-capturing move: the turn ends (unless the lap is the first one
 *    out of the nyumba);
 *  - in any other occupied pit: lift it and keep sowing the same way (endelea, relay sowing).
 * Non-capturing moves never capture. The front row may never be emptied: a kichwa that is your only
 * occupied front pit must be sown towards the centre.
 *
 * NYUMBA. Functional while it has never been lifted in a lap or captured and holds 6+ seeds (below 6
 * it rests until refilled). Captured or lifted (safari, or sown as an ordinary pit): it is gone for good.
 *
 * KUTAKATIA. After a non-capturing move, if exactly one opponent front pit is under threat and the
 * opponent has no capture, that pit is takasiaed for the opponent's next turn: they may not play it
 * and a sowing of theirs stops when it ends there. A functional nyumba, the opponent's only occupied
 * front pit and their only front pit with 2+ seeds are exempt.
 *
 * WINNING. You lose when your front row is empty or you cannot move. 200 plies is a draw.
 * Endless sowings exist in Bao; a move is cut off at the end of the first lap that brings it to
 * 1000 seeds sown (MAX_SOWN_PER_MOVE), and the turn passes.
 *
 * NOTATION: one string per move, from the mover's own view: pit, then each choice in the order it
 * comes up.
 *   pit        A1-A8 front row, B1-B8 back row, numbered from your left.
 *   direction  ">" sow to your right, "<" to your left (along the row of the pit you lift). Given for
 *              every move except a namua capture (it sows from a kichwa).
 *   kichwa     "L" / "R": which kichwa a namua capture sows from, only when it is your choice.
 *   nyumba     "S" safari (sow on) / "X" stop, only when a namua capture ends in your nyumba.
 * Examples: "A6>" (namua takasa), "A4L" (capture from A4, sow from the left kichwa), "A2" (kimbi
 * capture), "A3RS" (capture, right kichwa, then safari), "B6<" (mtaji move). Exactly the choices that
 * arise must be given, so every move has one spelling. The vs-computer input is the player's moves
 * separated by spaces, e.g. "A6> A3L A5<". The computer's replies are replayed by the server.
 */

// ---- Board and state --------------------------------------------------------------------------

/**
 * 32 counts. Side s (0 = player / first mover, 1 = computer / second) owns s*16 .. s*16+15 in loop
 * order: k = 0..7 is the front row A1..A8, k = 8..15 is the back row B8..B1. Clockwise is k+1.
 * Front pit k faces the opponent's front pit 7-k.
 */
export type Board = Uint8Array;
export type Side = 0 | 1;

export type State = {
  board: Board;
  /** Seeds in each player's store (in hand). */
  store: [number, number];
  /** Each player's nyumba still has its powers (never lifted in a lap, never captured). */
  house: [boolean, boolean];
  /** Front pit k of the side to move that is takasiaed this turn, or -1. */
  blocked: number;
  turn: Side;
};

/**
 * A move of the side to move. `dir` is +1 (clockwise) or -1, or 0 for a namua capture. `kichwa` is
 * the chosen kichwa (0 = left, 7 = right) or -1 when there is no choice; `nyumba` is 0 (no choice),
 * SAFARI or STOP.
 */
export type Move = { pit: number; dir: -1 | 0 | 1; kichwa: -1 | 0 | 7; nyumba: 0 | 1 | 2 };
export const SAFARI = 1;
export const STOP = 2;

export const NYUMBA = 4;
export const SEEDS_EACH = 32;
export const STORE_START = 22;
export const MAX_SOWN_PER_MOVE = 1000;
export const MAX_PLIES = 200;

export function startState(): State {
  const board = new Uint8Array(32);
  for (const s of [0, 16]) {
    board[s + NYUMBA] = 6;
    board[s + 5] = 2;
    board[s + 6] = 2;
  }
  return { board, store: [STORE_START, STORE_START], house: [true, true], blocked: -1, turn: 0 };
}

export const cloneState = (s: State): State => ({
  board: s.board.slice(),
  store: [s.store[0], s.store[1]],
  house: [s.house[0], s.house[1]],
  blocked: s.blocked,
  turn: s.turn,
});

/** Seeds a side owns: on its 16 pits plus its store. */
export function seedsOf(s: State, side: Side): number {
  let n = s.store[side];
  for (let k = 0; k < 16; k++) n += s.board[side * 16 + k];
  return n;
}

export const inNamua = (s: State, side: Side) => s.store[side] > 0;
/** The nyumba of `side` is functional now: never lifted or captured, and holding 6+ seeds. */
export const houseWorks = (s: State, side: Side) => s.house[side] && s.board[side * 16 + NYUMBA] >= 6;

function frontEmpty(b: Board, side: number): boolean {
  const base = side * 16;
  for (let k = 0; k < 8; k++) if (b[base + k]) return false;
  return true;
}

// ---- Notation ---------------------------------------------------------------------------------

export const pitName = (k: number) => (k < 8 ? `A${k + 1}` : `B${16 - k}`);
export function pitFromName(row: "A" | "B", n: number): number {
  return row === "A" ? n - 1 : 16 - n;
}
/** Loop direction for "sow to my right" / "to my left" from pit k: right is clockwise on the front row only. */
export const dirFor = (k: number, screen: "left" | "right"): 1 | -1 => ((k < 8) === (screen === "right") ? 1 : -1);
const screenOf = (k: number, dir: number) => ((k < 8) === (dir === 1) ? ">" : "<");

export function moveToString(m: Move): string {
  return (
    pitName(m.pit) +
    (m.dir ? screenOf(m.pit, m.dir) : "") +
    (m.kichwa === 0 ? "L" : m.kichwa === 7 ? "R" : "") +
    (m.nyumba === SAFARI ? "S" : m.nyumba === STOP ? "X" : "")
  );
}

export function parseMove(token: string): Move | null {
  const t = /^([AB])([1-8])([<>]?)([LR]?)([SX]?)$/.exec(token);
  if (!t) return null;
  const pit = pitFromName(t[1] as "A" | "B", Number(t[2]));
  return {
    pit,
    dir: t[3] ? dirFor(pit, t[3] === ">" ? "right" : "left") : 0,
    kichwa: t[4] === "L" ? 0 : t[4] === "R" ? 7 : -1,
    nyumba: t[5] === "S" ? SAFARI : t[5] === "X" ? STOP : 0,
  };
}

export const sameMove = (a: Move, b: Move) => a.pit === b.pit && a.dir === b.dir && a.kichwa === b.kichwa && a.nyumba === b.nyumba;

// ---- Playing a move ---------------------------------------------------------------------------

/** Why a move ended. */
export type EndReason = "empty" | "nyumba" | "lala" | "blocked" | "limit";

/**
 * One step of a move, for the board to animate. `side`/`k` name the pit involved; `hand` is the seeds
 * in hand after the step; `board` and `store` are as they stand after it.
 *  place    a seed goes from the store into pit k (namua)
 *  lift     pit k is lifted into the hand (the start, or a relay)
 *  tax      2 seeds are lifted from the nyumba, which stays
 *  capture  the opponent's pit k is taken into the hand
 *  kichwa   the hand moves to kichwa k to sow captured seeds in `dir` (`chosen`: the player picked it)
 *  sow      one seed is dropped in pit k
 *  safari   the sowing goes on out of the nyumba (its powers end)
 *  end      the move is over (`reason`)
 */
export type Step = {
  kind: "place" | "lift" | "tax" | "capture" | "kichwa" | "sow" | "safari" | "end";
  side: Side;
  k: number;
  hand: number;
  board: Board;
  store: [number, number];
  dir?: 1 | -1;
  /** The hand is carrying seeds captured from the opponent. */
  captured?: boolean;
  chosen?: boolean;
  reason?: EndReason;
};

type RunResult = {
  state: State;
  capturing: boolean;
  captured: number;
  captures: number;
  sown: number;
  reason: EndReason;
};

/** Returned by `run` when the move reaches a choice it does not make. */
const NEEDS_CHOICE = 1;

/**
 * Plays `m` for the side to move (assumed legal apart from the nyumba choice). The new state's turn is
 * flipped; `blocked` is filled in by `applyMove`. With `rec`, every step is recorded.
 */
function run(s: State, m: Move, rec: Step[] | null): RunResult | typeof NEEDS_CHOICE {
  const side = s.turn;
  const opp = (1 - side) as Side;
  const base = side * 16;
  const obase = opp * 16;
  const b = s.board.slice();
  const store: [number, number] = [s.store[0], s.store[1]];
  const house: [boolean, boolean] = [s.house[0], s.house[1]];
  const namua = store[side] > 0;
  let hand = 0;
  let sown = 0;
  let captured = 0;
  let captures = 0;
  let carrying = false;
  let pos = m.pit;
  let dir = 0;

  const log = (kind: Step["kind"], who: Side, k: number, extra?: Partial<Step>) => {
    if (rec) rec.push({ kind, side: who, k, hand, board: b.slice(), store: [store[0], store[1]], ...extra });
  };
  /** Sows the hand, first seed into `start`, going `d`. Leaves `pos` on the last pit. */
  const sowLap = (start: number, d: number) => {
    pos = start;
    dir = d;
    for (;;) {
      b[base + pos]++;
      hand--;
      sown++;
      if (rec) log("sow", side, pos, { dir: d as 1 | -1, captured: carrying && hand > 0 });
      if (!hand) break;
      pos = (pos + d) & 15;
    }
    carrying = false;
  };
  const lift = (k: number) => {
    hand = b[base + k];
    b[base + k] = 0;
    if (k === NYUMBA) house[side] = false;
    log("lift", side, k);
  };

  let capturing: boolean;
  let fromNyumba = false;
  if (namua) {
    store[side]--;
    b[base + m.pit]++;
    log("place", side, m.pit);
    capturing = m.pit < 8 && b[base + m.pit] >= 2 && b[obase + 7 - m.pit] > 0;
    if (!capturing) {
      fromNyumba = m.pit === NYUMBA;
      if (fromNyumba && house[side] && b[base + NYUMBA] - 1 >= 6) {
        hand = 2;
        b[base + NYUMBA] -= 2;
        log("tax", side, NYUMBA);
      } else lift(m.pit);
      sowLap((m.pit + m.dir) & 15, m.dir);
    }
  } else {
    const n = b[base + m.pit];
    fromNyumba = m.pit === NYUMBA;
    lift(m.pit);
    sowLap((m.pit + m.dir) & 15, m.dir);
    capturing = n < 16 && pos < 8 && b[base + pos] >= 2 && b[obase + 7 - pos] > 0;
  }

  let firstLap = true;
  let reason: EndReason;
  for (;;) {
    if (b[base + pos] === 1) {
      reason = "empty";
      break;
    }
    if (capturing && pos < 8 && b[obase + 7 - pos] > 0) {
      const t = 7 - pos;
      hand = b[obase + t];
      b[obase + t] = 0;
      captured += hand;
      captures++;
      if (t === NYUMBA) house[opp] = false;
      carrying = true;
      log("capture", opp, t, { captured: true });
      let kk: number;
      let d: number;
      let chosen = false;
      if (pos <= 1) [kk, d] = [0, 1];
      else if (pos >= 6) [kk, d] = [7, -1];
      else if (dir === 0) {
        if (m.kichwa < 0) return NEEDS_CHOICE;
        kk = m.kichwa;
        d = kk === 0 ? 1 : -1;
        chosen = true;
      } else [kk, d] = [dir === 1 ? 0 : 7, dir];
      log("kichwa", side, kk, { dir: d as 1 | -1, captured: true, chosen });
      sowLap(kk, d);
      firstLap = false;
      if (sown >= MAX_SOWN_PER_MOVE) {
        reason = "limit";
        break;
      }
      continue;
    }
    if (namua && pos === NYUMBA && house[side] && b[base + NYUMBA] - 1 >= 6) {
      if (!capturing) {
        reason = "nyumba";
        break;
      }
      if (!m.nyumba) return NEEDS_CHOICE;
      if (m.nyumba === STOP) {
        reason = "lala";
        break;
      }
      log("safari", side, NYUMBA);
    }
    if (!capturing && pos === s.blocked && !(firstLap && fromNyumba)) {
      reason = "blocked";
      break;
    }
    if (sown >= MAX_SOWN_PER_MOVE) {
      reason = "limit";
      break;
    }
    lift(pos);
    sowLap((pos + dir) & 15, dir);
    firstLap = false;
  }
  log("end", side, pos, { reason });
  return {
    state: { board: b, store, house, blocked: -1, turn: opp },
    capturing,
    captured,
    captures,
    sown,
    reason,
  };
}

/**
 * Bit t set = the opponent's front pit t could be captured by `side` if it were to move now (in the
 * stage it is in).
 */
function captureTargets(b: Board, side: number, namua: boolean): number {
  const base = side * 16;
  const obase = (1 - side) * 16;
  let mask = 0;
  if (namua) {
    for (let k = 0; k < 8; k++) if (b[base + k] && b[obase + 7 - k]) mask |= 1 << (7 - k);
    return mask;
  }
  for (let k = 0; k < 16; k++) {
    const n = b[base + k];
    if (n < 2 || n > 15) continue;
    for (let d = -1; d <= 1; d += 2) {
      const land = (k + d * n) & 15;
      if (land < 8 && b[base + land] && b[obase + 7 - land]) mask |= 1 << (7 - land);
    }
  }
  return mask;
}

/** The kutakatia rule: the pit of the side now to move that the last (non-capturing) move takasiaed, or -1. */
function takasiaed(s: State): number {
  const q = s.turn;
  const p = 1 - q;
  const b = s.board;
  if (captureTargets(b, q, s.store[q] > 0)) return -1;
  const mask = captureTargets(b, p, s.store[p] > 0);
  if (!mask || mask & (mask - 1)) return -1; // none, or more than one pit threatened
  const t = 31 - Math.clz32(mask);
  if (t === NYUMBA && houseWorks(s, q)) return -1;
  const base = q * 16;
  let occupied = 0;
  let big = 0;
  for (let k = 0; k < 8; k++) {
    if (b[base + k]) occupied++;
    if (b[base + k] > 1) big++;
  }
  if (occupied === 1) return -1;
  if (big === 1 && b[base + t] > 1) return -1;
  return t;
}

/** Plays a legal move; returns the new state (the input is not changed). */
export function applyMove(s: State, m: Move): State {
  const r = run(s, m, null);
  if (r === NEEDS_CHOICE) throw new Error("Bao move is missing a choice");
  if (!r.capturing) r.state.blocked = takasiaed(r.state);
  return r.state;
}

export type Trace = {
  steps: Step[];
  final: State;
  capturing: boolean;
  captured: number;
  captures: number;
  sown: number;
  /** Times the hand picked a pit back up and kept sowing. */
  relays: number;
  reason: EndReason;
};

/**
 * Plays a legal move step by step for the board to animate. Uses the same code as `applyMove`, so
 * `final` is always exactly the state `applyMove` gives.
 */
export function traceMove(s: State, m: Move): Trace {
  const steps: Step[] = [];
  const r = run(s, m, steps);
  if (r === NEEDS_CHOICE) throw new Error("Bao move is missing a choice");
  if (!r.capturing) r.state.blocked = takasiaed(r.state);
  const firstSow = steps.findIndex((st) => st.kind === "sow");
  const relays = steps.filter((st, i) => st.kind === "lift" && i > firstSow).length;
  return { steps, final: r.state, capturing: r.capturing, captured: r.captured, captures: r.captures, sown: r.sown, relays, reason: r.reason };
}

// ---- Legal moves ------------------------------------------------------------------------------

/** Moves that start sowing from a pit (takasa, or any mtaji move), before the nyumba choice. */
function startMoves(s: State): Move[] {
  const side = s.turn;
  const base = side * 16;
  const b = s.board;
  const out: Move[] = [];
  const push = (k: number) => {
    // The front row may never be emptied: an only occupied kichwa sows towards the centre.
    let others = 0;
    for (let j = 0; j < 8; j++) if (j !== k && b[base + j]) others++;
    const taxed = inNamua(s, side) && k === NYUMBA && houseWorks(s, side);
    for (const d of [1, -1] as const) {
      if (k < 8 && !others && !taxed && ((k === 0 && d === -1) || (k === 7 && d === 1))) continue;
      out.push({ pit: k, dir: d, kichwa: -1, nyumba: 0 });
    }
  };
  if (inNamua(s, side)) {
    const works = houseWorks(s, side);
    const pits: number[] = [];
    for (let k = 0; k < 8; k++) {
      if (!b[base + k] || k === s.blocked) continue;
      if (works && k === NYUMBA) continue;
      pits.push(k);
    }
    if (works) {
      if (!pits.length && b[base + NYUMBA]) pits.push(NYUMBA);
      for (const k of pits) push(k);
    } else {
      const big = pits.filter((k) => b[base + k] >= 2);
      for (const k of big.length ? big : pits) push(k);
    }
    return out;
  }
  // Mtaji takasa: a front pit with 2+ seeds, else a back pit with 2+.
  for (let k = 0; k < 8; k++) if (b[base + k] >= 2 && k !== s.blocked) push(k);
  if (!out.length) for (let k = 8; k < 16; k++) if (b[base + k] >= 2) push(k);
  return out;
}

/** Capturing moves, before the nyumba choice. */
function captureMoves(s: State): Move[] {
  const side = s.turn;
  const base = side * 16;
  const obase = (1 - side) * 16;
  const b = s.board;
  const out: Move[] = [];
  if (inNamua(s, side)) {
    for (let k = 0; k < 8; k++) {
      if (!b[base + k] || !b[obase + 7 - k]) continue;
      if (k <= 1 || k >= 6) out.push({ pit: k, dir: 0, kichwa: -1, nyumba: 0 });
      else {
        out.push({ pit: k, dir: 0, kichwa: 0, nyumba: 0 });
        out.push({ pit: k, dir: 0, kichwa: 7, nyumba: 0 });
      }
    }
    return out;
  }
  for (let k = 0; k < 16; k++) {
    const n = b[base + k];
    if (n < 2 || n > 15) continue;
    for (const d of [1, -1] as const) {
      const land = (k + d * n) & 15;
      if (land < 8 && b[base + land] && b[obase + 7 - land]) out.push({ pit: k, dir: d, kichwa: -1, nyumba: 0 });
    }
  }
  return out;
}

/** A legal move and the state it leads to. */
export type Child = { move: Move; next: State; captured: number };

/** Every legal move with its result, in a fixed order. Empty when the side to move has lost. */
export function expand(s: State): Child[] {
  const out: Child[] = [];
  if (frontEmpty(s.board, s.turn)) return out;
  const caps = captureMoves(s);
  for (const m of caps.length ? caps : startMoves(s)) {
    const r = run(s, m, null);
    if (r === NEEDS_CHOICE) {
      for (const ny of [SAFARI, STOP] as const) {
        const mm = { ...m, nyumba: ny };
        const rr = run(s, mm, null) as RunResult;
        out.push({ move: mm, next: rr.state, captured: rr.captured });
      }
    } else {
      if (!r.capturing) r.state.blocked = takasiaed(r.state);
      out.push({ move: m, next: r.state, captured: r.captured });
    }
  }
  return out;
}

/** True when the side to move must capture. */
export const mustCapture = (s: State) => !frontEmpty(s.board, s.turn) && captureMoves(s).length > 0;

/** Every legal move for the side to move, in a fixed order. */
export function legalMoves(s: State): Move[] {
  if (frontEmpty(s.board, s.turn)) return [];
  const caps = captureMoves(s);
  if (!caps.length) return startMoves(s);
  const out: Move[] = [];
  for (const m of caps) {
    if (run(s, m, null) === NEEDS_CHOICE) out.push({ ...m, nyumba: SAFARI }, { ...m, nyumba: STOP });
    else out.push(m);
  }
  return out;
}

export const isLegal = (s: State, m: Move) => legalMoves(s).some((l) => sameMove(l, m));

// ---- Game end ---------------------------------------------------------------------------------

export type Outcome = { over: boolean; winner: Side | null; detail?: string };

/** Where the game stands after `plies` moves, with `s.turn` to move. */
export function outcome(s: State, plies: number): Outcome {
  const q = s.turn;
  const p = (1 - q) as Side;
  if (frontEmpty(s.board, q)) return { over: true, winner: p, detail: "Front row emptied" };
  if (frontEmpty(s.board, p)) return { over: true, winner: q, detail: "Front row emptied" };
  if (!legalMoves(s).length) return { over: true, winner: p, detail: "No moves left" };
  if (plies >= MAX_PLIES) return { over: true, winner: null, detail: "Draw after 200 moves" };
  return { over: false, winner: null };
}

// ---- Computer opponent ------------------------------------------------------------------------

export const STAGES = [
  { depth: 1, mistakes: 0.4, name: "Beginner", goal: "Beat a beginner who often slips up" },
  { depth: 2, mistakes: 0, name: "Novice", goal: "Beat the computer looking 2 moves ahead" },
  { depth: 3, mistakes: 0, name: "Club", goal: "Beat the computer looking 3 moves ahead" },
  { depth: 4, mistakes: 0, name: "Strong", goal: "Beat the computer looking 4 moves ahead" },
  { depth: 5, mistakes: 0, name: "Master", goal: "Beat the computer looking 5 moves ahead" },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];

const WIN = 100_000;
/** Positions searched per computer move at most; deeper iterations stop there, keeping verification fast. */
export const NODE_BUDGET = 20_000;

/** Static score for `side`: seeds owned, seeds in the front row, a working nyumba, and threats. */
function evaluate(s: State, side: Side): number {
  const o = (1 - side) as Side;
  const b = s.board;
  let score = 0;
  for (let k = 0; k < 16; k++) {
    const w = k < 8 ? 12 : 10;
    score += w * (b[side * 16 + k] - b[o * 16 + k]);
  }
  score += 10 * (s.store[side] - s.store[o]);
  if (houseWorks(s, side)) score += 15;
  if (houseWorks(s, o)) score -= 15;
  return score;
}

class OutOfNodes extends Error {}
type Ctx = { nodes: number; limit: number };

function negamax(s: State, depth: number, alpha: number, beta: number, ply: number, ctx: Ctx): number {
  if (depth === 0) return evaluate(s, s.turn);
  if (++ctx.nodes > ctx.limit) throw new OutOfNodes();
  const kids = expand(s);
  if (!kids.length) return -WIN + ply;
  const side = s.turn;
  const keys = kids.map((c) => (frontEmpty(c.next.board, c.next.turn) ? WIN : evaluate(c.next, side)));
  const order = keys.map((_, i) => i).sort((a, b) => keys[b] - keys[a] || a - b);
  let best = -Infinity;
  for (const i of order) {
    const v = keys[i] === WIN ? WIN - ply - 1 : -negamax(kids[i].next, depth - 1, -beta, -alpha, ply + 1, ctx);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * The computer's move for the side to move at this stage. Deterministic: `rand` (the game's seeded
 * RNG) shuffles the move order for tie-breaks and decides the beginner's slips, and is drawn the same
 * number of times every move; the search stops at a fixed node budget (iterative deepening keeps the
 * last finished depth).
 */
export function computerMove(s: State, stage: number, rand: () => number): Move | null {
  const { depth, mistakes } = stageConfig(stage);
  const kids = expand(s);
  if (!kids.length) return null;
  for (let i = kids.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [kids[i], kids[j]] = [kids[j], kids[i]];
  }
  const slip = rand() < mistakes;
  if (slip || kids.length === 1) return kids[0].move;
  const side = s.turn;
  const keys = kids.map((c) => (frontEmpty(c.next.board, c.next.turn) ? WIN : evaluate(c.next, side)));
  let order = keys.map((_, i) => i).sort((a, b) => keys[b] - keys[a] || a - b);
  if (keys[order[0]] === WIN) return kids[order[0]].move;
  let best = order[0];
  const ctx: Ctx = { nodes: 0, limit: NODE_BUDGET };
  for (let d = 1; d <= depth; d++) {
    try {
      let alpha = -Infinity;
      let bestThis = order[0];
      for (const i of order) {
        // Strictly better only, so ties keep the earlier (shuffled) move.
        const v = -negamax(kids[i].next, d - 1, -Infinity, -alpha, 1, ctx);
        if (v > alpha) {
          alpha = v;
          bestThis = i;
        }
      }
      best = bestThis;
      order = [best, ...order.filter((i) => i !== best)];
      if (alpha >= WIN - 100 || alpha <= -WIN + 100) break;
    } catch (e) {
      if (e instanceof OutOfNodes) break;
      throw e;
    }
  }
  return kids[best].move;
}

// ---- Game against the computer ----------------------------------------------------------------

export type Result = "win" | "loss" | "draw" | null; // from the player's view; null = still playing

/** Full game state, replayed the same way in the browser and on the server. The player is side 0. */
export type Game = {
  state: State;
  plies: number;
  playerMoves: number;
  result: Result;
  detail?: string;
  rand: () => number;
  lastComputerMove: Move | null;
  /** The state before the computer's last move (for the board to animate it). */
  beforeComputer: State | null;
};

export function newGame(seed: number): Game {
  return {
    state: startState(),
    plies: 0,
    playerMoves: 0,
    result: null,
    rand: mulberry32(seed ^ 0x6ba0),
    lastComputerMove: null,
    beforeComputer: null,
  };
}

function settle(g: Game) {
  const o = outcome(g.state, g.plies);
  if (!o.over) return;
  g.result = o.winner === null ? "draw" : o.winner === 0 ? "win" : "loss";
  g.detail = o.detail;
}

/** Plays the player's move (returns false if illegal). The computer's reply is a separate step. */
export function playerStep(g: Game, m: Move): boolean {
  if (g.result || g.state.turn !== 0 || !isLegal(g.state, m)) return false;
  g.state = applyMove(g.state, m);
  g.plies++;
  g.playerMoves++;
  settle(g);
  return true;
}

export function computerStep(g: Game, stage: number) {
  if (g.result || g.state.turn !== 1) return;
  const m = computerMove(g.state, stage, g.rand)!;
  g.beforeComputer = g.state;
  g.state = applyMove(g.state, m);
  g.lastComputerMove = m;
  g.plies++;
  settle(g);
}

/**
 * Replays the player's moves from the start (the computer replies after each one). With
 * `awaitingReply`, the computer's reply to the last move is not played yet (the browser adds a short pause).
 * Returns null if a move is illegal or comes after the end of the game.
 */
export function replay(seed: number, stage: number, moves: Move[], awaitingReply = false): Game | null {
  const g = newGame(seed);
  for (let i = 0; i < moves.length; i++) {
    if (g.result || !playerStep(g, moves[i])) return null;
    if (!(awaitingReply && i === moves.length - 1)) computerStep(g, stage);
  }
  return g;
}

export const MAX_HUMAN_MOVES_PER_SECOND = 2;

export function scoreFor(result: Result, stage: number, playerMoves: number): number {
  if (result === "win") return stage * 1000 + Math.max(0, Math.min(999, 999 - 8 * playerMoves));
  if (result === "draw") return stage * 100;
  return 0;
}

// ---- Player vs player -------------------------------------------------------------------------

/** A two-player game after replaying its moves. Each move is in its mover's own notation ("A6>"). */
export type PvpGame = {
  state: State;
  plies: number;
  over: boolean;
  winner: Side | null;
  detail?: string;
  lastMove: Move | null;
  /** The state before the last move (for the board to animate it). */
  before: State | null;
};

export const PVP_MAX_MOVE_LENGTH = 4;

/** Replays a two-player game (side 0 moves first). Null if any move is malformed, illegal or after the end. */
export function replayPvp(moves: string[]): PvpGame | null {
  if (moves.length > MAX_PLIES) return null;
  const g: PvpGame = { state: startState(), plies: 0, over: false, winner: null, lastMove: null, before: null };
  for (const t of moves) {
    if (g.over) return null;
    const m = typeof t === "string" && t.length <= PVP_MAX_MOVE_LENGTH ? parseMove(t) : null;
    if (!m || !isLegal(g.state, m)) return null;
    g.before = g.state;
    g.state = applyMove(g.state, m);
    g.lastMove = m;
    g.plies++;
    const o = outcome(g.state, g.plies);
    g.over = o.over;
    g.winner = o.winner;
    g.detail = o.detail;
  }
  return g;
}

export const bao: ArcadeGame = {
  key: "bao",
  name: "Bao",
  tagline: "Bao la Kiswahili: the Swahili coast's great seed game, with the nyumba and seeds in hand.",
  howToPlay:
    "You own the bottom two rows. Namua: each turn put a seed from your store into a front pit; if the pit already had seeds and faces enemy seeds, you capture them and sow them in from an end pit (you must capture when you can), otherwise you sow that pit around your rows. Mtaji (store empty): sow any pit of 2+ seeds; capture when its last seed lands in an occupied front pit facing enemy seeds. A sowing that ends in an occupied pit keeps going. Your square nyumba is special in namua. Win by emptying the computer's front row or leaving it no move.",
  kind: "versus",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: 30 * 60 * 1000,
  pvp: {
    replay(_seed, moves) {
      // The start position does not depend on the seed.
      const g = replayPvp(moves);
      return g && { turn: g.state.turn, over: g.over, winner: g.winner, detail: g.detail };
    },
    maxMoveLength: PVP_MAX_MOVE_LENGTH,
  },
  verify({ seed, stage, input, elapsedMs }) {
    if (input.length > 600) return invalid("Too many moves");
    const tokens = input.trim() ? input.trim().split(/\s+/) : [];
    if (tokens.length > MAX_PLIES / 2) return invalid("Too many moves");
    const moves: Move[] = [];
    for (const t of tokens) {
      const m = parseMove(t);
      if (!m) return invalid("Invalid move");
      moves.push(m);
    }
    const g = replay(seed, stage, moves);
    if (!g) return invalid("Illegal move");
    // Stopping before the end is giving up: a loss.
    const result: Result = g.result ?? "loss";
    return {
      valid: true,
      cleared: result === "win",
      score: scoreFor(result, stage, g.playerMoves),
      flagged: tooFast(g.playerMoves, elapsedMs, MAX_HUMAN_MOVES_PER_SECOND),
      detail: g.result ? undefined : "Gave up",
    };
  },
};
