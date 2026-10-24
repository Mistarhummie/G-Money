import Link from "next/link";
import { Card } from "@/components/ui";
import { ComputerPicker, InviteForm, QuickMatch } from "@/components/games/ludo/LudoLobby";
import { LUDO_COLOURS } from "@/components/games/ludo/colours";
import { getDb } from "@/db";
import { LUDO_HOW, LUDO_STAGES } from "@/lib/ludo/meta";
import { seatColours } from "@/lib/ludo/rules";
import { ludoProgressOf, ludoTopPlayers, ludoUnlocked, myLudoGames, openLudoTables } from "@/lib/ludo/service";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ludo · G-Money" };

function SeatDots({ size, filled }: { size: number; filled: number }) {
  return (
    <span className="inline-flex gap-1 align-middle">
      {seatColours(size).map((c, i) => (
        <span
          key={c}
          className={`inline-block h-3 w-3 rounded-full ring-1 ring-black/40 ${i < filled ? "" : "opacity-25"}`}
          style={{ background: LUDO_COLOURS[c].main }}
        />
      ))}
    </span>
  );
}

export default async function LudoPage() {
  const db = await getDb();
  const user = await getCurrentUser();
  const unlocked = user ? await ludoUnlocked(db, user.id) : 1;
  const progress = user ? await ludoProgressOf(db, user.id) : [];
  const mine = user ? await myLudoGames(db, user) : { playing: [], invites: [] };
  const open = (await openLudoTables(db)).filter((g) => !user || !g.seats.some((s) => s.userId === user.id));
  const top = await ludoTopPlayers(db, unlocked);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div>
        <Link href="/play" className="text-sm text-white/60 hover:text-white">← All games</Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <span className="inline-flex -space-x-1.5">
            {LUDO_COLOURS.map((c, i) => (
              <span key={i} className="inline-block h-5 w-5 rounded-full ring-2 ring-[#07130e]" style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${c.light} 25%, ${c.main} 60%, ${c.dark})` }} />
            ))}
          </span>
          Ludo
        </h1>
        <p className="text-sm text-white/70">{LUDO_HOW}</p>
        <p className="mt-1 text-xs text-white/50">Free to play, just for fun. Ludo has dice, so it isn&apos;t part of prize tournaments.</p>
      </div>

      {(mine.playing.length > 0 || mine.invites.length > 0) && (
        <Card className="border-emerald-400/30">
          <h2 className="mb-2 font-semibold">Your games</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {mine.playing.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2">
                <span>
                  {g.mode === "computer" ? `vs computer · stage ${g.stage}` : g.isPrivate ? "Friends' table" : "Online table"}
                  <span className="text-white/50"> · {g.status === "waiting" ? "waiting for players" : "in play"}</span>
                </span>
                <Link href={`/play/ludo/${g.id}`} className="text-emerald-300 underline">
                  {g.status === "waiting" ? "Open" : "Resume"}
                </Link>
              </li>
            ))}
            {mine.invites.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2">
                <span>
                  <span className="text-amber-200">Invite</span> from {g.seats.find((s) => s.userId === g.hostId)?.name ?? "a friend"}{" "}
                  <SeatDots size={g.size} filled={g.seats.filter((s) => s.userId).length} />
                </span>
                <Link href={`/play/ludo/${g.id}`} className="text-emerald-300 underline">View</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/15 via-sky-500/10 to-fuchsia-500/10 p-4">
        <div>
          <h2 className="font-semibold">Play online</h2>
          <p className="text-xs text-white/60">
            Sit at a table with real people. It starts when the table is full. 30 seconds a turn.
          </p>
        </div>
        <QuickMatch signedIn={!!user} />
        {open.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-semibold">Open tables</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {open.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2">
                  <span>
                    {g.seats.find((s) => s.userId === g.hostId)?.name ?? "Player"}&apos;s table{" "}
                    <SeatDots size={g.size} filled={g.seats.filter((s) => s.userId).length} />
                  </span>
                  <Link href={`/play/ludo/${g.id}`} className="text-emerald-300 underline">Join</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Card>
        <h2 className="font-semibold">Play the computer</h2>
        <p className="mb-3 text-sm text-white/60">Finish first to clear a stage. The computers get smarter each stage.</p>
        <ComputerPicker unlocked={unlocked} signedIn={!!user} />
      </Card>

      <Card>
        <h2 className="font-semibold">Invite friends</h2>
        <p className="mb-3 text-sm text-white/60">Make a private table, then send friends the link or invite them by username.</p>
        {user ? <InviteForm /> : <Link href="/login?next=/play/ludo" className="text-sm text-emerald-300 underline">Sign in to make a table</Link>}
      </Card>

      {progress.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Your best</h2>
          <ul className="text-sm">
            {progress.map((p) => (
              <li key={p.stage} className="flex justify-between">
                <span>
                  {p.clearedAt ? "✅" : "⬜"} Stage {p.stage}: {LUDO_STAGES[p.stage - 1]?.name}
                </span>
                <span className="font-mono">
                  {p.wins}/{p.played} won{p.bestRolls != null ? ` · ${p.bestRolls} rolls` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">Top players, stage {unlocked}</h2>
        {top.length === 0 ? (
          <p className="text-sm text-white/60">Nobody has won this stage yet. Be the first.</p>
        ) : (
          <ol className="text-sm">
            {top.map((r, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  <span className="mr-2 text-white/50">{i + 1}.</span>
                  {r.username ?? "Player"}
                </span>
                <span className="font-mono">
                  {r.wins} {r.wins === 1 ? "win" : "wins"}
                  {r.bestRolls != null ? ` · best ${r.bestRolls} rolls` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
