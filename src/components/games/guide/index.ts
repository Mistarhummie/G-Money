import type { ArcadeKey } from "@/lib/games/arcade/types";
import type { Guide } from "./types";

/** Every game with a guide: our staged games, plus Ludo (which has its own pages). */
export type GuideKey = ArcadeKey | "ludo";

/** Guides load only when someone opens one, so they don't slow down the game. */
export const GUIDES: Record<GuideKey, () => Promise<{ default: Guide }>> = {
  chessbot: () => import("./chessbot"),
  drafts: () => import("./drafts"),
  bao: () => import("./bao"),
  connect4: () => import("./connect4"),
  snake: () => import("./snake"),
  blocks: () => import("./blocks"),
  g2048: () => import("./g2048"),
  sudoku: () => import("./sudoku"),
  slide: () => import("./slide"),
  pool: () => import("./pool"),
  ludo: () => import("./ludo"),
};
