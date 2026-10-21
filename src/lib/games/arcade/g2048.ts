import { invalid, type ArcadeGame } from "./types";

// Placeholder until the game is built.
export const g2048: ArcadeGame = {
  key: "g2048",
  name: "2048",
  tagline: "Merge tiles to reach the target.",
  howToPlay: "Coming soon.",
  kind: "solo",
  ranking: "score",
  scoreLabel: "points",
  stages: [
    { name: "512", goal: "To be decided" },
    { name: "1024", goal: "To be decided" },
    { name: "2048", goal: "To be decided" },
    { name: "4096", goal: "To be decided" },
  ],
  timeLimitMs: 30 * 60 * 1000,
  verify() {
    return invalid("Not built yet");
  },
};
