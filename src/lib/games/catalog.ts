import type { GameKey, User } from "@/db/schema";

export const GAMES: Record<GameKey, { name: string; format: "bracket" | "leaderboard"; handle?: keyof User; handleLabel?: string }> = {
  puzzle15: { name: "Speed Puzzle (15-tile)", format: "leaderboard" },
  chess: { name: "Chess (Lichess)", format: "bracket", handle: "lichessUsername", handleLabel: "Lichess username" },
  efootball: { name: "eFootball", format: "bracket", handle: "efootballId", handleLabel: "eFootball ID" },
  eafc: { name: "EA SPORTS FC", format: "bracket", handle: "eafcId", handleLabel: "EA FC ID" },
};
