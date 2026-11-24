import Link from "next/link";
import { FavoritesRow } from "@/components/posters/FavoritesRow";
import { POSTER_ART } from "@/components/posters/art";
import { PosterRow, type PosterItem } from "@/components/posters/Poster";
import { getDb } from "@/db";
import { liveActivity, type Activity } from "@/lib/challenges";
import { ARCADE, ARCADE_KEYS } from "@/lib/games/arcade";
import { LiveCount } from "./[game]/Lobby";

export const dynamic = "force-dynamic";

/** Short poster lettering where the full name is too long for a tile. */
const POSTER_TITLE: Record<string, string> = {
  chessbot: "Chess",
  connect4: "Connect 4",
  blocks: "Blocks",
  sudoku: "Sudoku",
  slide: "Slide 15",
  pool: "8-Ball",
  penalty: "Penalties",
  bricks: "Brick Blitz",
};

const BOARD = ["chessbot", "pool", "drafts", "bao", "connect4", "darts", "penalty"];
/** Default "trending" order until real play counts take over. */
const POPULAR = ["pool", "penalty", "bricks", "chessbot", "ludo", "sling", "darts", "snake", "connect4", "g2048", "bao", "drafts", "blocks", "sudoku", "slide"];

const NEW = new Set(["bricks", "sling", "darts", "penalty"]);

export default async function GamesPage() {
  // Who's online is nice to have: the hub still works if the database is slow to answer.
  const activity: Record<string, Activity> = await getDb()
    .then((db) => liveActivity(db))
    .catch(() => ({}));
  const live = (k: string) => (activity[k] ? activity[k].waiting + activity[k].playing : 0);
  const total = Object.values(activity).reduce((n, a) => n + a.waiting + a.playing, 0);

  const trendingOrder = [...POPULAR].sort((a, b) => live(b) - live(a) || POPULAR.indexOf(a) - POPULAR.indexOf(b));
  const hot = new Set(trendingOrder.slice(0, 4));

  const item = (k: string): PosterItem => {
    const badge = live(k) > 0 ? "LIVE" : NEW.has(k) ? "NEW" : hot.has(k) ? "HOT" : undefined;
    if (k === "ludo") {
      return { id: "game:ludo", href: "/play/ludo", art: "ludo", title: "Ludo", name: "Ludo", sub: "2–4 players · online", badge };
    }
    const g = ARCADE[k as keyof typeof ARCADE];
    return {
      id: `game:${k}`,
      href: `/play/${k}`,
      art: k as PosterItem["art"],
      title: POSTER_TITLE[k] ?? g.name,
      name: g.name,
      sub: live(k) > 0 ? `${live(k)} online now` : `${g.stages.length} stages · vs computer`,
      badge,
    };
  };
  const all = ["ludo", ...ARCADE_KEYS].map(item);
  const byId = (k: string) => all.find((i) => i.id === `game:${k}`)!;
  const FeaturedArt = POSTER_ART.pool;

  return (
    <div className="flex flex-col gap-8">
      {/* Featured game */}
      <section className="hero animate-pop overflow-hidden rounded-3xl border border-white/10">
        <div className="hero-hex" aria-hidden />
        <div className="grid items-center gap-2 p-6 sm:grid-cols-[3fr_2fr] sm:p-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lilac">Featured game</p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-5xl">
              Line up the shot. <span className="text-gradient">Sink the 8.</span>
            </h1>
            <p className="mt-3 max-w-md text-white/80">
              Fifteen games we built ourselves. Clear a stage to unlock the next, play real people online, and climb the
              leaderboards.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href="/play/pool" className="btn-primary">Play 8-Ball Pool</Link>
              <a href="#trending" className="btn-secondary">Browse games</a>
            </div>
            <LiveCount
              waiting={Object.values(activity).reduce((n, a) => n + a.waiting, 0)}
              playing={Object.values(activity).reduce((n, a) => n + a.playing, 0)}
              className="mt-4 text-sm text-emerald-200"
            />
          </div>
          <div className="relative mx-auto hidden w-56 sm:block">
            <div className="absolute inset-6 rounded-full bg-mint/30 blur-3xl" aria-hidden />
            <div className="relative animate-[drift_9s_ease-in-out_infinite_alternate]">
              <FeaturedArt />
            </div>
          </div>
        </div>
      </section>

      <FavoritesRow items={all} />
      <PosterRow id="trending" title="Trending" icon={<span aria-hidden>🔥</span>} items={trendingOrder.map(byId)} />
      <PosterRow title="Board and table games" icon={<span aria-hidden>♟️</span>} items={["ludo", ...BOARD].map(byId)} />
      <PosterRow
        title="Arcade and puzzles"
        icon={<span aria-hidden>🕹️</span>}
        items={ARCADE_KEYS.filter((k) => !BOARD.includes(k)).map(byId)}
      />

      <section className="reveal grid gap-3 text-sm sm:grid-cols-3">
        {[
          ["🎯", "Stages to clear", "Every game starts easy. Clear a stage to unlock the next, all the way to the hardest."],
          ["⚡", "Play people online", `Press Play online in any game to get matched in seconds.${total > 0 ? ` ${total} playing right now.` : ""}`],
          ["🏆", "Weekly leaderboards", "Play every level of a game against the clock and top the week's board."],
        ].map(([icon, title, text]) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-4">
            <p className="text-2xl" aria-hidden>{icon}</p>
            <h3 className="mt-2 text-base">{title}</h3>
            <p className="mt-1 text-white/70">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
