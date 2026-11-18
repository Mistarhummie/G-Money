/**
 * Ludo rules, as commonly played in Kenya. Pure and shared by the server (which decides everything)
 * and the browser (which replays the server's log to draw and animate the board).
 *
 * Board
 * - 15×15 cross. Four colours clockwise: red (top-left), green (top-right), yellow (bottom-right),
 *   blue (bottom-left). Each colour has a base (yard) with 4 tokens, a start square, a home column
 *   of 5 squares and the home triangle in the centre.
 * - The shared track has 52 squares. Each colour enters on its own start square (red at track 0,
 *   green 13, yellow 26, blue 39), goes once round clockwise (51 squares, progress 0–50), turns
 *   into its home column (progress 51–55) and reaches home at progress 56.
 * - Safe squares: the four start squares and the four star squares (8 squares after each start).
 *   Nobody can be captured on a safe square.
 *
 * Seats
 * - 2 players use opposite corners (red and yellow); 3 players red, green, yellow; 4 players all.
 * - Play goes clockwise. Who starts is drawn by the server when the game begins.
 *
 * A turn
 * - Roll the die. A 6 is needed to bring a token out of base onto the start square.
 * - Move one token forward by the number rolled. Several of your own tokens may share a square;
 *   there are no blocks, so any token can pass any square.
 * - Landing on an opponent's token (on a square that is not safe) sends it back to its base. Every
 *   opponent token on that square is captured.
 * - Reaching home needs the exact number: a roll that would go past home can't move that token.
 * - Extra rolls: a 6, a capture, and getting a token home each give another roll (one extra roll per
 *   move, even if two of these happen at once).
 * - Three 6s in a row in one turn: the third 6 is not played and the turn passes. Moves already made
 *   with the first two 6s stand.
 * - If the roll has no legal move the turn passes, except a 6 which still earns the next roll
 *   (it counts towards the three 6s).
 *
 * The end
 * - The first player to bring all 4 tokens home wins. With 3–4 players the others keep playing for
 *   2nd and 3rd place (the common way in Kenya and in Ludo King's classic mode); the game ends when
 *   only one player is left.
 * - It also ends once every player still racing is a computer (a person has finished, left or been
 *   replaced by the computer for missing turns). The remaining places then go by how far each one's
 *   tokens have got.
 *
 * The log
 * - A game is a list of short actions replayed from the start: "r<1-6>" a roll by the player whose
 *   turn it is, "m<0-3>" moving that token with the current roll, "b<seat>" a seat handed to the
 *   computer. Rolls only ever come from the server. `replay` rejects any log that breaks a rule.
 */

export const COLOUR_NAMES = ["Red", "Green", "Yellow", "Blue"] as const;
export type Colour = 0 | 1 | 2 | 3;

export const TRACK = 52;
/** Last square of the shared track for each colour (progress). */
export const LAST_TRACK = 50;
/** Progress 51–55 is the home column. */
export const HOME_COLUMN = 51;
export const HOME = 56;
export const BASE = -1;
export const TOKENS = 4;

/** Track index of each colour's start square. */
export const startOf = (c: Colour) => c * 13;
/** Start squares and star squares. */
export const SAFE_SQUARES: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const isStar = (sq: number) => SAFE_SQUARES.has(sq) && sq % 13 !== 0;

