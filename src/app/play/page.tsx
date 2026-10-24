import Link from "next/link";
import { getDb } from "@/db";
import { liveActivity, type Activity } from "@/lib/challenges";
import { ARCADE, ARCADE_KEYS } from "@/lib/games/arcade";
import { LiveCount } from "./[game]/Lobby";

export const dynamic = "force-dynamic";

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

export default async function GamesPage() {
  // Who's online is nice to have: the hub still works if the database is slow to answer.
  const activity: Record<string, Activity> = await getDb()
    .then((db) => liveActivity(db))
    .catch(() => ({}));
  const total = Object.values(activity).reduce((n, a) => n + a.waiting + a.playing, 0);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Games</h1>
        <p className="text-white/70">Our own skill games. Clear a stage to unlock the next one, play real people online, and climb the leaderboards.</p>
        {total > 0 && <p className="mt-1 text-sm text-emerald-300">{total} {total === 1 ? "player" : "players"} online right now</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link href="/play/ludo">
          <div className="group flex h-full flex-col gap-1 rounded-2xl border border-rose-400/30 bg-gradient-to-br from-rose-600/40 via-amber-500/25 to-sky-700/40 p-4 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40">
            <span className="text-4xl transition duration-300 group-hover:scale-110 group-hover:-rotate-6">🎲</span>
            <h2 className="font-semibold">Ludo</h2>
            <p className="text-xs text-white/70">Roll, race and capture: classic four-colour Ludo</p>
            <p className="mt-auto pt-1 text-xs font-medium text-white/90">5 stages · vs computer · play online</p>
          </div>
        </Link>
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
                  {g.stages.length} stages{g.kind === "versus" ? " · vs computer" : ""} · play online
                </p>
                {activity[k] && activity[k].waiting + activity[k].playing > 0 && (
                  <LiveCount waiting={activity[k].waiting} playing={activity[k].playing} className="text-[11px] text-emerald-200" />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
