import { describe, expect, it } from "vitest";
import { conflicts, formatEntries, parseEntries, puzzleFromSeed, STAGES, sudoku, type Entry } from "@/lib/games/arcade/sudoku";

/** Fills every empty cell with its solution digit, in reading order. */
function honestEntries(seed: number, stage: number): Entry[] {
  const { givens, solution } = puzzleFromSeed(seed, stage);
  const out: Entry[] = [];
  for (let i = 0; i < 81; i++) if (!givens[i]) out.push([Math.floor(i / 9), i % 9, solution[i]]);
  return out;
}

describe("sudoku", () => {
  it("is deterministic per seed and stage", () => {
    expect(puzzleFromSeed(1234, 2)).toEqual(puzzleFromSeed(1234, 2));
    expect(puzzleFromSeed(1234, 2).givens).not.toEqual(puzzleFromSeed(1235, 2).givens);
  });

  it("builds valid grids with the stage's clue count (expert: lowest reached)", () => {
    for (let stage = 1; stage <= STAGES.length; stage++) {
      for (let seed = 1; seed <= 20; seed++) {
        const { givens, solution } = puzzleFromSeed(seed * 101, stage);
        expect(conflicts(solution).size).toBe(0);
        expect(solution.every((v) => v >= 1 && v <= 9)).toBe(true);
        expect(givens.every((v, i) => v === 0 || v === solution[i])).toBe(true);
        const clues = givens.filter(Boolean).length;
        if (stage < 4) expect(clues).toBe(STAGES[stage - 1].clues);
        else expect(clues).toBeLessThanOrEqual(28);
      }
    }
  });

  it("verifies an honest solve as cleared, scored by entries", () => {
    const entries = honestEntries(42, 3);
    // A wrong entry that is later corrected, plus a clear: all count as moves.
    const [r, c, d] = entries[0];
    const all: Entry[] = [[r, c, d === 9 ? 1 : d + 1], [r, c, 0], ...entries];
    const v = sudoku.verify({ seed: 42, stage: 3, input: formatEntries(all), elapsedMs: 600_000 });
    expect(v).toMatchObject({ valid: true, cleared: true, score: all.length, flagged: false });
  });

  it("does not clear an unfinished or wrong grid", () => {
    const entries = honestEntries(7, 1);
    expect(sudoku.verify({ seed: 7, stage: 1, input: formatEntries(entries.slice(1)), elapsedMs: 600_000 }).cleared).toBe(false);
    expect(sudoku.verify({ seed: 7, stage: 1, input: "", elapsedMs: 1000 })).toMatchObject({ valid: true, cleared: false, score: 0 });
  });

  it("flags inhumanly fast solving", () => {
    const entries = honestEntries(9, 1);
    expect(sudoku.verify({ seed: 9, stage: 1, input: formatEntries(entries), elapsedMs: 3000 }).flagged).toBe(true);
  });

  it("rejects junk and changes to givens", () => {
    for (const input of ["hello", "0 0", "9 0 1", "0 0 10", "1 2 3;;", "1,2,3"]) {
      expect(sudoku.verify({ seed: 1, stage: 1, input, elapsedMs: 60_000 }).valid).toBe(false);
    }
    const { givens } = puzzleFromSeed(1, 1);
    const g = givens.findIndex(Boolean);
    expect(sudoku.verify({ seed: 1, stage: 1, input: `${Math.floor(g / 9)} ${g % 9} 0`, elapsedMs: 60_000 }).valid).toBe(false);
    expect(sudoku.verify({ seed: 1, stage: 1, input: Array(2001).fill("0 0 1").join(";"), elapsedMs: 60_000 }).valid).toBe(false);
    expect(parseEntries(" 0 3 5; 8 8 0 ")).toEqual([[0, 3, 5], [8, 8, 0]]);
  });

  it("generates and verifies quickly at the hardest stage", () => {
    let worst = 0;
    for (let seed = 5000; seed < 5100; seed++) {
      // Fresh seed (not cached), maximum-length input: 2000 entries into one empty cell.
      const t = performance.now();
      const { givens } = puzzleFromSeed(seed, 4);
      const empty = givens.indexOf(0);
      const input = Array.from({ length: 2000 }, (_, i) => `${Math.floor(empty / 9)} ${empty % 9} ${i % 10}`).join(";");
      expect(sudoku.verify({ seed, stage: 4, input, elapsedMs: 3_600_000 }).valid).toBe(true);
      worst = Math.max(worst, performance.now() - t);
    }
    expect(worst).toBeLessThan(500);
  });
});
