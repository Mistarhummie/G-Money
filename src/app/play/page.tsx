import Link from "next/link";
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

/** Each game gets its own colour so the hub reads like an arcade, not a list. */
const COLOURS: Record<string, string> = {
  chessbot: "from-amber-600/40 to-stone-800/40 border-amber-400/30",
  drafts: "from-rose-600/40 to-stone-900/40 border-rose-400/30",
  bao: "from-orange-700/40 to-yellow-900/30 border-orange-400/30",
  connect4: "from-sky-600/40 to-blue-900/40 border-sky-400/30",
  snake: "from-lime-500/35 to-emerald-900/40 border-lime-400/30",
  blocks: "from-fuchsia-600/40 to-indigo-900/40 border-fuchsia-400/30",
  g2048: "from-yellow-500/35 to-orange-800/40 border-yellow-400/30",
  sudoku: "from-violet-600/40 to-slate-900/40 border-violet-400/30",
  slide: "from-teal-500/35 to-cyan-900/40 border-teal-400/30",
  pool: "from-green-700/45 to-emerald-950/40 border-green-400/30",
};

export default function GamesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Games</h1>
        <p className="text-white/70">Our own skill games. Clear a stage to unlock the next one, challenge friends, and climb the leaderboards.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ARCADE_KEYS.map((k) => {
          const g = ARCADE[k];
          return (
            <Link key={k} href={`/play/${k}`}>
              <div
                className={`group flex h-full flex-col gap-1 rounded-2xl border bg-gradient-to-br p-4 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40 ${COLOURS[k]}`}
              >
                <span className="text-4xl transition duration-300 group-hover:scale-110 group-hover:-rotate-6">{ICONS[k]}</span>
                <h2 className="font-semibold">{g.name}</h2>
                <p className="text-xs text-white/70">{g.tagline}</p>
                <p className="mt-auto pt-1 text-xs font-medium text-white/90">
                  {g.stages.length} stages{g.kind === "versus" ? " · vs computer" : ""} · play a friend
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
