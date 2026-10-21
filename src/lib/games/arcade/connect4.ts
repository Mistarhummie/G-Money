import { invalid, type ArcadeGame } from "./types";

// Placeholder until the game is built.
export const connect4: ArcadeGame = {
  key: "connect4",
  name: "Connect Four",
  tagline: "Get four in a row before the computer does.",
  howToPlay: "Coming soon.",
  kind: "versus",
  ranking: "score",
  scoreLabel: "points",
  stages: [
    { name: "Beginner", goal: "To be decided" },
    { name: "Novice", goal: "To be decided" },
    { name: "Club", goal: "To be decided" },
    { name: "Strong", goal: "To be decided" },
    { name: "Master", goal: "To be decided" },
  ],
  timeLimitMs: 30 * 60 * 1000,
  verify() {
    return invalid("Not built yet");
  },
};
