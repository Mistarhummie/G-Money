import { randomInt } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { ludoGames, ludoPlayers, ludoProgress, users, type LudoGame, type LudoSeat, type User } from "@/db/schema";
import { UserError } from "../errors";
import { chooseMove } from "./bots";
import { BOT_MOVE_MS, BOT_ROLL_MS, LUDO_STAGES, MAX_MISSED, TURN_SECONDS } from "./meta";
import { apply, distinctChoices, replay, seatColours, type LudoSetup, type LudoState } from "./rules";

/**
 * Ludo games on the server. Every game, including vs computer, lives here: the browser asks to roll
 * or to move and the server decides.
 *
 * Fair dice: a roll is drawn with crypto.randomInt only when the player whose turn it is asks for it
 * (or when the server plays for a computer or a timed-out player). It is appended to the game's log
 * at once, so no future roll exists anywhere for a browser to see or guess. A move names only a
 * token; the roll it uses is the one already in the log, and the whole log is replayed through the
 * rules on every request, so a move that doesn't fit the stored roll, comes out of turn or comes from
 * someone not seated is refused.
 *
 * Time: computers act a moment after the previous action (so people can follow), and in online games
 * a person who takes longer than the turn timer has their move played for them. Nothing runs in the
 * background: whoever next loads or acts on the game catches it up, using the times each action was
 * due, so the result is the same however often people poll.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

export type LudoDeps = {
  /** Server die. Tests pass a fixed sequence. */
  dice?: () => number;
  /** Randomness for computer choices and seating. */
  rng?: () => number;
};

const serverDie = () => randomInt(1, 7);
const BOT_NAMES = ["Zawadi", "Juma", "Amani", "Neema", "Baraka", "Imani"];
/** Strength the computer plays at when it fills a seat or takes over for someone. */
const FILL_LEVEL = 4;
/** Quick match only joins tables made this recently. */
const QUICK_WINDOW_MS = 15 * 60 * 1000;
/** Waiting tables are listed for this long. */
const LIST_WINDOW_MS = 60 * 60 * 1000;

export function setupOf(g: Pick<LudoGame, "size" | "seats" | "first">): LudoSetup {
  return { colours: seatColours(g.size), humans: g.seats.map((s) => !!s.userId), first: g.first };
}

export function stateOf(g: LudoGame): LudoState {
  const s = replay(setupOf(g), g.log);
  // Only the server writes the log, and it checks every action first, so this means corrupted data.
  if (!s) throw new Error(`Ludo game ${g.id} has an invalid log`);
  return s;
}

const nameOf = (u: User) => u.username ?? "Player";
const emptySeat = (): LudoSeat => ({ userId: null, name: "", bot: false, level: 0 });

function checkPlayer(user: User, online: boolean) {
  if (user.bannedAt) throw new UserError("Your account is suspended");
  if (online && !user.username) throw new UserError("Choose a username on your profile first");
}

async function lockGame(tx: Exec, id: string): Promise<LudoGame> {
  const [g] = await tx.select().from(ludoGames).where(eq(ludoGames.id, id)).for("update");
  if (!g) throw new UserError("Game not found");
  return g;
}

async function save(tx: Exec, id: string, patch: Partial<LudoGame>): Promise<LudoGame> {
  const [g] = await tx.update(ludoGames).set(patch).where(eq(ludoGames.id, id)).returning();
  return g;
}

// ---------------------------------------------------------------- vs computer

/** Highest stage the player may start: 1, and every stage after one they have cleared. */
export async function ludoUnlocked(db: Exec, userId: string): Promise<number> {
  const [{ top }] = await db
    .select({ top: sql<number>`coalesce(max(${ludoProgress.stage}), 0)::int` })
    .from(ludoProgress)
    .where(and(eq(ludoProgress.userId, userId), sql`${ludoProgress.clearedAt} is not null`));
  return Math.min(top + 1, LUDO_STAGES.length);
}

