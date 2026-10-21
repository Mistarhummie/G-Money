import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { orders, products, users, type Order, type User } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  approveHeldOrder,
  catalog,
  createOrder,
  fulfilOrder,
  markPaid,
  markPaymentFailed,
  markRefunded,
  recheckOrder,
  revealCode,
  setPaymentRef,
  setProductEnabled,
  setUsdKesRate,
  syncProducts,
} from "@/lib/shop/orders";
import { cardFeeKes, formatFace, priceKes } from "@/lib/shop/pricing";
import { TestSupplier, type GiftCardSupplier } from "@/lib/shop/suppliers";
import { createTournament, finishLeaderboard, joinTournament, startTournament } from "@/lib/tournaments";
import { inverse, shufflePath } from "@/lib/games/puzzle15";
import { startPuzzleAttempt, submitPuzzleAttempt } from "@/lib/puzzles";

let db: Db;
let supplier: TestSupplier;
let admin: User;
let counter = 0;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-01T10:00:00Z");

async function makeUser(overrides: Partial<User> = {}): Promise<User> {
  counter++;
  const [u] = await db
    .insert(users)
    .values({ phone: `+2547${String(counter).padStart(8, "0")}`, username: `buyer${counter}`, createdAt: new Date(NOW.getTime() - 30 * DAY), ...overrides })
    .returning();
  return u;
}

async function psn() {
  const [p] = await db.select().from(products).where(eq(products.brand, "PlayStation"));
  return p;
}

beforeEach(async () => {
  db = await createPgliteDb();
  supplier = new TestSupplier();
  admin = await makeUser({ isAdmin: true });
  await setUsdKesRate(db, admin, 130);
  await syncProducts(db, admin, supplier);
  await setProductEnabled(db, admin, (await psn()).id, true);
});

describe("pricing", () => {
  it("adds the markup and rounds up to the next 10 shillings", () => {
    // $9.70 cost × 130 = 1261, +5% = 1324.05 → 1330
    expect(priceKes(970, 130, 5)).toBe(1330);
    expect(priceKes(1000, 100, 0)).toBe(1000);
  });
  it("charges the card fee on top, rounded up", () => {
    expect(cardFeeKes(1330, 3.5)).toBe(47);
  });
  it("formats face values", () => {
    expect(formatFace(1000, "USD")).toBe("$10");
    expect(formatFace(2550, "USD")).toBe("$25.50");
  });
});

describe("codes are stored encrypted", () => {
  it("round-trips and never stores the plain code", () => {
    const sealed = encrypt("ABCD-1234");
    expect(sealed).not.toContain("ABCD");
    expect(decrypt(sealed)).toBe("ABCD-1234");
  });
});

describe("catalog", () => {
  it("only shows enabled products, priced in KES", async () => {
    const items = await catalog(db, "test");
    expect(items).toHaveLength(1);
    expect(items[0].brand).toBe("PlayStation");
    expect(items[0].prices[0].priceKes).toBeGreaterThan(0);
  });
  it("is empty until the dollar rate is set", async () => {
    const fresh = await createPgliteDb();
    expect(await catalog(fresh, "test")).toEqual([]);
  });
});

