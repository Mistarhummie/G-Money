"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ArcadeKey, PvpBoardProps } from "@/lib/games/arcade/types";

const loading = () => <div className="aspect-square animate-pulse rounded-2xl bg-white/5" />;

/** Two-player boards for the turn-based games. Race games reuse the normal game screen. */
export const PVP_COMPONENTS: Partial<Record<ArcadeKey, ComponentType<PvpBoardProps>>> = {
  chessbot: dynamic(() => import("./ChessbotPvp"), { ssr: false, loading }),
  drafts: dynamic(() => import("./DraftsPvp"), { ssr: false, loading }),
  bao: dynamic(() => import("./BaoPvp"), { ssr: false, loading }),
  connect4: dynamic(() => import("./Connect4Pvp"), { ssr: false, loading }),
  pool: dynamic(() => import("./PoolPvp"), { ssr: false, loading }),
};