export async function startComputerGame(
  db: Db,
  user: User,
  input: { stage: number; opponents: number },
  now = new Date(),
  deps: LudoDeps = {},
): Promise<LudoGame> {
  checkPlayer(user, false);
  const stage = Math.trunc(Number(input.stage));
  const opponents = Math.trunc(Number(input.opponents));
  if (!(stage >= 1 && stage <= LUDO_STAGES.length)) throw new UserError("Unknown stage");
  if (!(opponents >= 1 && opponents <= 3)) throw new UserError("Choose 1 to 3 computer opponents");
  const rng = deps.rng ?? Math.random;
  return db.transaction(async (tx) => {
    if (stage > (await ludoUnlocked(tx, user.id))) throw new UserError(`Clear stage ${stage - 1} first`);
    // One computer game at a time: an unfinished one is dropped.
    await tx
      .update(ludoGames)
      .set({ status: "cancelled", finishedAt: now })
      .where(and(eq(ludoGames.mode, "computer"), eq(ludoGames.hostId, user.id), eq(ludoGames.status, "playing")));
    const level = LUDO_STAGES[stage - 1].level;
    const names = [...BOT_NAMES].sort(() => rng() - 0.5);
    const seats: LudoSeat[] = [
      { userId: user.id, name: nameOf(user) === "Player" ? "You" : nameOf(user), bot: false, level: 0 },
      ...Array.from({ length: opponents }, (_, i) => ({ userId: null, name: names[i], bot: true, level })),
    ];
    const [g] = await tx
      .insert(ludoGames)
      .values({
        mode: "computer",
        status: "playing",
        stage,
        size: seats.length,
        hostId: user.id,
        seats,
        first: Math.floor(rng() * seats.length),
        missed: seats.map(() => 0),
        turnSeconds: 0,
        startedAt: now,
        lastActionAt: now,
      })
      .returning();
    await tx.insert(ludoPlayers).values({ gameId: g.id, userId: user.id, seat: 0, joinedAt: now });
    return g;
  });
}

async function recordComputerResult(tx: Exec, g: LudoGame, s: LudoState, now: Date) {
  if (g.mode !== "computer" || !g.stage) return;
  const seat = g.seats.findIndex((x) => x.userId);
  const userId = g.seats[seat]?.userId;
  if (!userId) return;
  const won = !g.seats[seat].left && s.places?.[0] === seat;
  const rolls = s.rolls[seat];
  const [prev] = await tx
    .select()
    .from(ludoProgress)
    .where(and(eq(ludoProgress.userId, userId), eq(ludoProgress.stage, g.stage)))
    .for("update");
  const row = {
    played: (prev?.played ?? 0) + 1,
    wins: (prev?.wins ?? 0) + (won ? 1 : 0),
    bestRolls: won ? Math.min(prev?.bestRolls ?? Infinity, rolls) : (prev?.bestRolls ?? null),
    clearedAt: prev?.clearedAt ?? (won ? now : null),
  };
  if (prev) await tx.update(ludoProgress).set(row).where(and(eq(ludoProgress.userId, userId), eq(ludoProgress.stage, g.stage)));
  else await tx.insert(ludoProgress).values({ userId, stage: g.stage, ...row });
}

// ---------------------------------------------------------------- the clock and the computer

/**
 * Plays everything that is due by `now`: computer turns, and in online games the moves of people
 * whose timer ran out. Each catch-up action is stamped with the time it was due.
 */
async function advance(tx: Exec, g: LudoGame, now: Date, deps: LudoDeps): Promise<LudoGame> {
  if (g.status !== "playing") return g;
  const die = deps.dice ?? serverDie;
  const rng = deps.rng ?? Math.random;
  let s = stateOf(g);
  const log = [...g.log];
  const seats = g.seats.map((x) => ({ ...x }));
  const missed = g.seats.map((_, i) => g.missed[i] ?? 0);
  let at = (g.lastActionAt ?? g.startedAt ?? now).getTime();
  const push = (a: string) => {
    const next = apply(s, a);
    if (!next) throw new Error(`Server produced an illegal Ludo action ${a}`);
    s = next;
    log.push(a);
  };

  for (let guard = 0; guard < 2000 && !s.over; guard++) {
    const seat = s.turn;
    if (s.bots[seat]) {
      const due = at + (s.phase === "roll" ? BOT_ROLL_MS : BOT_MOVE_MS);
      if (now.getTime() < due) break;
      at = due;
      push(s.phase === "roll" ? `r${die()}` : `m${chooseMove(s, seats[seat].level || FILL_LEVEL, rng)}`);
      continue;
    }
    if (g.mode !== "online") break;
    const due = at + g.turnSeconds * 1000;
    if (now.getTime() < due) break;
    // Out of time: the server rolls and moves for them, as a sensible player would.
    at = due;
    missed[seat]++;
    if (s.phase === "roll") push(`r${die()}`);
    if (!s.over && s.turn === seat && s.phase === "move") push(`m${chooseMove(s, FILL_LEVEL, rng)}`);
    if (!s.over && missed[seat] >= MAX_MISSED) {
      push(`b${seat}`);
      seats[seat] = { ...seats[seat], level: FILL_LEVEL };
    }
  }

  if (log.length === g.log.length) return g;
  const patch: Partial<LudoGame> = { log, seats, missed, lastActionAt: new Date(at) };
  if (s.over) Object.assign(patch, { status: "finished", places: s.places, finishedAt: new Date(at) });
  const updated = await save(tx, g.id, patch);
  if (s.over) await recordComputerResult(tx, updated, s, new Date(at));
  return updated;
}

