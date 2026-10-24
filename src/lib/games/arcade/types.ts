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
  /** Turn-based games two people can play against each other. Solo games use head-to-head races instead. */
  pvp?: PvpRules;
};

/** Props every game's browser component takes. */
export type GameComponentProps = {
  seed: number;
  /** 1-based stage number. */
  stage: number;
  /** Called once when the game is over (won, lost or given up), with everything the server needs to replay it. */
  onFinish: (input: string) => void;
  /**
   * Live progress while playing (food eaten, lines cleared, score, tiles home, cells filled), higher is
   * further along. Shown to the other player in a race; display only, never trusted for the result.
   * Games may call it on every change: the runner throttles what it sends.
   */
  onProgress?: (p: { score: number; detail?: string }) => void;
};

export const invalid = (detail: string): Verdict => ({ valid: false, cleared: false, score: 0, flagged: false, detail });

// ---------------------------------------------------------------- player vs player

/** Where a two-player game stands after replaying its moves. Sides are 0 (moves first) and 1. */
export type PvpState = {
  /** Side to move next (for pool, the side at the table). Meaningless once over. */
  turn: 0 | 1;
  over: boolean;
  /** null while playing, or for a draw. */
  winner: 0 | 1 | null;
  /** Short result text, e.g. "Checkmate", "Draw by repetition". */
  detail?: string;
};

/**
 * Rules for two people playing each other. The server stores only the move list and checks every
 * new move by replaying the whole game, so both players always see the same position.
 */
export type PvpRules = {
  /** Replays the moves from the starting position for `seed`. Returns null if any move is illegal or comes after the end. */
  replay(seed: number, moves: string[]): PvpState | null;
  /** Longest a single move string may be. */
  maxMoveLength: number;
};

/** Props for a game's two-player board. The page polls the server and passes the latest moves. */
export type PvpBoardProps = {
  seed: number;
  moves: string[];
  /** Which side this viewer plays; null for spectators. */
  mySide: 0 | 1 | null;
  names: [string, string];
  /** Sends a move; only called on the viewer's own turn. The board shows it optimistically. */
  onMove: (move: string) => void;
  /** True while a move is being sent or the game is over. */
  disabled: boolean;
};
