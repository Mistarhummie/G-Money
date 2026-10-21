/**
 * Our own games. Each game's rules live in one module shared by the browser and the server:
 * the browser plays, the server replays the player's input from the same seed to decide the result.
 * Nothing the browser says about its own score is trusted.
 */

export const ARCADE_KEYS = ["chessbot", "drafts", "bao", "connect4", "snake", "blocks", "g2048", "sudoku", "slide", "pool"] as const;
export type ArcadeKey = (typeof ARCADE_KEYS)[number];

export type Stage = {
  name: string;
  /** What the player must do to clear the stage, e.g. "Beat the computer" or "Reach 1024". */
  goal: string;
};

export type Verdict = {
  /** False when the input could not have come from honest play (illegal moves, wrong format). */
  valid: boolean;
  /** The stage goal was met (puzzle solved, computer beaten, target reached). */
  cleared: boolean;
  /** Points, or moves for "time" games. Higher is better for "score" ranking. */
  score: number;
  /** Valid, but suspicious enough for the admin to look at (e.g. faster than a person can play). */
  flagged: boolean;
  detail?: string;
};

export type VerifyArgs = { seed: number; stage: number; input: string; elapsedMs: number };

export type ArcadeGame = {
  key: ArcadeKey;
  name: string;
  tagline: string;
  howToPlay: string;
  /** "versus" games are played against the computer; the computer gets stronger each stage. */
  kind: "solo" | "versus";
  /** How tournaments rank players: best score (ties: faster), or fastest clear (ties: fewer moves). */
  ranking: "score" | "time";
  scoreLabel: string;
  stages: Stage[];
  /** A session left open longer than this no longer counts. */
  timeLimitMs: number;
  verify(args: VerifyArgs): Verdict;
};

/** Props every game's browser component takes. */
export type GameComponentProps = {
  seed: number;
  /** 1-based stage number. */
  stage: number;
  /** Called once when the game is over (won, lost or given up), with everything the server needs to replay it. */
  onFinish: (input: string) => void;
};

export const invalid = (detail: string): Verdict => ({ valid: false, cleared: false, score: 0, flagged: false, detail });