/** Loads a game, catching up anything that is due. */
export async function getLudoGame(db: Db, id: string, now = new Date(), deps: LudoDeps = {}): Promise<LudoGame | null> {
  return db.transaction(async (tx) => {
    const [g] = await tx.select().from(ludoGames).where(eq(ludoGames.id, id)).for("update");
    if (!g) return null;
    return advance(tx, g, now, deps);
  });
}

// ---------------------------------------------------------------- a person's turn

export type LudoAction = { kind: "roll" } | { kind: "move"; token: number };

/**
 * A person rolls or moves. `ply` is the log length the browser last saw, so a double tap or a
 * stale screen can't act twice. When a roll leaves only one real choice, the server moves it at once.
 */
export async function ludoAct(
  db: Db,
  user: User,
  id: string,
  action: LudoAction,
  ply: number,
  now = new Date(),
  deps: LudoDeps = {},
): Promise<LudoGame> {
  return db.transaction(async (tx) => {
    const g = await advance(tx, await lockGame(tx, id), now, deps);
    if (g.status !== "playing") throw new UserError(g.status === "waiting" ? "The game hasn't started yet" : "This game is over");
    const seat = g.seats.findIndex((x) => x.userId === user.id);
    if (seat === -1) throw new UserError("You are not playing in this game");
    let s = stateOf(g);
    if (s.bots[seat]) throw new UserError("The computer is playing your seat now");
    if (s.turn !== seat) throw new UserError("It's not your turn");
    if (ply !== g.log.length) throw new UserError("The board has moved on. Try again.");
    const log = [...g.log];
    const push = (a: string) => {
      const next = apply(s, a);
      if (!next) throw new UserError(action.kind === "roll" ? "You can't roll now" : "That token can't move");
      s = next;
      log.push(a);
    };
    if (action.kind === "roll") {
      if (s.phase !== "roll") throw new UserError("Move a token first");
      push(`r${(deps.dice ?? serverDie)()}`);
      // `push` replaced the state, which TypeScript can't see through the closure.
      const rolled = s as LudoState;
      const choices = distinctChoices(rolled);
      if (rolled.turn === seat && rolled.phase === "move" && choices.length === 1) push(`m${choices[0]}`);
    } else {
      if (s.phase !== "move") throw new UserError("Roll the die first");
      const token = Math.trunc(Number(action.token));
      if (!(token >= 0 && token <= 3)) throw new UserError("That token can't move");
      push(`m${token}`);
    }
    const missed = g.seats.map((_, i) => (i === seat ? 0 : (g.missed[i] ?? 0)));
    const patch: Partial<LudoGame> = { log, missed, lastActionAt: now };
    if (s.over) Object.assign(patch, { status: "finished", places: s.places, finishedAt: now });
    const updated = await save(tx, g.id, patch);
    if (s.over) await recordComputerResult(tx, updated, s, now);
    return updated;
  });
}

// ---------------------------------------------------------------- online tables

async function seatUser(tx: Exec, g: LudoGame, user: User, now: Date): Promise<LudoGame> {
  const seat = g.seats.findIndex((x) => !x.userId);
  if (seat === -1) throw new UserError("This table is full");
  const seats = g.seats.map((x, i) => (i === seat ? { userId: user.id, name: nameOf(user), bot: false, level: 0 } : x));
  // The primary key on (game, user) and the unique (game, seat) index make double seating impossible.
  await tx.insert(ludoPlayers).values({ gameId: g.id, userId: user.id, seat, joinedAt: now });
  const updated = await save(tx, g.id, { seats });
  return updated.seats.every((x) => x.userId) ? begin(tx, updated, false, now, {}) : updated;
}

