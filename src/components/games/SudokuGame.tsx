"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGameFx } from "@/components/games/fx/GameFx";
import { vibrate } from "@/components/games/fx/motion";
import { PEERS, boxOf, colOf, conflicts, formatEntries, isSolvedGrid, puzzleFromSeed, rowOf, type Entry } from "@/lib/games/arcade/sudoku";
import type { GameComponentProps } from "@/lib/games/arcade/types";

/** One colour per digit, for your entries and the number pad. */
const DIGIT = ["", "#7dd3fc", "#6ee7b7", "#fde047", "#fdba74", "#f9a8d4", "#c4b5fd", "#5eead4", "#bef264", "#a5b4fc"];
const POP_GAP_MS = 1000;
const STEP_MS = 45; // a completed line lights up one cell after another

type Unit = "row" | "column" | "box";
const SWEEP: Record<Unit, string> = {
  row: "linear-gradient(90deg, rgba(251,191,36,.75), rgba(244,114,182,.75))",
  column: "linear-gradient(180deg, rgba(56,189,248,.75), rgba(167,139,250,.75))",
  box: "radial-gradient(circle, rgba(52,211,153,.8), rgba(163,230,53,.55))",
};

const unitCells = (unit: Unit, i: number) =>
  Array.from({ length: 81 }, (_, j) => j).filter((j) =>
    unit === "row" ? rowOf(j) === rowOf(i) : unit === "column" ? colOf(j) === colOf(i) : boxOf(j) === boxOf(i),
  );

/** A unit holds 1–9 exactly once. */
const complete = (grid: number[], cells: number[]) => new Set(cells.map((j) => grid[j]).filter(Boolean)).size === 9;

type Sweep = { id: number; unit: Unit; delays: Map<number, number> };