/** Colours used for 2, 3 and 4 players. */
export function seatColours(n: number): Colour[] {
  if (n === 2) return [0, 2];
  if (n === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

/** Track square of a token, or null while in base, in its home column or home. */
export function trackSquare(c: Colour, progress: number): number | null {
  if (progress < 0 || progress > LAST_TRACK) return null;
  return (startOf(c) + progress) % TRACK;
}

export type LudoSetup = {
  /** Colour of each seat, in turn order. */
  colours: Colour[];
  /** Seats that started with a person. The rest are computers. */
  humans: boolean[];
  /** Seat that rolls first. */
  first: number;
};

export type Capture = { seat: number; token: number; from: number };

export type LudoEvent =
  | { k: "roll"; seat: number; value: number; outcome: "move" | "again" | "pass" | "forfeit" }
  | {
      k: "move";
      seat: number;
      token: number;
      from: number;
      to: number;
      value: number;
      captured: Capture[];
      /** Landed on a safe square that holds someone else's token (saved by the square). */
      safeSave: boolean;
      home: boolean;
      /** The mover gets another roll. */
      again: boolean;
      /** This move brought the player's last token home. */
      finished: boolean;
    }
  | { k: "bot"; seat: number };

export type LudoState = {
  setup: LudoSetup;
  /** tokens[seat][token]: -1 base, 0–50 track, 51–55 home column, 56 home. */
  tokens: number[][];
  /** Seats played by the computer: the computer seats, plus people who left or were replaced. */
  bots: boolean[];
  turn: number;
  phase: "roll" | "move";
  /** The roll waiting to be played (phase "move"). */
  dice: number | null;
  /** 6s rolled in a row in the current turn. */
  sixes: number;
  /** Seats in the order they finished. */
  finished: number[];
  over: boolean;
  /** Final order, best first, once over. */
  places: number[] | null;
  /** Rolls each seat has made. */
  rolls: number[];
  ply: number;
  last: LudoEvent | null;
};

export function newGame(setup: LudoSetup): LudoState {
  const n = setup.colours.length;
  return {
    setup,
    tokens: Array.from({ length: n }, () => Array(TOKENS).fill(BASE)),
    bots: setup.humans.map((h) => !h),
    turn: setup.first,
    phase: "roll",
    dice: null,
    sixes: 0,
    finished: [],
    over: false,
    places: null,
    rolls: Array(n).fill(0),
    ply: 0,
    last: null,
  };
}

/** Where a token ends up with this roll, or null if it can't move. */
export function target(progress: number, roll: number): number | null {
  if (progress === BASE) return roll === 6 ? 0 : null;
  if (progress >= HOME) return null;
  const to = progress + roll;
  return to <= HOME ? to : null;
}

/** Tokens the player to move may move with the current roll. */
export function legalTokens(s: LudoState): number[] {
  if (s.over || s.phase !== "move" || s.dice === null) return [];
  return s.tokens[s.turn].flatMap((p, i) => (target(p, s.dice!) === null ? [] : [i]));
}

/**
 * Legal tokens with duplicates removed: tokens on the same square make the same move, so only the
 * first of them is kept. One entry means there is no real choice.
 */
export function distinctChoices(s: LudoState): number[] {
  const seen = new Set<number>();
  return legalTokens(s).filter((t) => {
    const p = s.tokens[s.turn][t];
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

/** Total distance covered, for ranking players who didn't finish. */
export function distance(tokens: number[]): number {
  return tokens.reduce((sum, p) => sum + (p < 0 ? 0 : p + 1), 0);
}

const allHome = (tokens: number[]) => tokens.every((p) => p === HOME);

function nextSeat(s: LudoState, from: number): number {
  const n = s.tokens.length;
  for (let k = 1; k <= n; k++) {
    const seat = (from + k) % n;
    if (!s.finished.includes(seat)) return seat;
  }
  return from;
}

/** Ends the game when one player is left, or when only computers are still racing at a table with people. */
function checkOver(s: LudoState): LudoState {
  if (s.over) return s;
  const n = s.tokens.length;
  const left = Array.from({ length: n }, (_, i) => i).filter((i) => !s.finished.includes(i));
  const peopleDone = s.setup.humans.some(Boolean) && left.every((i) => s.bots[i]);
  if (left.length > 1 && !peopleDone) return s;
  const rest = [...left].sort((a, b) => distance(s.tokens[b]) - distance(s.tokens[a]) || a - b);
  return { ...s, over: true, places: [...s.finished, ...rest], phase: "roll", dice: null };
}

function passTurn(s: LudoState): LudoState {
  return { ...s, turn: nextSeat(s, s.turn), phase: "roll", dice: null, sixes: 0 };
}

export function roll(s: LudoState, value: number): LudoState | null {
  if (s.over || s.phase !== "roll" || !Number.isInteger(value) || value < 1 || value > 6) return null;
  const seat = s.turn;
  const sixes = value === 6 ? s.sixes + 1 : 0;
  const rolls = s.rolls.map((r, i) => (i === seat ? r + 1 : r));
  const base = { ...s, rolls, ply: s.ply + 1 };
  if (sixes === 3) {
    return { ...passTurn(base), last: { k: "roll", seat, value, outcome: "forfeit" } };
  }
  const withDice: LudoState = { ...base, phase: "move", dice: value, sixes };
  if (legalTokens(withDice).length) return { ...withDice, last: { k: "roll", seat, value, outcome: "move" } };
  if (value === 6) return { ...base, sixes, phase: "roll", dice: null, last: { k: "roll", seat, value, outcome: "again" } };
  return { ...passTurn(base), last: { k: "roll", seat, value, outcome: "pass" } };
}

export function move(s: LudoState, token: number): LudoState | null {
  if (s.over || s.phase !== "move" || s.dice === null) return null;
  if (!legalTokens(s).includes(token)) return null;
  const seat = s.turn;
  const colours = s.setup.colours;
  const from = s.tokens[seat][token];
  const to = target(from, s.dice)!;
  const tokens = s.tokens.map((row) => [...row]);
  tokens[seat][token] = to;

  const captured: Capture[] = [];
  let safeSave = false;
  const sq = trackSquare(colours[seat], to);
  if (sq !== null) {
    tokens.forEach((row, other) => {
      if (other === seat) return;
      row.forEach((p, t) => {
        if (trackSquare(colours[other], p) !== sq) return;
        if (SAFE_SQUARES.has(sq)) safeSave = true;
        else {
          captured.push({ seat: other, token: t, from: p });
          row[t] = BASE;
        }
      });
    });
  }
  const home = to === HOME;
  const finishedNow = allHome(tokens[seat]);
  const finished = finishedNow ? [...s.finished, seat] : s.finished;
  const again = !finishedNow && (s.dice === 6 || captured.length > 0 || home);
  const event: LudoEvent = { k: "move", seat, token, from, to, value: s.dice, captured, safeSave, home, again, finished: finishedNow };

  let next: LudoState = { ...s, tokens, finished, ply: s.ply + 1, phase: "roll", dice: null, last: event };
  next = checkOver(next);
  if (next.over) return next;
  if (again) return next; // same player rolls again; the run of 6s carries on
  return { ...passTurn(next), last: event };
}

/** Hands a seat to the computer (the person left or missed too many turns). */
export function toBot(s: LudoState, seat: number): LudoState | null {
  if (s.over || seat < 0 || seat >= s.tokens.length || s.bots[seat]) return null;
  const bots = s.bots.map((b, i) => b || i === seat);
  return checkOver({ ...s, bots, ply: s.ply + 1, last: { k: "bot", seat } });
}

/** Applies one log action. Null if it breaks a rule. */
export function apply(s: LudoState, action: string): LudoState | null {
  if (typeof action !== "string" || action.length !== 2) return null;
  const n = action.charCodeAt(1) - 48;
  if (n < 0 || n > 9) return null;
  switch (action[0]) {
    case "r":
      return roll(s, n);
    case "m":
      return move(s, n);
    case "b":
      return toBot(s, n);
    default:
      return null;
  }
}

/** Replays a whole game. Null if any action is illegal. */
export function replay(setup: LudoSetup, log: readonly string[]): LudoState | null {
  let s: LudoState | null = newGame(setup);
  for (const a of log) {
    s = apply(s, a);
    if (!s) return null;
  }
  return s;
}

/** Track squares a token passes through on a move, for animation: progress values from `from` (exclusive) to `to`. */
export function pathOf(from: number, to: number): number[] {
  if (from === BASE) return [0];
  const out: number[] = [];
  for (let p = from + 1; p <= to; p++) out.push(p);
  return out;
}
