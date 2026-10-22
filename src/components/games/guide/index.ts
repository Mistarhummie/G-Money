import type { ArcadeKey } from "@/lib/games/arcade/types";
import type { Guide } from "./types";

/** Guides load only when someone opens one, so they don't slow down the game. */
export const GUIDES: Record<ArcadeKey, () => Promise<{ default: Guide }>> = {
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
};