describe("buying with M-Pesa", () => {
  async function paidOrder(user: User): Promise<Order> {
    const p = await psn();
    const order = await createOrder(db, user, { productId: p.id, faceCents: p.denominations[0].faceCents, method: "mpesa" }, "test", NOW);
    await setPaymentRef(db, order.id, `ws_CO_${order.id}`);
    const res = await markPaid(db, { paymentRef: `ws_CO_${order.id}` }, { amountKes: order.totalKes, receipt: "SJK12345" }, NOW);
    expect(res?.readyToFulfil).toBe(true);
    return res!.order;
  }

  it("delivers a code the buyer can see and nobody else can", async () => {
    const buyer = await makeUser();
    const stranger = await makeUser();
    const order = await paidOrder(buyer);
    const delivered = await fulfilOrder(db, order.id, supplier, NOW);
    expect(delivered.status).toBe("delivered");
    expect(delivered.codeEncrypted).not.toMatch(/^TEST-/);
    expect(revealCode(delivered, buyer)?.code).toMatch(/^TEST-/);
    expect(revealCode(delivered, stranger)).toBeNull();
  });

  it("never buys the card twice when the payment callback repeats", async () => {
    const buyer = await makeUser();
    const order = await paidOrder(buyer);
    let calls = 0;
    const counting: GiftCardSupplier = { ...supplier, name: "test", order: async (i) => (calls++, supplier.order(i)), findOrder: (r) => supplier.findOrder(r), listProducts: () => supplier.listProducts(), balanceUsd: () => supplier.balanceUsd() };
    const again = await markPaid(db, { paymentRef: `ws_CO_${order.id}` }, { amountKes: order.totalKes }, NOW);
    expect(again?.readyToFulfil).toBe(true);
    await Promise.all([fulfilOrder(db, order.id, counting, NOW), fulfilOrder(db, order.id, counting, NOW)]);
    await fulfilOrder(db, order.id, counting, NOW);
    expect(calls).toBe(1);
  });

  it("holds an order when less money arrived than expected", async () => {
    const buyer = await makeUser();
    const p = await psn();
    const order = await createOrder(db, buyer, { productId: p.id, faceCents: p.denominations[0].faceCents, method: "mpesa" }, "test", NOW);
    const res = await markPaid(db, { orderId: order.id }, { amountKes: 1 }, NOW);
    expect(res?.order.status).toBe("held");
    expect(res?.readyToFulfil).toBe(false);
  });

  it("keeps a payment that arrives after the order was cancelled", async () => {
    const buyer = await makeUser();
    const p = await psn();
    const order = await createOrder(db, buyer, { productId: p.id, faceCents: p.denominations[0].faceCents, method: "mpesa" }, "test", NOW);
    await markPaymentFailed(db, { orderId: order.id }, "Timed out");
    const res = await markPaid(db, { orderId: order.id }, { amountKes: order.totalKes }, NOW);
    expect(res?.order.status).toBe("held");
  });

  it("checks with the supplier before retrying an unknown result", async () => {
    const buyer = await makeUser();
    const order = await paidOrder(buyer);
    const timeout: GiftCardSupplier = { ...supplier, name: "test", order: async () => ({ status: "unknown", reason: "Timed out" }), findOrder: (r) => supplier.findOrder(r), listProducts: () => supplier.listProducts(), balanceUsd: () => supplier.balanceUsd() };
    expect((await fulfilOrder(db, order.id, timeout, NOW)).status).toBe("needs_check");
    // The supplier never got it, so recheck sends it again and it is delivered.
    expect((await recheckOrder(db, admin, order.id, supplier, NOW)).status).toBe("delivered");
  });
});