/**
 * Starts a waiting table. People keep their join order; empty seats get computers (`fill`) or are
 * removed, and the board's colours follow the final number of seats. Who rolls first is drawn.
 */
async function begin(tx: Exec, g: LudoGame, fill: boolean, now: Date, deps: LudoDeps): Promise<LudoGame> {
  const rng = deps.rng ?? Math.random;
  const people = g.seats.filter((x) => x.userId);
  const names = BOT_NAMES.filter((n) => !people.some((p) => p.name === n));
  const seats: LudoSeat[] = fill
    ? g.seats.map((x, i) => (x.userId ? x : { userId: null, name: names[i % names.length], bot: true, level: FILL_LEVEL }))
    : people;
  if (seats.length < 2) throw new UserError("Ludo needs at least 2 players");
  await tx.delete(ludoPlayers).where(eq(ludoPlayers.gameId, g.id));
  await tx.insert(ludoPlayers).values(seats.flatMap((x, seat) => (x.userId ? [{ gameId: g.id, userId: x.userId, seat, joinedAt: now }] : [])));
  return save(tx, g.id, {
    status: "playing",
    size: seats.length,
    seats,
    missed: seats.map(() => 0),
    first: Math.floor(rng() * seats.length),
    log: [],
    startedAt: now,
    lastActionAt: now,
  });
}

/** "Play online": sits the player at a waiting public table of this size, or opens a new one. */
export async function quickMatch(db: Db, user: User, sizeIn: number, now = new Date()): Promise<LudoGame> {
  checkPlayer(user, true);
  const size = Math.trunc(Number(sizeIn));
  if (!(size >= 2 && size <= 4)) throw new UserError("Choose 2, 3 or 4 players");
  return db.transaction(async (tx) => {
    // One quick match at a time across the whole site, so two people can't both open a table at once.
    await tx.execute(sql`select pg_advisory_xact_lock(724501)`);
    const mine = await tx
      .select({ g: ludoGames })
      .from(ludoPlayers)
      .innerJoin(ludoGames, eq(ludoGames.id, ludoPlayers.gameId))
      .where(
        and(
          eq(ludoPlayers.userId, user.id),
          eq(ludoGames.mode, "online"),
          eq(ludoGames.isPrivate, false),
          eq(ludoGames.status, "waiting"),
          eq(ludoGames.size, size),
        ),
      );
    if (mine.length) return mine[0].g;
    const waiting = await tx
      .select()
      .from(ludoGames)
      .where(
        and(
          eq(ludoGames.mode, "online"),
          eq(ludoGames.status, "waiting"),
          eq(ludoGames.isPrivate, false),
          eq(ludoGames.size, size),
          gt(ludoGames.createdAt, new Date(now.getTime() - QUICK_WINDOW_MS)),
        ),
      )
      .orderBy(asc(ludoGames.createdAt))
      .for("update");
    const table = waiting.find((g) => g.seats.some((x) => !x.userId) && !g.seats.some((x) => x.userId === user.id));
    if (table) return seatUser(tx, table, user, now);
    return openTable(tx, user, size, false, [], now);
  });
}

async function openTable(tx: Exec, user: User, size: number, isPrivate: boolean, invited: string[], now: Date): Promise<LudoGame> {
  const seats = [{ userId: user.id, name: nameOf(user), bot: false, level: 0 }, ...Array.from({ length: size - 1 }, emptySeat)];
  const [g] = await tx
    .insert(ludoGames)
    .values({ mode: "online", status: "waiting", size, isPrivate, hostId: user.id, seats, invited, missed: seats.map(() => 0), turnSeconds: TURN_SECONDS, createdAt: now })
    .returning();
  await tx.insert(ludoPlayers).values({ gameId: g.id, userId: user.id, seat: 0, joinedAt: now });
  return g;
}

