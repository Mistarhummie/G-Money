import { randomBytes } from "node:crypto";
import type { Denomination } from "@/db/schema";

/** A gift card product as the supplier describes it. */
export type SupplierProduct = {
  supplierProductId: string;
  brand: string;
  name: string;
  countryCode: string;
  currency: string;
  denominations: Denomination[];
  logoUrl?: string;
  redeemInstructions?: string;
};

export type SupplierCard = { code: string; pin?: string };

export type SupplierOrderResult =
  | { status: "delivered"; supplierTxId: string; cards: SupplierCard[] }
  | { status: "failed"; reason: string }
  // The request may or may not have gone through (e.g. a timeout). Never retry blindly: check first.
  | { status: "unknown"; reason: string };

export interface GiftCardSupplier {
  name: string;
  listProducts(countryCode: string): Promise<SupplierProduct[]>;
  /** `reference` must be unique per order so the supplier can detect duplicates. */
  order(input: { supplierProductId: string; faceCents: number; reference: string }): Promise<SupplierOrderResult>;
  /** Looks up an order by our reference, for orders whose result was unknown. */
  findOrder(reference: string): Promise<SupplierOrderResult | null>;
  balanceUsd(): Promise<number | null>;
}

// ---------------------------------------------------------------- test supplier

const TEST_CATALOG: SupplierProduct[] = [
  { brand: "PlayStation", name: "PlayStation Store (US)", faces: [1000, 2500, 5000, 10000] },
  { brand: "Xbox", name: "Xbox (US)", faces: [1500, 2500, 5000] },
  { brand: "Steam", name: "Steam Wallet (US)", faces: [500, 1000, 2000, 5000] },
  { brand: "Google Play", name: "Google Play (US)", faces: [1000, 2500, 5000] },
  { brand: "Apple", name: "App Store & iTunes (US)", faces: [1000, 2500, 5000] },
  { brand: "Netflix", name: "Netflix (US)", faces: [2500, 5000] },
].map((p, i) => ({
  supplierProductId: `test-${i + 1}`,
  brand: p.brand,
  name: p.name,
  countryCode: "US",
  currency: "USD",
  // Test costs: 3% below face value, similar to typical wholesale discounts.
  denominations: p.faces.map((faceCents) => ({ faceCents, costUsdCents: Math.round(faceCents * 0.97) })),
  redeemInstructions: `Redeem this code in your ${p.brand} account set to the United States region.`,
}));

/** Hands out fake codes so the whole shop can be tried without a supplier account. */
export class TestSupplier implements GiftCardSupplier {
  name = "test";
  private orders = new Map<string, SupplierOrderResult>();

  async listProducts() {
    return TEST_CATALOG;
  }

  async order({ supplierProductId, faceCents, reference }: { supplierProductId: string; faceCents: number; reference: string }) {
    const existing = this.orders.get(reference);
    if (existing) return existing;
    const product = TEST_CATALOG.find((p) => p.supplierProductId === supplierProductId);
    if (!product || !product.denominations.some((d) => d.faceCents === faceCents)) {
      return { status: "failed" as const, reason: "Unknown product or amount" };
    }
    const block = () => randomBytes(2).toString("hex").toUpperCase();
    const result: SupplierOrderResult = {
      status: "delivered",
      supplierTxId: `test-tx-${randomBytes(4).toString("hex")}`,
      cards: [{ code: `TEST-${block()}-${block()}-${block()}` }],
    };
    this.orders.set(reference, result);
    return result;
  }

  async findOrder(reference: string) {
    return this.orders.get(reference) ?? null;
  }

  async balanceUsd() {
    return 1000;
  }
}

// ---------------------------------------------------------------- Reloadly

type ReloadlyProduct = {
  productId: number;
  productName: string;
  denominationType: "FIXED" | "RANGE";
  recipientCurrencyCode: string;
  senderCurrencyCode: string;
  fixedRecipientDenominations?: number[];
  fixedRecipientToSenderDenominationsMap?: Record<string, number>;
  senderFee?: number;
  discountPercentage?: number;
  logoUrls?: string[];
  brand?: { brandName: string };
  country?: { isoName: string };
  redeemInstruction?: { concise?: string; verbose?: string };
};

/**
 * Reloadly gift card API (https://developers.reloadly.com). Needs a business account:
 * RELOADLY_CLIENT_ID, RELOADLY_CLIENT_SECRET, and RELOADLY_SANDBOX=true for test credentials.
 * Written against Reloadly's published API; first live check happens with real sandbox credentials.
 */
