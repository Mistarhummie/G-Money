"use client";

import { ActionForm } from "@/components/ActionForm";
import { confirmScoreAction, disputeScoreAction, reportScoreAction, submitChessAction } from "../../actions";

type Props = {
  match: {
    id: string;
    status: string;
    scoreA: number | null;
    scoreB: number | null;
    reportedByMe: boolean;
    nameA: string;
    nameB: string;
    disputed: boolean;
  };
  game: string;
  path: string;
};

export function MatchActions({ match: m, game, path }: Props) {
  if (game === "chess") {
    if (m.status !== "pending") return <p className="text-sm text-white/70">Result recorded.</p>;
    return (
      <ActionForm action={submitChessAction.bind(null, m.id, path)} submitLabel="Submit game">
        <p className="text-sm text-white/70">
          Play a rated or casual game on Lichess against your opponent, then paste the game link. We read the result straight from
          Lichess.
        </p>
        <input name="gameLink" placeholder="https://lichess.org/abcd1234" required className="input" />
      </ActionForm>
    );
  }

  if (m.status === "pending") {
    return (
      <ActionForm action={reportScoreAction.bind(null, m.id, path)} submitLabel="Report final score">
        <ScoreInputs nameA={m.nameA} nameB={m.nameB} required />
        <label className="label">
          Screenshot of the final score
          <input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" required className="input" />
        </label>
      </ActionForm>
    );
  }

  if (m.status === "awaiting_confirmation") {
    const summary = `${m.nameA} ${m.scoreA} – ${m.scoreB} ${m.nameB}`;
    if (m.reportedByMe) {
      return <p className="text-sm text-white/80">You reported {summary}. Waiting for your opponent (accepted automatically after 30 minutes).</p>;
    }
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-white/80">
          Your opponent reported <strong>{summary}</strong>. Confirm it, or dispute it within 30 minutes. If you do nothing it is
          accepted.
        </p>
        <ActionForm action={confirmScoreAction.bind(null, m.id, path)} submitLabel="Confirm result" />
        <details className="rounded-xl border border-white/10 p-3">
          <summary className="cursor-pointer text-sm text-red-300">That&apos;s wrong, dispute it</summary>
          <ActionForm action={disputeScoreAction.bind(null, m.id, path)} submitLabel="Send dispute" buttonClassName="btn-danger" className="mt-3 flex flex-col gap-3">
            <label className="label">
              What happened?
              <textarea name="reason" required minLength={5} className="input" rows={3} />
            </label>
            <ScoreInputs nameA={m.nameA} nameB={m.nameB} />
            <label className="label">
              Your screenshot
              <input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" className="input" />
            </label>
            <p className="text-xs text-white/50">False disputes count against your record.</p>
          </ActionForm>
        </details>
      </div>
    );
  }

  if (m.status === "disputed") {
    return <p className="text-sm text-white/80">This result is disputed. An admin is reviewing the evidence.</p>;
  }
  return null;
}

function ScoreInputs({ nameA, nameB, required }: { nameA: string; nameB: string; required?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="label">
        {nameA}
        <input name="scoreA" type="number" min={0} max={99} required={required} className="input" />
      </label>
      <label className="label">
        {nameB}
        <input name="scoreB" type="number" min={0} max={99} required={required} className="input" />
      </label>
    </div>
  );
}