export default function SudokuGame({ seed, stage, onFinish }: GameComponentProps) {
  const fx = useGameFx();
  const { givens, solution } = useMemo(() => puzzleFromSeed(seed, stage), [seed, stage]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  // Pencil marks: a bitmask of digits per cell. Browser only, never sent.
  const [notes, setNotes] = useState<number[]>(() => new Array(81).fill(0));
  const [sweeps, setSweeps] = useState<Sweep[]>([]);
  // Entries (by index) that clashed with a peer when made: their digit shakes instead of popping in.
  const [clashes, setClashes] = useState<Set<number>>(() => new Set());
  const finished = useRef(false);
  const lastPop = useRef(0);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const grid = useMemo(() => {
    const g = givens.slice();
    for (const [r, c, d] of entries) g[r * 9 + c] = d;
    return g;
  }, [givens, entries]);
  const bad = useMemo(() => conflicts(grid), [grid]);
  const solved = isSolvedGrid(grid, solution);

  function finish(list: Entry[]) {
    if (finished.current) return;
    finished.current = true;
    onFinish(formatEntries(list));
  }

  function say(text: string, opts: Parameters<typeof fx.pop>[1]) {
    const now = performance.now();
    if (now - lastPop.current < POP_GAP_MS) return;
    lastPop.current = now;
    fx.pop(text, opts);
  }

  /** Colour sweeps and popups for the row, column and box that `cell` just completed. */
  function celebrate(g: number[], cell: number, digit: number) {
    const done = (["row", "column", "box"] as Unit[]).filter((u) => complete(g, unitCells(u, cell)));
    if (done.length) {
      const made = done.map((unit) => {
        const cells = unitCells(unit, cell);
        // Light up outward from the cell just filled.
        const dist = (j: number) =>
          unit === "row"
            ? Math.abs(colOf(j) - colOf(cell))
            : unit === "column"
              ? Math.abs(rowOf(j) - rowOf(cell))
              : Math.max(Math.abs(rowOf(j) - rowOf(cell)), Math.abs(colOf(j) - colOf(cell)));
        return { id: nextId.current++, unit, delays: new Map(cells.map((j) => [j, dist(j) * STEP_MS])) };
      });
      setSweeps((s) => [...s, ...made]);
      const ids = new Set(made.map((m) => m.id));
      timers.current.push(window.setTimeout(() => setSweeps((s) => s.filter((x) => !ids.has(x.id))), 1100));
      vibrate(done.length > 1 ? [15, 30, 15] : 12);
    }
    if (isSolvedGrid(g, solution)) return; // the finish is celebrated by the game page
    if (done.length === 3) {
      say("Triple!", { tone: "great", emoji: "🌈", sub: "Row, column and box complete" });
      fx.confetti(25);
    } else if (done.length === 2) {
      say("Double complete!", { tone: "great", emoji: "⚡", sub: `${done[0][0].toUpperCase()}${done[0].slice(1)} and ${done[1]}` });
    } else if (done.length === 1) {
      say(`${done[0][0].toUpperCase()}${done[0].slice(1)} complete!`, { tone: "good", emoji: done[0] === "box" ? "📦" : "✅" });
    } else if (g.filter((v) => v === digit).length === 9 && !g.some((v, j) => v === digit && PEERS[j].some((k) => g[k] === digit))) {
      say(`All the ${digit}s are in`, { tone: "info", emoji: "🎯" });
    }
  }

  function enter(digit: number) {
    if (selected === null || givens[selected] || solved) return;
    if (notesMode && digit) {
      if (grid[selected]) return;
      setNotes((ns) => ns.map((m, i) => (i === selected ? m ^ (1 << digit) : m)));
      return;
    }
    if (grid[selected] === digit) {
      if (!digit) setNotes((ns) => ns.map((m, i) => (i === selected ? 0 : m))); // erase clears marks
      return; // no change, not a move
    }
    const next: Entry[] = [...entries, [rowOf(selected), colOf(selected), digit]];
    setEntries(next);
    if (digit) {
      // Clear this cell's marks and the same mark from its peers.
      const peers = new Set(PEERS[selected]);
      setNotes((ns) => ns.map((m, i) => (i === selected ? 0 : peers.has(i) ? m & ~(1 << digit) : m)));
    }
    const g = grid.slice();
    g[selected] = digit;
    if (digit && PEERS[selected].some((j) => g[j] === digit)) {
      // Clashes with a digit in the same row, column or box: the cell shakes.
      setClashes((s) => new Set(s).add(next.length - 1));
      vibrate([25, 40, 25]);
    } else if (digit) celebrate(g, selected, digit);
    if (isSolvedGrid(g, solution)) finish(next);
  }

  // Keyboard: digits, Backspace/Delete/0 to clear, arrows to move, N for notes.
  const enterRef = useRef(enter);
  useEffect(() => {
    enterRef.current = enter;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= "1" && e.key <= "9") enterRef.current(Number(e.key));
      else if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") enterRef.current(0);
      else if (e.key === "n" || e.key === "N") setNotesMode((v) => !v);
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        setSelected((s) => {
          const cur = s ?? 40;
          let [r, c] = [rowOf(cur), colOf(cur)];
          if (e.key === "ArrowUp") r = (r + 8) % 9;
          if (e.key === "ArrowDown") r = (r + 1) % 9;
          if (e.key === "ArrowLeft") c = (c + 8) % 9;
          if (e.key === "ArrowRight") c = (c + 1) % 9;
          return r * 9 + c;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selDigit = selected !== null ? grid[selected] : 0;
  const filled = grid.filter(Boolean).length;
  // How many of each digit are placed, to dim finished digits on the pad.
  const counts = new Array(10).fill(0);
  for (const v of grid) counts[v]++;
  // The latest entry for each cell, so a digit animates once when it is placed and not on every render.
  const stamp = new Map<number, number>();
  entries.forEach(([r, c], k) => stamp.set(r * 9 + c, k));

  return (
    <div className={`mx-auto flex w-full flex-col gap-3 select-none ${fx.fullscreen ? "max-w-[max(300px,calc(100dvh-20rem))]" : "max-w-[400px]"}`}>
      <style>{`
        @keyframes sdk-pop { 0% { transform: scale(.2); opacity: 0 } 60% { transform: scale(1.22); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes sdk-shake { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-18%) } 40% { transform: translateX(15%) }
          60% { transform: translateX(-10%) } 80% { transform: translateX(5%) } }
        @keyframes sdk-flash { 0% { background: rgba(244,63,94,.65) } 100% { background: transparent } }
        @keyframes sdk-sweep { 0% { opacity: 0; transform: scale(.6) } 35% { opacity: 1; transform: scale(1) } 100% { opacity: 0; transform: scale(1) } }
        @media (prefers-reduced-motion: reduce) { .sdk-anim { animation: none !important } }
      `}</style>
      <div className="flex justify-between text-sm text-white/70">
        <span>
          {entries.length} moves · <span className="text-sky-300">{filled}/81</span>
        </span>
        <button type="button" className="underline disabled:opacity-40" onClick={() => finish(entries)} disabled={solved}>
          Give up
        </button>
      </div>

      <div className="@container grid aspect-square grid-cols-9 overflow-hidden rounded-xl border-2 border-indigo-300/50 bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-950 shadow-[0_10px_40px_-10px_rgba(99,102,241,0.5)]">
        {grid.map((v, i) => {
          const r = rowOf(i);
          const c = colOf(i);
          const given = givens[i] !== 0;
          const isSel = selected === i;
          const related = selected !== null && (rowOf(selected) === r || colOf(selected) === c || boxOf(selected) === boxOf(i));
          const same = v !== 0 && v === selDigit;
          const isBad = bad.has(i);
          const tint = boxOf(i) % 2 === 0 ? "bg-white/[0.045]" : "";
          const bg = isSel ? "bg-sky-400/35" : isBad ? "bg-rose-500/25" : same ? "bg-sky-400/20" : related ? "bg-white/10" : tint;
          const borders = `${c % 3 === 2 && c < 8 ? "border-r-2 border-r-indigo-300/50" : c < 8 ? "border-r border-r-white/10" : ""} ${
            r % 3 === 2 && r < 8 ? "border-b-2 border-b-indigo-300/50" : r < 8 ? "border-b border-b-white/10" : ""
          }`;
          const k = stamp.get(i) ?? -1;
          const shaking = clashes.has(k);
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              aria-label={`Row ${r + 1} column ${c + 1}${v ? `, ${v}` : ", empty"}`}
              className={`relative flex items-center justify-center text-[length:min(6.2cqw,2.6rem)] ${given ? "font-bold" : "font-semibold"} ${bg} ${borders} ${
                isSel ? "shadow-[inset_0_0_0_2px_rgba(125,211,252,0.9)]" : ""
              }`}
            >
              {sweeps.map((s) =>
                s.delays.has(i) ? (
                  <span
                    key={s.id}
                    className="sdk-anim pointer-events-none absolute inset-0"
                    style={{ background: SWEEP[s.unit], animation: `sdk-sweep 600ms ease-out ${s.delays.get(i)}ms both` }}
                  />
                ) : null,
              )}
              {shaking && <span key={k} className="sdk-anim pointer-events-none absolute inset-0" style={{ animation: "sdk-flash 600ms ease-out both" }} />}
              {v ? (
                <span
                  key={`${v}-${k}`}
                  className={`sdk-anim relative ${isBad ? "text-rose-300" : given ? "text-white" : ""}`}
                  style={{
                    color: !isBad && !given ? DIGIT[v] : undefined,
                    textShadow: !isBad && !given ? `0 0 10px ${DIGIT[v]}66` : undefined,
                    animation: given ? undefined : shaking ? "sdk-shake 380ms ease-in-out" : "sdk-pop 260ms cubic-bezier(.34,1.56,.64,1)",
                  }}
                >
                  {v}
                </span>
              ) : notes[i] ? (
                <span className="relative grid h-full w-full grid-cols-3 p-px text-[length:min(2.4cqw,0.95rem)] leading-none text-white/55">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                    <span key={d} className="flex items-center justify-center" style={notes[i] & (1 << d) ? { color: DIGIT[d] } : undefined}>
                      {notes[i] & (1 << d) ? d : ""}
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => enter(d)}
            className={`rounded-xl py-2.5 text-xl font-bold shadow-md transition active:scale-90 ${notesMode ? "bg-white/10" : "text-slate-900"} ${
              counts[d] >= 9 ? "opacity-35" : ""
            }`}
            style={notesMode ? { color: DIGIT[d] } : { background: `linear-gradient(160deg, ${DIGIT[d]}, ${DIGIT[d]}aa)` }}
          >
            {d}
          </button>
        ))}
        <button type="button" onClick={() => enter(0)} className="rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white/80 active:scale-90">
          Erase
        </button>
      </div>
      <button
        type="button"
        onClick={() => setNotesMode((v) => !v)}
        className={`rounded-xl border py-2 text-sm font-semibold ${
          notesMode ? "border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200" : "border-white/10 bg-white/5 text-white/70"
        }`}
      >
        ✏️ Pencil notes: {notesMode ? "on" : "off"}
      </button>
      {solved && <p className="text-center font-semibold text-emerald-300">Solved!</p>}
    </div>
  );
}
