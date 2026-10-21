import { invalid, type ArcadeGame } from "./types";

// Placeholder until the game is built.
export const snake: ArcadeGame = {
  key: "snake",
  name: "Snake",
  tagline: "Eat, grow, don't crash. Faster every stage.",
  howToPlay: "Coming soon.",
  kind: "solo",
  ranking: "score",
  scoreLabel: "points",
  stages: [
    { name: "Garden", goal: "To be decided" },
    { name: "Walls", goal: "To be decided" },
    { name: "Fast", goal: "To be decided" },
    { name: "Maze", goal: "To be decided" },
    { name: "Lightning", goal: "To be decided" },
  ],
  timeLimitMs: 30 * 60 * 1000,
  verify() {
    return invalid("Not built yet");
  },
};
