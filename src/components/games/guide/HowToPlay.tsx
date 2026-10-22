"use client";

import { useEffect, useState } from "react";
import type { ArcadeKey, Stage } from "@/lib/games/arcade/types";
import { GUIDES } from ".";
import type { Guide } from "./types";

type Props = {
  game: ArcadeKey;
  name: string;
  stages: Stage[];
  /** How two-player matches work for this game. */
  pvp: "turns" | "race";
  /** Opens by itself the first time this player opens this game. */
  autoOpen?: boolean;
};

const seenKey = (game: string) => `gm-guide-seen-${game}`;

/** A "How to play" button and the guide it opens. Rendered inside the game frame so it also works in full screen. */
export function HowToPlay({ game, name, stages, pvp, autoOpen = true }: Props) {
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState<Guide | null>(null);

  useEffect(() => {
    if (!autoOpen) return;
    let seen = true;
    try {
      seen = !!localStorage.getItem(seenKey(game));
    } catch {
      // Storage blocked: just don't auto-open.
    }
    if (seen) return;
    // A short pause so the page appears first and the guide slides in over it.
    const timer = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(timer);
  }, [game, autoOpen]);

  useEffect(() => {
    if (!open || guide) return;
    let live = true;
    GUIDES[game]().then((m) => live && setGuide(m.default));
    return () => {
      live = false;
    };
  }, [open, guide, game]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(seenKey(game), "1");
    } catch {
      // ignore
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-200 hover:bg-sky-500/20"
      >
        ? How to play
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`How to play ${name}`}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-gradient-to-b from-[#10263a] to-[#0a1712] shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <h2 className="text-lg font-bold">How to play {name}</h2>
              <button type="button" onClick={close} className="rounded-lg px-2 py-1 text-white/70 hover:bg-white/10" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-sm leading-relaxed text-white/85">
              {!guide ? (
                <p className="py-10 text-center text-white/50">Loading…</p>
              ) : (
                <div className="flex flex-col gap-5">
                  <p className="text-base text-white">{guide.intro}</p>
                  {guide.sections.map((s, i) => (
                    <section key={i} className="flex flex-col gap-2">
                      <h3 className="font-semibold text-emerald-300">
                        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-xs">{i + 1}</span>
                        {s.title}
                      </h3>
                      {Array.isArray(s.body) ? (
                        <ul className="ml-4 list-disc space-y-1 marker:text-emerald-400">
                          {s.body.map((b, j) => (
                            <li key={j}>{b}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>{s.body}</p>
                      )}
                      {s.picture && (
                        <figure className="rounded-2xl border border-white/10 bg-black/25 p-3">
                          <div className="mx-auto max-w-xs">{s.picture}</div>
                          {s.caption && <figcaption className="mt-2 text-center text-xs text-white/60">{s.caption}</figcaption>}
                        </figure>
                      )}
                    </section>
                  ))}
                  <section className="flex flex-col gap-2">
                    <h3 className="font-semibold text-amber-300">Stages</h3>
                    <ol className="space-y-1">
                      {stages.map((st, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-mono text-white/50">{i + 1}.</span>
                          <span>
                            <strong>{st.name}:</strong> {st.goal}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="text-white/60">Clear a stage to unlock the next one.</p>
                  </section>
                  <section className="flex flex-col gap-2">
                    <h3 className="font-semibold text-fuchsia-300">Playing a friend</h3>
                    <p>
                      {pvp === "turns"
                        ? "Challenge a friend by username, or post an open challenge, from the game page. You take turns on the same board and have 2 minutes for each move; running out of time loses the game. You can resign at any time."
                        : "Challenge a friend by username, or post an open challenge, from the game page. You both get exactly the same board and one try each, within an hour of the match starting. The better result wins."}
                    </p>
                  </section>
                  {guide.tips && guide.tips.length > 0 && (
                    <section className="flex flex-col gap-2 rounded-2xl bg-emerald-500/10 p-3">
                      <h3 className="font-semibold text-emerald-200">💡 Tips</h3>
                      <ul className="ml-4 list-disc space-y-1">
                        {guide.tips.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </div>
            <div className="border-t border-white/10 p-3">
              <button type="button" onClick={close} className="btn-primary w-full">
                Got it, let&apos;s play
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