describe("limits and fraud holds", () => {
  it("caps new accounts at the daily limit", async () => {
    const fresh = await makeUser({ createdAt: new Date(NOW.getTime() - DAY) });
    const p = await psn();
    const biggest = p.denominations[p.denominations.length - 1].faceCents;
    await expect(
      (async () => {
        for (let i = 0; i < 10; i++) await createOrder(db, fresh, { productId: p.id, faceCents: biggest, method: "mpesa" }, "test", NOW);
      })(),
    ).rejects.toThrow(/New accounts can spend/);
  });

  it("holds the first card order for the admin, then sends it on approval", async () => {
    const buyer = await makeUser();
    const p = await psn();
    const order = await createOrder(db, buyer, { productId: p.id, faceCents: p.denominations[0].faceCents, method: "card", email: "a@b.co" }, "test", NOW);
    expect(order.feeKes).toBeGreaterThan(0);
    const res = await markPaid(db, { orderId: order.id }, { amountKes: order.totalKes }, NOW);
    expect(res?.order.status).toBe("held");
    expect(res?.order.heldReason).toMatch(/First card order/);
    await approveHeldOrder(db, admin, order.id);
    expect((await fulfilOrder(db, order.id, supplier, NOW)).status).toBe("delivered");
  });

  it("needs an email for card payments", async () => {
    const buyer = await makeUser();
    const p = await psn();
    await expect(createOrder(db, buyer, { productId: p.id, faceCents: p.denominations[0].faceCents, method: "card" }, "test", NOW)).rejects.toThrow(/email/);
  });

  it("refuses hidden products and banned buyers", async () => {
    const buyer = await makeUser();
    const [xbox] = await db.select().from(products).where(eq(products.brand, "Xbox"));
    await expect(createOrder(db, buyer, { productId: xbox.id, faceCents: xbox.denominations[0].faceCents, method: "mpesa" }, "test", NOW)).rejects.toThrow(/not available/);
    const banned = await makeUser({ bannedAt: NOW, banReason: "fraud" });
    const p = await psn();
    await expect(createOrder(db, banned, { productId: p.id, faceCents: p.denominations[0].faceCents, method: "mpesa" }, "test", NOW)).rejects.toThrow(/suspended/);
  });

  it("marks refunds only with a note", async () => {
    const buyer = await makeUser();
    const p = await psn();
    const order = await createOrder(db, buyer, { productId: p.id, faceCents: p.denominations[0].faceCents, method: "mpesa" }, "test", NOW);
    await markPaid(db, { orderId: order.id }, { amountKes: 1 }, NOW);
    await expect(markRefunded(db, admin, order.id, " ")).rejects.toThrow(/Note/);
    await markRefunded(db, admin, order.id, "SJK999 sent back");
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.status).toBe("refunded");
  });
});

describe("gift card tournament prizes", () => {
  it("creates prize orders for the winners when the tournament ends", async () => {
    const p = await psn();
    const t = await createTournament(db, admin, {
      title: "Puzzle Cup",
      game: "puzzle15",
      entryType: "free",
      entryFeeKes: 0,
      sponsoredPrizeKes: 0,
      maxPlayers: 10,
      startsAt: NOW,
      endsAt: new Date(NOW.getTime() + DAY),
      prizeProductId: p.id,
      prizeCardValues: `${p.denominations[1].faceCents / 100},${p.denominations[0].faceCents / 100}`,
    });
    const a = await makeUser();
    const b = await makeUser();
    for (const u of [a, b]) await joinTournament(db, u, t.id);
    await startTournament(db, admin, t.id, NOW);
    const at = (min: number) => new Date(NOW.getTime() + min * 60_000);
    for (const [u, min, secs] of [[a, 1, 90], [b, 2, 200]] as const) {
      const { attemptId, seed } = await startPuzzleAttempt(db, u, t.id, at(min));
      await submitPuzzleAttempt(db, u, attemptId, inverse(shufflePath(seed)), new Date(at(min).getTime() + secs * 1000));
    }
    await finishLeaderboard(db, admin, t.id, at(100));
    const prizes = await db.select().from(orders).where(eq(orders.tournamentId, t.id));
    expect(prizes).toHaveLength(2);
    const first = prizes.find((o) => o.userId === a.id)!;
    expect(first.faceCents).toBe(p.denominations[1].faceCents);
    expect(first.status).toBe("held");
    await approveHeldOrder(db, admin, first.id);
    expect((await fulfilOrder(db, first.id, supplier)).status).toBe("delivered");
  });

  it("rejects a card value the product does not come in", async () => {
    const p = await psn();
    await expect(
      createTournament(db, admin, {
        title: "Bad prize",
        game: "efootball",
        entryType: "free",
        entryFeeKes: 0,
        sponsoredPrizeKes: 0,
        maxPlayers: 8,
        startsAt: NOW,
        prizeProductId: p.id,
        prizeCardValues: "7",
      }),
    ).rejects.toThrow(/does not come in/);
  });
});
