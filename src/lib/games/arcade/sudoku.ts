import { invalid, type ArcadeGame } from "./types";

// Placeholder until the game is built.
export const sudoku: ArcadeGame = {
  key: "sudoku",
  name: "Sudoku",
  tagline: "Fill the grid, against the clock.",
  howToPlay: "Coming soon.",
  kind: "solo",
  ranking: "time",
  scoreLabel: "seconds",
  stages: [
    { name: "Easy", goal: "To be decided" },
    { name: "Medium", goal: "To be decided" },
    { name: "Hard", goal: "To be decided" },
    { name: "Expert", goal: "To be decided" },
  ],
  timeLimitMs: 30 * 60 * 1000,
  verify() {
    return invalid("Not built yet");
  },
};
