import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value) {
    return Buffer.from(value);
  },
});

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  // E.164 format, e.g. +254712345678. One account per phone number.
  phone: text("phone").notNull().unique(),
  username: text("username").unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  banReason: text("ban_reason"),
  lichessUsername: text("lichess_username"),
  efootballId: text("efootball_id"),
  eafcId: text("eafc_id"),
  matchesPlayed: integer("matches_played").notNull().default(0),
  disputesLost: integer("disputes_lost").notNull().default(0),
  createdAt: createdAt(),
});

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: id(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("otp_codes_phone_idx").on(t.phone, t.createdAt)],
);

export type GameKey = "puzzle15" | "chess" | "efootball" | "eafc";
export type TournamentFormat = "bracket" | "leaderboard";
export type TournamentStatus = "open" | "running" | "completed" | "cancelled";
export type EntryType = "free" | "paid";

export const tournaments = pgTable("tournaments", {
  id: id(),
  title: text("title").notNull(),
  game: text("game").$type<GameKey>().notNull(),
  format: text("format").$type<TournamentFormat>().notNull(),
  entryType: text("entry_type").$type<EntryType>().notNull().default("free"),
  // Amounts are whole Kenyan shillings.
  entryFeeKes: integer("entry_fee_kes").notNull().default(0),
  sponsoredPrizeKes: integer("sponsored_prize_kes").notNull().default(0),
  platformFeePercent: integer("platform_fee_percent").notNull().default(10),
  maxPlayers: integer("max_players").notNull(),
  // Leaderboard tournaments: attempts each player gets.
  attemptsPerPlayer: integer("attempts_per_player").notNull().default(3),
  status: text("status").$type<TournamentStatus>().notNull().default("open"),
  rules: text("rules"),
  // Gift card prize tournaments: the product and face value (in the card's currency, cents) per finishing place.
  prizeProductId: text("prize_product_id"),
  prizeFaceValuesCents: jsonb("prize_face_values_cents").$type<number[]>(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const entries = pgTable(
  "entries",
  {
    id: id(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    seed: integer("seed"),
    finalRank: integer("final_rank"),
    prizeKes: integer("prize_kes").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("entries_tournament_user_idx").on(t.tournamentId, t.userId)],
);

export type MatchStatus = "pending" | "awaiting_confirmation" | "disputed" | "completed";

export const matches = pgTable(
  "matches",
  {
    id: id(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id),
    round: integer("round").notNull(),
    slot: integer("slot").notNull(),
    playerAId: text("player_a_id").references(() => users.id),
    playerBId: text("player_b_id").references(() => users.id),
    winnerId: text("winner_id").references(() => users.id),
    status: text("status").$type<MatchStatus>().notNull().default("pending"),
    scoreA: integer("score_a"),
    scoreB: integer("score_b"),
    reportedBy: text("reported_by").references(() => users.id),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    lichessGameId: text("lichess_game_id"),
    resolvedBy: text("resolved_by"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("matches_slot_idx").on(t.tournamentId, t.round, t.slot)],
);

export const evidence = pgTable("evidence", {
  id: id(),
  matchId: text("match_id")
    .notNull()
    .references(() => matches.id),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  mimeType: text("mime_type").notNull(),
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});

export const disputes = pgTable("disputes", {
  id: id(),
  matchId: text("match_id")
    .notNull()
    .references(() => matches.id),
  openedBy: text("opened_by")
    .notNull()
    .references(() => users.id),
  reason: text("reason").notNull(),
  claimedScoreA: integer("claimed_score_a"),
  claimedScoreB: integer("claimed_score_b"),
  resolution: text("resolution"),
  resolvedBy: text("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const puzzleAttempts = pgTable(
  "puzzle_attempts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    // Null for practice attempts.
    tournamentId: text("tournament_id").references(() => tournaments.id),
    seed: bigint("seed", { mode: "number" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    moveCount: integer("move_count"),
    timeMs: integer("time_ms"),
    solved: boolean("solved").notNull().default(false),
    flagged: boolean("flagged").notNull().default(false),
  },
  (t) => [index("puzzle_attempts_tournament_idx").on(t.tournamentId, t.userId)],
);

// Double-entry ledger. Every money movement writes balanced rows with the same txId.
// Paid entry is switched off for the pilot, but tournaments already record
// their prize obligations here so the books are ready when it is switched on.
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: id(),
    txId: text("tx_id").notNull(),
    // e.g. "user:<id>", "tournament:<id>", "platform:fees", "sponsor:<tournamentId>", "external:mpesa"
    account: text("account").notNull(),
    // Positive = credit to the account, negative = debit. Whole KES.
    amountKes: integer("amount_kes").notNull(),
    memo: text("memo").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ledger_account_idx").on(t.account)],
);

// ---------------------------------------------------------------- shop

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Denomination = {
  /** Face value in the card's own currency, in cents (e.g. 1000 = $10). */
  faceCents: number;
  /** What the supplier charges us, in USD cents. */
  costUsdCents: number;
};

export const products = pgTable(
  "products",
  {
    id: id(),
    supplier: text("supplier").notNull(),
    supplierProductId: text("supplier_product_id").notNull(),
    brand: text("brand").notNull(),
    name: text("name").notNull(),
    // Region the card works in, e.g. US.
    countryCode: text("country_code").notNull(),
    currency: text("currency").notNull(),
    denominations: jsonb("denominations").$type<Denomination[]>().notNull(),
    logoUrl: text("logo_url"),
    redeemInstructions: text("redeem_instructions"),
    enabled: boolean("enabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("products_supplier_idx").on(t.supplier, t.supplierProductId)],
);

export type OrderStatus =
  | "pending_payment"
  | "held" // paid, waiting for admin approval (fraud check)
  | "paid" // paid, ready to send to the supplier
  | "fulfilling"
  | "delivered"
  | "failed" // supplier refused; needs a refund
  | "needs_check" // supplier result unknown (e.g. timeout); check before retrying
  | "cancelled"
  | "refunded";

export type PaymentMethod = "mpesa" | "card" | "prize";

export const orders = pgTable(
  "orders",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    faceCents: integer("face_cents").notNull(),
    costUsdCents: integer("cost_usd_cents").notNull(),
    priceKes: integer("price_kes").notNull(),
    feeKes: integer("fee_kes").notNull().default(0),
    totalKes: integer("total_kes").notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    status: text("status").$type<OrderStatus>().notNull().default("pending_payment"),
    paymentRef: text("payment_ref"),
    paymentReceipt: text("payment_receipt"),
    payerEmail: text("payer_email"),
    heldReason: text("held_reason"),
    failureReason: text("failure_reason"),
    supplierTxId: text("supplier_tx_id"),
    codeEncrypted: text("code_encrypted"),
    pinEncrypted: text("pin_encrypted"),
    tournamentId: text("tournament_id").references(() => tournaments.id),
    createdAt: createdAt(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    index("orders_user_idx").on(t.userId, t.createdAt),
    index("orders_status_idx").on(t.status),
    uniqueIndex("orders_payment_ref_idx").on(t.paymentRef),
  ],
);

export type User = typeof users.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
export type PuzzleAttempt = typeof puzzleAttempts.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
