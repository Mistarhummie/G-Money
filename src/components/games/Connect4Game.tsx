"use client";

import type { GameComponentProps } from "@/lib/games/arcade/types";

// Placeholder until the game is built.
export default function Connect4Game({ onFinish }: GameComponentProps) {
  return (
    <div className="rounded-2xl bg-black/30 p-6 text-center text-white/70">
      Coming soon.
      <button type="button" className="mt-3 block w-full underline" onClick={() => onFinish("")}>
        Leave
      </button>
    </div>
  );
}
