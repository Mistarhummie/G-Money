/**
 * How each gift card brand is grouped and drawn in the shop. These are our own placeholder card designs
 * (colours, a simple symbol and the brand name), not the brands' official logos or card art.
 */

export type ShopCategory = "gaming" | "phones" | "shopping" | "entertainment";

export const CATEGORIES: { key: ShopCategory; label: string; blurb: string; icon: string }[] = [
  { key: "gaming", label: "Gaming", blurb: "Consoles, PC and in-game credit", icon: "🎮" },
  { key: "phones", label: "Android & iPhone", blurb: "Apps, games and subscriptions on your phone", icon: "📱" },
  { key: "shopping", label: "Shopping", blurb: "Spend on the big online stores", icon: "🛍️" },
  { key: "entertainment", label: "Movies & music", blurb: "Streaming subscriptions", icon: "🎬" },
];

export type Glyph = "controller" | "android" | "apple" | "cart" | "tag" | "play" | "music" | "cube" | "bolt" | "steam";

type BrandStyle = { category: ShopCategory; from: string; to: string; glyph: Glyph; hint?: string; ink?: string };

const BRANDS: Record<string, BrandStyle> = {
  PlayStation: { category: "gaming", from: "#2563eb", to: "#1e1b4b", glyph: "controller" },
  Xbox: { category: "gaming", from: "#16a34a", to: "#052e16", glyph: "controller" },
  Steam: { category: "gaming", from: "#334155", to: "#0b1020", glyph: "steam" },
  Nintendo: { category: "gaming", from: "#ef4444", to: "#7f1d1d", glyph: "controller" },
  Roblox: { category: "gaming", from: "#64748b", to: "#111827", glyph: "cube" },
  "Razer Gold": { category: "gaming", from: "#22c55e", to: "#0b1020", glyph: "bolt" },
  "Google Play": { category: "phones", from: "#14b8a6", to: "#1e3a8a", glyph: "android", hint: "For Android" },
  Apple: { category: "phones", from: "#a1a1aa", to: "#27272a", glyph: "apple", hint: "For iPhone" },
  Amazon: { category: "shopping", from: "#f59e0b", to: "#78350f", glyph: "cart" },
  eBay: { category: "shopping", from: "#3b82f6", to: "#7c3aed", glyph: "tag" },
  Walmart: { category: "shopping", from: "#0ea5e9", to: "#1e3a8a", glyph: "cart" },
  Netflix: { category: "entertainment", from: "#dc2626", to: "#1c0505", glyph: "play" },
  Spotify: { category: "entertainment", from: "#22c55e", to: "#052e16", glyph: "music" },
};

const FALLBACK: BrandStyle = { category: "gaming", from: "#7c3aed", to: "#0b1020", glyph: "controller" };

export function brandStyle(brand: string): BrandStyle {
  return BRANDS[brand] ?? FALLBACK;
}

export function categoryOf(brand: string): ShopCategory {
  return brandStyle(brand).category;
}

const ORDER = Object.keys(BRANDS);
/** Shop order: the most asked-for brands first, unknown brands last. */
export function brandRank(brand: string): number {
  const i = ORDER.indexOf(brand);
  return i === -1 ? ORDER.length : i;
}
