import { desc, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { PosterRow, type PosterItem } from "@/components/posters/Poster";
import { POSTER_ART } from "@/components/posters/art";
import { getDb } from "@/db";
import { entries, tournaments, type Tournament } from "@/db/schema";
import { gameName, kes, nairobiTime } from "@/components/ui";

function artFor(game: Tournament["game"]): PosterItem["art"] {
  if (game === "chess") return "chessbot";
  if (game === "efootball" || game === "eafc") return "football";
  return game as PosterItem["art"];
}

function prizeLine(t: Tournament) {
  if (t.prizeProductId) return "Gift card prize";
  if (t.sponsoredPrizeKes > 0) return `Prize ${kes(t.sponsoredPrizeKes)}`;
  return t.entryType === "free" ? "Free entry" : `Entry ${kes(t.entryFeeKes)}`;
}

/** Shown only while there are no open or live tournaments, so the page never looks empty. Not joinable. */
const COMING_SOON: PosterItem[] = [
  { id: "soon:efootball", art: "football", title: "eFootball Cup", ribbon: "Gift card prize", name: "eFootball Weekend Cup", sub: "Knockout · 32 players", badge: "SOON" },
  { id: "soon:chess", art: "chessbot", title: "Chess Blitz", ribbon: "Free entry", name: "Friday Chess Blitz", sub: "Lichess · 5 min games", badge: "SOON" },
  { id: "soon:pool", art: "pool", title: "8-Ball Kings", ribbon: "Gift card prize", name: "8-Ball Kings", sub: "Leaderboard · 3 days", badge: "SOON" },
  { id: "soon:eafc", art: "football", title: "EA FC Clash", ribbon: "Free entry", name: "EA FC Clash", sub: "Knockout · 16 players", badge: "SOON" },
  { id: "soon:snake", art: "snake", title: "Snake Sprint", ribbon: "Top score wins", name: "Snake Sprint", sub: "Leaderboard · 24 hours", badge: "SOON" },
  { id: "soon:bao", art: "bao", title: "Bao Masters", ribbon: "Free entry", name: "Bao Masters", sub: "Leaderboard · 1 week", badge: "SOON" },
];

export default async function TournamentsPage() {
  const db = await getDb();
  const list = await db
    .select({
      t: tournaments,
      players: sql<number>`(select count(*)::int from ${entries} where ${entries.tournamentId} = ${tournaments.id})`,
    })
    .from(tournaments)
    .where(inArray(tournaments.status, ["open", "running", "completed"]))
    .orderBy(sql`case ${tournaments.status} when 'running' then 0 when 'open' then 1 else 2 end`, desc(tournaments.startsAt))
    .limit(30);

  const toItem = ({ t, players }: (typeof list)[number]): PosterItem => ({
    id: `tournament:${t.id}`,
    href: `/tournaments/${t.id}`,
    art: artFor(t.game),
    title: t.title,
    ribbon: prizeLine(t),
    name: t.title,
    sub:
      t.status === "completed"
        ? `${gameName(t)} · finished`
        : `${gameName(t)} · ${players}/${t.maxPlayers} · ${nairobiTime(t.startsAt)}`,
    badge: t.status === "running" ? "LIVE" : t.status === "open" ? "OPEN" : "DONE",
  });
  const live = list.filter((r) => r.t.status === "running").map(toItem);
  const open = list.filter((r) => r.t.status === "open").map(toItem);
  const done = list.filter((r) => r.t.status === "completed").map(toItem);
  const Trophy = POSTER_ART.trophy;

  return (
    <div className="flex flex-col gap-8">
      <section className="hero animate-pop overflow-hidden rounded-3xl border border-white/10">
        <div className="hero-hex" aria-hidden />
        <div className="grid items-center gap-2 p-6 sm:grid-cols-[3fr_2fr] sm:p-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lilac">Tournaments</p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-5xl">
              Compete. Climb. <span className="text-gradient">Win prizes.</span>
            </h1>
            <p className="mt-3 max-w-md text-white/80">
              Skill tournaments for eFootball, EA FC, chess and our own games. Entry is free for now, and some prizes are paid as
              gift cards.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={open.length ? "#open" : "#soon"} className="btn-primary">See tournaments</a>
              <Link href="/play" className="btn-secondary">Practise first</Link>
            </div>
          </div>
          <div className="relative mx-auto hidden w-52 sm:block">
            <div className="absolute inset-8 rounded-full bg-amber-300/30 blur-3xl" aria-hidden />
            <div className="relative animate-[drift_9s_ease-in-out_infinite_alternate]">
              <Trophy />
            </div>
          </div>
        </div>
      </section>

      <PosterRow id="live" title="Live now" icon={<span className="h-2.5 w-2.5 animate-pulse rounded-full bg-mint" aria-hidden />} items={live} />
      <PosterRow id="open" title="Open for entries" icon={<span aria-hidden>🔥</span>} items={open} />
      {live.length + open.length === 0 && (
        <div id="soon" className="scroll-mt-20">
          <PosterRow title="Coming soon" icon={<span aria-hidden>📅</span>} items={COMING_SOON} />
          <p className="mt-1 text-xs text-white/50">Examples of what&apos;s coming. Dates and prizes are announced when entries open.</p>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-xl">How tournaments work</h2>
        <ol className="reveal grid gap-3 text-sm sm:grid-cols-4">
          {[
            ["1", "Pick a tournament", "Choose a game you're good at. Check the format, start time and prize."],
            ["2", "Join", "Add your game ID (Lichess, eFootball or EA FC) or just play ours. Entry is free for now."],
            ["3", "Play your matches", "Knockouts pair you up each round. Leaderboards count your best score."],
            ["4", "Collect your prize", "Winners get their prize after results are checked, often as a gift card."],
          ].map(([n, title, text]) => (
            <li key={n} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-4">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 font-display font-black">
                {n}
              </span>
              <h3 className="mt-3 text-base">{title}</h3>
              <p className="mt-1 text-white/70">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <PosterRow id="finished" title="Finished" icon={<span aria-hidden>🏁</span>} items={done} />

      <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-violet-600/20 to-mint/10 p-5 text-sm text-white/80">
        <h3 className="text-base text-white">Fair play</h3>
        <p className="mt-1">
          Every result is checked. Our own games replay your moves on the server, so scores can&apos;t be faked. If you disagree with a
          result, raise a dispute from the match page and we&apos;ll look at the evidence.
        </p>
      </section>
    </div>
  );
}