export class ReloadlySupplier implements GiftCardSupplier {
  name = "reloadly";
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private sandbox: boolean,
  ) {}

  private get baseUrl() {
    return this.sandbox ? "https://giftcards-sandbox.reloadly.com" : "https://giftcards.reloadly.com";
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await fetch("https://auth.reloadly.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "client_credentials",
        audience: this.baseUrl,
      }),
    });
    if (!res.ok) throw new Error(`Reloadly sign-in failed (${res.status})`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/com.reloadly.giftcards-v1+json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${await this.accessToken()}`,
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    if (!res.ok) throw new ReloadlyError(res.status, body);
    return JSON.parse(body) as T;
  }

  async listProducts(countryCode: string): Promise<SupplierProduct[]> {
    const products = await this.call<ReloadlyProduct[]>(`/countries/${encodeURIComponent(countryCode)}/products`);
    return products
      .filter((p) => p.denominationType === "FIXED" && p.fixedRecipientToSenderDenominationsMap)
      .map((p) => ({
        supplierProductId: String(p.productId),
        brand: p.brand?.brandName ?? p.productName,
        name: p.productName,
        countryCode: p.country?.isoName ?? countryCode,
        currency: p.recipientCurrencyCode,
        denominations: Object.entries(p.fixedRecipientToSenderDenominationsMap!).map(([face, senderCost]) => {
          const discount = (p.discountPercentage ?? 0) / 100;
          // What we pay: sender amount less our discount, plus Reloadly's per-card fee (account is in USD).
          const cost = senderCost * (1 - discount) + (p.senderFee ?? 0);
          return { faceCents: Math.round(Number(face) * 100), costUsdCents: Math.ceil(cost * 100) };
        }),
        logoUrl: p.logoUrls?.[0],
        redeemInstructions: p.redeemInstruction?.concise,
      }));
  }

  async order({ supplierProductId, faceCents, reference }: { supplierProductId: string; faceCents: number; reference: string }) {
    let tx: { transactionId: number; status: string };
    try {
      tx = await this.call(`/orders`, {
        method: "POST",
        body: JSON.stringify({
          productId: Number(supplierProductId),
          quantity: 1,
          unitPrice: faceCents / 100,
          customIdentifier: reference,
          senderName: "G-Money",
        }),
      });
    } catch (err) {
      if (err instanceof ReloadlyError && err.status >= 400 && err.status < 500) {
        return { status: "failed" as const, reason: `Supplier refused the order: ${err.body.slice(0, 200)}` };
      }
      return { status: "unknown" as const, reason: err instanceof Error ? err.message : String(err) };
    }
    return this.cardsFor(tx.transactionId);
  }

  private async cardsFor(transactionId: number): Promise<SupplierOrderResult> {
    try {
      const cards = await this.call<{ cardNumber?: string; pinCode?: string }[]>(`/orders/transactions/${transactionId}/cards`);
      return {
        status: "delivered",
        supplierTxId: String(transactionId),
        cards: cards.map((c) => ({ code: c.cardNumber ?? c.pinCode ?? "", pin: c.cardNumber ? c.pinCode : undefined })),
      };
    } catch (err) {
      return { status: "unknown", reason: `Order ${transactionId} placed but the code could not be fetched: ${String(err)}` };
    }
  }

  async findOrder(reference: string): Promise<SupplierOrderResult | null> {
    const page = await this.call<{ content: { transactionId: number; customIdentifier: string; status: string }[] }>(
      `/reports/transactions?customIdentifier=${encodeURIComponent(reference)}&size=1`,
    );
    const tx = page.content?.find((t) => t.customIdentifier === reference);
    if (!tx) return null;
    if (tx.status !== "SUCCESSFUL") return { status: "failed", reason: `Supplier status ${tx.status}` };
    return this.cardsFor(tx.transactionId);
  }

  async balanceUsd(): Promise<number | null> {
    const res = await this.call<{ balance: number; currencyCode: string }>(`/accounts/balance`);
    return res.currencyCode === "USD" ? res.balance : null;
  }
}

class ReloadlyError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Reloadly returned ${status}`);
  }
}

// ---------------------------------------------------------------- selection

const globalForSupplier = globalThis as unknown as { gmoneySupplier?: GiftCardSupplier };

/** SUPPLIER=reloadly uses Reloadly; anything else uses the test supplier. */
export function getSupplier(): GiftCardSupplier {
  if (globalForSupplier.gmoneySupplier) return globalForSupplier.gmoneySupplier;
  const { SUPPLIER, RELOADLY_CLIENT_ID, RELOADLY_CLIENT_SECRET, RELOADLY_SANDBOX } = process.env;
  globalForSupplier.gmoneySupplier =
    SUPPLIER === "reloadly" && RELOADLY_CLIENT_ID && RELOADLY_CLIENT_SECRET
      ? new ReloadlySupplier(RELOADLY_CLIENT_ID, RELOADLY_CLIENT_SECRET, RELOADLY_SANDBOX === "true")
      : new TestSupplier();
  return globalForSupplier.gmoneySupplier;
}
