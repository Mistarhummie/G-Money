"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ArcadeKey, GameComponentProps } from "@/lib/games/arcade/types";

/** Board width over height for games that aren't square (used for fullscreen). */
export const GAME_ASPECT: Partial<Record<ArcadeKey, number>> = { bao: 1.8, sling: 1.6, penalty: 1.5 };
export const aspectOf = (game: ArcadeKey) => GAME_ASPECT[game] ?? 1;

const loading = () => <div className="aspect-square animate-pulse rounded-2xl bg-white/5" />;

/** Each game's code only downloads when someone opens that game. */
export const GAME_COMPONENTS: Record<ArcadeKey, ComponentType<GameComponentProps>> = {
  chessbot: dynamic(() => import("./ChessGame"), { ssr: false, loading }),
  drafts: dynamic(() => import("./DraftsGame"), { ssr: false, loading }),
  bao: dynamic(() => import("./BaoGame"), { ssr: false, loading }),
  connect4: dynamic(() => import("./Connect4Game"), { ssr: false, loading }),
  snake: dynamic(() => import("./SnakeGame"), { ssr: false, loading }),
  blocks: dynamic(() => import("./BlocksGame"), { ssr: false, loading }),
  g2048: dynamic(() => import("./Game2048"), { ssr: false, loading }),
  sudoku: dynamic(() => import("./SudokuGame"), { ssr: false, loading }),
  slide: dynamic(() => import("./SlideGame"), { ssr: false, loading }),
  pool: dynamic(() => import("./PoolGame"), { ssr: false, loading }),
  bricks: dynamic(() => import("./BricksGame"), { ssr: false, loading }),
  sling: dynamic(() => import("./SlingGame"), { ssr: false, loading }),
  darts: dynamic(() => import("./DartsGame"), { ssr: false, loading }),
  penalty: dynamic(() => import("./PenaltyGame"), { ssr: false, loading }),
};
