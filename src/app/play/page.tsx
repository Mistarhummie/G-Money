import Link from "next/link";
import { Card } from "@/components/ui";
import { ARCADE, ARCADE_KEYS } from "@/lib/games/arcade";

const ICONS: Record<string, string> = {
  chessbot: "♟️",
  drafts: "⚫",
  bao: "🟤",
  connect4: "🔴",
  snake: "🐍",
  blocks: "🧱",
  g2048: "🔢",
  sudoku: "🧩",
  slide: "🔀",
  pool: "🎱",
};

export default function GamesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Games</h1>
        <p className="text-white/70">Our own skill games. Clear a stage to unlock the next one, and climb the leaderboards.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ARCADE_KEYS.map((k) => {
          const g = ARCADE[k];
          return (
            <Link key={k} href={`/play/${k}`}>
              <Card className="flex h-full flex-col gap-1 transition hover:border-emerald-400/50">
                <span className="text-3xl">{ICONS[k]}</span>
                <h2 className="font-semibold">{g.name}</h2>
                <p className="text-xs text-white/60">{g.tagline}</p>
                <p className="mt-auto pt-1 text-xs text-emerald-300">
                  {g.stages.length} stages{g.kind === "versus" ? " · vs computer" : ""}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
