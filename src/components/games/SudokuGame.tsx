"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PEERS, boxOf, colOf, conflicts, formatEntries, isSolvedGrid, puzzleFromSeed, rowOf, type Entry } from "@/lib/games/arcade/sudoku";
import type { GameComponentProps } from "@/lib/games/arcade/types";

export default function SudokuGame({ seed, stage, onFinish }: GameComponentProps) {
  const { givens, solution } = useMemo(() => puzzleFromSeed(seed, stage), [seed, stage]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  // Pencil marks: a bitmask of digits per cell. Browser only, never sent.
  const [notes, setNotes] = useState<number[]>(() => new Array(81).fill(0));
  const finished = useRef(false);

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

  return (
    <div className="mx-auto flex w-full max-w-[360px] flex-col gap-3 select-none">
      <div className="flex justify-between text-sm text-white/70">
        <span>
          {entries.length} moves · {filled}/81
        </span>
        <button type="button" className="underline disabled:opacity-40" onClick={() => finish(entries)} disabled={solved}>
          Give up
        </button>
      </div>

      <div className="grid aspect-square grid-cols-9 overflow-hidden rounded-xl border-2 border-white/40 bg-black/30">
        {grid.map((v, i) => {
          const r = rowOf(i);
          const c = colOf(i);
          const given = givens[i] !== 0;
          const isSel = selected === i;
          const related =
            selected !== null && (rowOf(selected) === r || colOf(selected) === c || boxOf(selected) === boxOf(i));
          const same = v !== 0 && v === selDigit;
          const bg = isSel ? "bg-emerald-500/40" : same ? "bg-emerald-500/25" : related ? "bg-white/10" : "";
          const color = bad.has(i) ? "text-red-400" : given ? "text-white" : "text-emerald-300";
          const borders = `${c % 3 === 2 && c < 8 ? "border-r-2 border-r-white/40" : c < 8 ? "border-r border-r-white/10" : ""} ${
            r % 3 === 2 && r < 8 ? "border-b-2 border-b-white/40" : r < 8 ? "border-b border-b-white/10" : ""
          }`;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              aria-label={`Row ${r + 1} column ${c + 1}${v ? `, ${v}` : ", empty"}`}
              className={`relative flex items-center justify-center text-lg sm:text-xl ${given ? "font-bold" : "font-medium"} ${bg} ${color} ${borders}`}
            >
              {v ? (
                v
              ) : notes[i] ? (
                <span className="grid h-full w-full grid-cols-3 p-px text-[8px] leading-none text-white/50">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                    <span key={d} className="flex items-center justify-center">
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
            className={`rounded-xl py-2.5 text-xl font-bold transition active:scale-95 ${
              notesMode ? "bg-white/10 text-white/80" : "bg-emerald-500/90 text-emerald-950"
            } ${counts[d] >= 9 ? "opacity-40" : ""}`}
          >
            {d}
          </button>
        ))}
        <button type="button" onClick={() => enter(0)} className="rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white/80 active:scale-95">
          Erase
        </button>
      </div>
      <button
        type="button"
        onClick={() => setNotesMode((v) => !v)}
        className={`rounded-xl border py-2 text-sm font-semibold ${
          notesMode ? "border-emerald-400 bg-emerald-500/20 text-emerald-300" : "border-white/10 bg-white/5 text-white/70"
        }`}
      >
        Pencil notes: {notesMode ? "on" : "off"}
      </button>
      {solved && <p className="text-center font-semibold text-emerald-300">Solved!</p>}
    </div>
  );
}
