"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { ludoCreateTableAction, ludoQuickMatchAction, startLudoComputerAction } from "@/app/ludo-actions";
import { LUDO_STAGES } from "@/lib/ludo/meta";
import { LUDO_COLOURS } from "./colours";

function Choice({ value, options, onChange, label, render }: { value: number; options: number[]; onChange: (n: number) => void; label: string; render: (n: number) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          className={`rounded-full border px-3 py-1 text-sm transition ${value === n ? "border-emerald-400 bg-emerald-500/20" : "border-white/15 hover:bg-white/5"}`}
        >
          {render(n)}
        </button>
      ))}
    </div>
  );
}

/** Little coloured tokens showing how many seats a choice fills. */
function Seats({ n }: { n: number }) {
  const colours = n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3];
  return (
    <span className="ml-1 inline-flex -space-x-1 align-middle">
      {colours.map((c) => (
        <span key={c} className="inline-block h-3 w-3 rounded-full ring-1 ring-black/40" style={{ background: LUDO_COLOURS[c].main }} />
      ))}
    </span>
  );
}

/** vs computer: stage, number of opponents, start. */
export function ComputerPicker({ unlocked, signedIn }: { unlocked: number; signedIn: boolean }) {
  const [stage, setStage] = useState(unlocked);
  const [opponents, setOpponents] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const go = () =>
    startTransition(async () => {
      setError(null);
      const res = await startLudoComputerAction(stage, opponents);
      if (res?.error) setError(res.error);
    });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {LUDO_STAGES.map((s, i) => {
          const n = i + 1;
          const locked = n > unlocked;
          return (
            <button
              key={n}
              type="button"
              disabled={locked}
              onClick={() => setStage(n)}
              className={`rounded-full border px-3 py-1 text-sm ${stage === n ? "border-emerald-400 bg-emerald-500/20" : "border-white/15"} disabled:opacity-40`}
              title={locked ? `Clear stage ${n - 1} to unlock` : s.goal}
            >
              {locked ? "🔒 " : ""}
              {n}. {s.name}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-white/70">
        <strong>Stage {stage}:</strong> {LUDO_STAGES[stage - 1].goal}
      </p>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-white/70">Opponents</span>
        <Choice value={opponents} options={[1, 2, 3]} onChange={setOpponents} label="Computer opponents" render={(n) => `${n} 🤖`} />
      </div>
      {signedIn ? (
        <button className="btn-primary py-3 text-base font-bold" disabled={pending} onClick={go}>
          {pending ? "Setting up the board…" : `🎲 Play stage ${stage}`}
        </button>
      ) : (
        <Link href="/login?next=/play/ludo" className="btn-primary py-3 text-center text-base font-bold">
          Sign in to play
        </Link>
      )}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}

/** Play online: join a waiting table of this size or open one. */
export function QuickMatch({ signedIn }: { signedIn: boolean }) {
  const [size, setSize] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const go = () =>
    startTransition(async () => {
      setError(null);
      const res = await ludoQuickMatchAction(size);
      if (res?.error) setError(res.error);
    });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-white/70">Players</span>
        <Choice
          value={size}
          options={[2, 3, 4]}
          onChange={setSize}
          label="Players at the table"
          render={(n) => `${n}`}
        />
        <Seats n={size} />
      </div>
      {signedIn ? (
        <button className="btn-primary py-3 text-base font-bold" disabled={pending} onClick={go}>
          {pending ? "Finding a table…" : `⚡ Play online · ${size} players`}
        </button>
      ) : (
        <Link href="/login?next=/play/ludo" className="btn-primary py-3 text-center text-base font-bold">
          Sign in to play online
        </Link>
      )}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}

/** A private table: invite friends by username and share the link. */
export function InviteForm() {
  const [state, action, pending] = useActionState(ludoCreateTableAction, undefined);
  const [size, setSize] = useState(4);
  return (
    <form action={action} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="size" value={size} />
      <div className="flex items-center gap-3">
        <span className="text-white/70">Seats</span>
        <Choice value={size} options={[2, 3, 4]} onChange={setSize} label="Seats at the table" render={(n) => `${n}`} />
        <Seats n={size} />
      </div>
      <label className="label">
        Friends&apos; usernames (optional, separated by commas)
        <input name="invite" className="input" placeholder="e.g. otieno, wanjiku" autoComplete="off" />
      </label>
      <button className="btn-secondary" disabled={pending}>
        {pending ? "Making the table…" : "Make a table and get a link"}
      </button>
      {state?.error && <p className="text-red-400">{state.error}</p>}
    </form>
  );
}
