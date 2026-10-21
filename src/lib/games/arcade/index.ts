import { chessbot } from "./chessbot";
import { drafts } from "./drafts";
import { bao } from "./bao";
import { connect4 } from "./connect4";
import { snake } from "./snake";
import { blocks } from "./blocks";
import { g2048 } from "./g2048";
import { sudoku } from "./sudoku";
import { slide } from "./slide";
import { pool } from "./pool";
import type { ArcadeGame, ArcadeKey } from "./types";

export * from "./types";

/** Our own games, in the order they are shown. */
export const ARCADE: Record<ArcadeKey, ArcadeGame> = { chessbot, drafts, bao, connect4, snake, blocks, g2048, sudoku, slide, pool };

export function isArcadeKey(key: string): key is ArcadeKey {
  return key in ARCADE;
}
