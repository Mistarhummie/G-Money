import { invalid, type ArcadeGame } from "./types";

// Placeholder until the game is built.
export const blocks: ArcadeGame = {
  key: "blocks",
  name: "Block Stacker",
  tagline: "Clear lines as the blocks fall faster.",
  howToPlay: "Coming soon.",
  kind: "solo",
  ranking: "score",
  scoreLabel: "points",
  stages: [
    { name: "Level 1", goal: "To be decided" },
    { name: "Level 2", goal: "To be decided" },
    { name: "Level 3", goal: "To be decided" },
    { name: "Level 4", goal: "To be decided" },
    { name: "Level 5", goal: "To be decided" },
  ],
  timeLimitMs: 30 * 60 * 1000,
  verify() {
    return invalid("Not built yet");
  },
};
