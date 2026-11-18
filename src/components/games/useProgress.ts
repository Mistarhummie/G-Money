"use client";

import { useEffect, useRef } from "react";
import type { GameComponentProps } from "@/lib/games/arcade/types";

/** Reports a game's live progress whenever it changes, once the game is under way. */
export function useReportProgress(onProgress: GameComponentProps["onProgress"], active: boolean, score: number, detail?: string) {
  const ref = useRef(onProgress);
  useEffect(() => {
    ref.current = onProgress;
  });
  useEffect(() => {
    if (active) ref.current?.({ score, detail });
  }, [active, score, detail]);
}
