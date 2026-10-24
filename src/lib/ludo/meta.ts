import type { Stage } from "@/lib/games/arcade/types";

/** vs-computer stages: the computers get stronger each stage. Clear a stage by finishing first. */
export const LUDO_STAGES: (Stage & { level: number })[] = [
  { name: "Beginner", goal: "Finish first. The computers move at random.", level: 1 },
  { name: "Casual", goal: "Finish first. The computers like getting out and getting home.", level: 2 },
  { name: "Hunter", goal: "Finish first. The computers capture whenever they can.", level: 3 },
  { name: "Clever", goal: "Finish first. The computers use safe squares and avoid danger.", level: 4 },
  { name: "Master", goal: "Finish first. The computers capture, run from danger and never waste a roll.", level: 5 },
];

export const LUDO_NAME = "Ludo";
export const LUDO_TAGLINE = "Roll, race and capture: classic four-colour Ludo";
export const LUDO_HOW =
  "Roll a 6 to bring a token out, race it round the board and up your home column. Land on an opponent to send them home. First to get all four tokens home wins.";

/** Seconds a person has to roll or move in an online game before the server plays for them. */
export const TURN_SECONDS = 30;
/** Missed turns in a row before a computer takes over the seat. */
export const MAX_MISSED = 3;
/** How long the computer waits before rolling, and between its roll and its move, so everyone can follow. */
export const BOT_ROLL_MS = 1300;
export const BOT_MOVE_MS = 1100;