/** A private table for friends: invite them by username, or share the link. */
export async function createTable(db: Db, user: User, input: { size: number; invite?: string }, now = new Date()): Promise<LudoGame> {
  checkPlayer(user, true);
  const size = Math.trunc(Number(input.size));
  if (!(size >= 2 && size <= 4)) throw new UserError("Choose 2, 3 or 4 players");
  const wanted = [...new Set((input.invite ?? "").split(/[\s,]+/).map((n) => n.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))];
  if (wanted.length > size - 1) throw new UserError(`A ${size}-player table has room for ${size - 1} friends`);
  const found = wanted.length
    ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(sql`lower(${users.username})`, wanted))
    : [];
  const missing = wanted.filter((w) => !found.some((f) => f.username?.toLowerCase() === w));
  if (missing.length) throw new UserError(`No player called ${missing.join(", ")}`);
  if (found.some((f) => f.id === user.id)) throw new UserError("You can't invite yourself");
  return db.transaction((tx) => openTable(tx, user, size, true, found.map((f) => f.id), now));
}

export async function joinTable(db: Db, user: User, id: string, now = new Date()): Promise<LudoGame> {
  checkPlayer(user, true);
  return db.transaction(async (tx) => {
    const g = await lockGame(tx, id);
    if (g.mode !== "online" || g.status !== "waiting") throw new UserError("This table has already started");
    if (g.seats.some((x) => x.userId === user.id)) return g;
    return seatUser(tx, g, user, now);
  });
}

/** The host starts before the table is full, with 2–3 people or with computers in the empty seats. */
export async function startTable(db: Db, user: User, id: string, fill: boolean, now = new Date(), deps: LudoDeps = {}): Promise<LudoGame> {
  return db.transaction(async (tx) => {
    const g = await lockGame(tx, id);
    if (g.mode !== "online" || g.status !== "waiting") throw new UserError("This table has already started");
    if (g.hostId !== user.id) throw new UserError("Only the host can start the game");
    const people = g.seats.filter((x) => x.userId).length;
    if (!fill && people < 2) throw new UserError("Wait for another player, or fill the empty seats with computers");
    return begin(tx, g, fill, now, deps);
  });
}

/**
 * Leaving a waiting table frees the seat (the host's role passes on; an empty table closes).
 * Leaving a game in play hands the seat to the computer, so the others can finish.
 */
export async function leaveTable(db: Db, user: User, id: string, now = new Date(), deps: LudoDeps = {}): Promise<LudoGame> {
  return db.transaction(async (tx) => {
    const g = await advance(tx, await lockGame(tx, id), now, deps);
    const seat = g.seats.findIndex((x) => x.userId === user.id);
    if (seat === -1) throw new UserError("You are not at this table");
    if (g.status === "waiting") {
      await tx.delete(ludoPlayers).where(and(eq(ludoPlayers.gameId, g.id), eq(ludoPlayers.userId, user.id)));
      const seats = g.seats.map((x, i) => (i === seat ? emptySeat() : x));
      const host = g.hostId === user.id ? (seats.find((x) => x.userId)?.userId ?? null) : g.hostId;
      return save(tx, g.id, host ? { seats, hostId: host } : { seats, status: "cancelled", finishedAt: now });
    }
    if (g.status !== "playing") throw new UserError("This game is over");
    const s = stateOf(g);
    if (s.bots[seat]) return g;
    const next = apply(s, `b${seat}`)!;
    const seats = g.seats.map((x, i) => (i === seat ? { ...x, left: true, level: FILL_LEVEL } : x));
    const patch: Partial<LudoGame> = { log: [...g.log, `b${seat}`], seats };
    // The computer's clock starts now if it is that seat's turn.
    if (s.turn === seat) patch.lastActionAt = now;
    if (next.over) Object.assign(patch, { status: "finished", places: next.places, finishedAt: now });
    const updated = await save(tx, g.id, patch);
    if (next.over) await recordComputerResult(tx, updated, next, now);
    return updated;
  });
}

// ---------------------------------------------------------------- what the browser sees

export type LudoView = {
  id: string;
  mode: LudoGame["mode"];
  status: LudoGame["status"];
  stage: number | null;
  size: number;
  isPrivate: boolean;
  setup: LudoSetup;
  seats: { name: string; bot: boolean; left: boolean; empty: boolean; isMe: boolean; isHost: boolean; missed: number }[];
  /** Actions from `logFrom` on. Every one is in the past: rolls are made only when they are used. */
  log: string[];
  logFrom: number;
  logLength: number;
  mySeat: number | null;
  isHost: boolean;
  canJoin: boolean;
  invited: string[];
  /** When the person to act runs out of time (online games). */
  deadline: number | null;
  turnSeconds: number;
  /** When the server will next act by itself (a computer turn or a timeout), so the page can look again then. */
  nextAt: number | null;
  serverNow: number;
  places: number[] | null;
};

