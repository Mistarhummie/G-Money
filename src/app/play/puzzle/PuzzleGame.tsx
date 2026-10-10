"use client";

import { useEffect, useState, useTransition } from "react";
import { boardFromSeed, isSolved, moveForTile, applyMove, type Board } from "@/lib/games/puzzle15";
import { startPuzzleAction, submitPuzzleAction } from "../../actions";

type Result = { solved: boolean; timeMs: number; moveCount: number; flagged: boolean };

export function PuzzleGame({ tournamentId }: { tournamentId: string | null }) {
  const [attempt, setAttempt] = useState<{ id: string; startedAt: number } | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [moves, setMoves] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!attempt || result) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [attempt, result]);

  function start() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await startPuzzleAction(tournamentId);
      if ("error" in res) return setError(res.error);
      setBoard(boardFromSeed(res.seed));
      setMoves("");
      setAttempt({ id: res.attemptId, startedAt: Date.now() });
      setNow(Date.now());
    });
  }

  function tap(index: number) {
    if (!board || !attempt || result || pending) return;
    const move = moveForTile(board, index);
    if (!move) return;
    const next = applyMove(board, move)!;
    const allMoves = moves + move;
    setBoard(next);
    setMoves(allMoves);
    if (isSolved(next)) {
      startTransition(async () => {
        const res = await submitPuzzleAction(attempt.id, allMoves);
        if ("error" in res) setError(res.error);
        else setResult(res);
      });
    }
  }

  const elapsed = attempt ? ((result ? result.timeMs : now - attempt.startedAt) / 1000).toFixed(1) : "0.0";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between font-mono text-lg">
        <span>⏱ {elapsed}s</span>
        <span>{moves.length} moves</span>
      </div>

      <div className="grid aspect-square grid-cols-4 gap-2 rounded-2xl bg-black/30 p-2 select-none">
        {(board ?? Array.from({ length: 16 }, () => -1)).map((v, i) =>
          v === 0 ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => tap(i)}
              disabled={!attempt || !!result}
              className="rounded-xl bg-emerald-500/90 text-2xl font-bold text-emerald-950 transition active:scale-95 disabled:bg-white/10 disabled:text-white/30"
            >
              {v > 0 ? v : ""}
            </button>
          ),
        )}
      </div>

      {result && (
        <div className={`rounded-xl p-3 text-center ${result.solved && !result.flagged ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
          {result.solved
            ? `Solved in ${(result.timeMs / 1000).toFixed(2)}s with ${result.moveCount} moves.`
            : "That attempt didn't count (too slow or not solved)."}
          {result.flagged && " It was flagged for review because it was faster than humanly possible."}
        </div>
      )}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      {(!attempt || result) && (
        <button onClick={start} disabled={pending} className="btn-primary">
          {pending ? "Loading…" : attempt ? "Play again" : "Start"}
        </button>
      )}
    </div>
  );
}
