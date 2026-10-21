import type { GameKey, User } from "@/db/schema";
import { ARCADE, ARCADE_KEYS } from "./arcade";

type CatalogEntry = { name: string; format: "bracket" | "leaderboard"; handle?: keyof User; handleLabel?: string; own?: boolean };

export const GAMES: Record<GameKey, CatalogEntry> = {
  chess: { name: "Chess (Lichess)", format: "bracket", handle: "lichessUsername", handleLabel: "Lichess username" },
  efootball: { name: "eFootball", format: "bracket", handle: "efootballId", handleLabel: "eFootball ID" },
  eafc: { name: "EA SPORTS FC", format: "bracket", handle: "eafcId", handleLabel: "EA FC ID" },
  ...(Object.fromEntries(ARCADE_KEYS.map((k) => [k, { name: ARCADE[k].name, format: "leaderboard", own: true }])) as Record<
    (typeof ARCADE_KEYS)[number],
    CatalogEntry
  >),
};