export async function ludoView(db: Exec, g: LudoGame, viewer: User | null, from = 0, now = new Date()): Promise<LudoView> {
  const mySeat = viewer ? g.seats.findIndex((x) => x.userId === viewer.id) : -1;
  const invited = g.invited.length
    ? (await db.select({ username: users.username }).from(users).where(inArray(users.id, g.invited))).map((u) => u.username ?? "Player")
    : [];
  let deadline: number | null = null;
  let nextAt: number | null = null;
  if (g.status === "playing" && g.lastActionAt) {
    const s = stateOf(g);
    const last = g.lastActionAt.getTime();
    if (s.bots[s.turn]) nextAt = last + (s.phase === "roll" ? BOT_ROLL_MS : BOT_MOVE_MS);
    else if (g.mode === "online") nextAt = deadline = last + g.turnSeconds * 1000;
  }
  const start = Math.max(0, Math.min(Math.trunc(from) || 0, g.log.length));
  return {
    id: g.id,
    mode: g.mode,
    status: g.status,
    stage: g.stage,
    size: g.size,
    isPrivate: g.isPrivate,
    setup: setupOf(g),
    seats: g.seats.map((x, i) => ({
      name: x.name,
      bot: x.bot,
      left: !!x.left,
      empty: !x.userId && !x.bot,
      isMe: i === mySeat,
      isHost: !!x.userId && x.userId === g.hostId,
      missed: g.missed[i] ?? 0,
    })),
    log: g.log.slice(start),
    logFrom: start,
    logLength: g.log.length,
    mySeat: mySeat === -1 ? null : mySeat,
    isHost: !!viewer && g.hostId === viewer.id,
    canJoin: !!viewer && g.mode === "online" && g.status === "waiting" && mySeat === -1 && g.seats.some((x) => !x.userId),
    invited,
    deadline,
    turnSeconds: g.turnSeconds,
    nextAt,
    serverNow: now.getTime(),
    places: g.places,
  };
}

// ---------------------------------------------------------------- lists

/** The player's unfinished games and tables they are invited to. */
export async function myLudoGames(db: Db, user: User) {
  const mine = await db
    .select({ g: ludoGames })
    .from(ludoPlayers)
    .innerJoin(ludoGames, eq(ludoGames.id, ludoPlayers.gameId))
    .where(and(eq(ludoPlayers.userId, user.id), inArray(ludoGames.status, ["waiting", "playing"])))
    .orderBy(desc(ludoGames.createdAt))
    .limit(10);
  const invites = await db
    .select()
    .from(ludoGames)
    .where(and(eq(ludoGames.status, "waiting"), sql`${ludoGames.invited} @> ${JSON.stringify([user.id])}::jsonb`))
    .orderBy(desc(ludoGames.createdAt))
    .limit(10);
  return {
    playing: mine.map((r) => r.g),
    invites: invites.filter((g) => !g.seats.some((x) => x.userId === user.id) && g.seats.some((x) => !x.userId)),
  };
}

/** Public tables waiting for players. */
export async function openLudoTables(db: Db, now = new Date()) {
  return db
    .select()
    .from(ludoGames)
    .where(
      and(
        eq(ludoGames.mode, "online"),
        eq(ludoGames.status, "waiting"),
        eq(ludoGames.isPrivate, false),
        gt(ludoGames.createdAt, new Date(now.getTime() - LIST_WINDOW_MS)),
      ),
    )
    .orderBy(desc(ludoGames.createdAt))
    .limit(10);
}

export async function ludoProgressOf(db: Db, userId: string) {
  return db.select().from(ludoProgress).where(eq(ludoProgress.userId, userId)).orderBy(asc(ludoProgress.stage));
}

/** Most wins on a stage, then fewest rolls in a win. */
export async function ludoTopPlayers(db: Db, stage: number) {
  return db
    .select({ username: users.username, wins: ludoProgress.wins, played: ludoProgress.played, bestRolls: ludoProgress.bestRolls })
    .from(ludoProgress)
    .innerJoin(users, eq(users.id, ludoProgress.userId))
    .where(and(eq(ludoProgress.stage, stage), gt(ludoProgress.wins, 0)))
    .orderBy(desc(ludoProgress.wins), asc(ludoProgress.bestRolls))
    .limit(10);
}
