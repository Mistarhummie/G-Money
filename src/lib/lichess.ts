/** Reads finished chess games from the public Lichess API so chess results need no self-reporting. */

export type LichessGame = {
  id: string;
  createdAt: number;
  status: string;
  winner?: "white" | "black";
  players: {
    white: { user?: { name: string } };
    black: { user?: { name: string } };
  };
};

export type FetchGame = (gameId: string) => Promise<LichessGame | null>;

export const fetchLichessGame: FetchGame = async (gameId) => {
  const res = await fetch(`https://lichess.org/game/export/${encodeURIComponent(gameId)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lichess returned ${res.status}`);
  return (await res.json()) as LichessGame;
};

/** Accepts a bare game id or a lichess.org game link. Returns the 8-character game id. */
export function parseLichessGameId(input: string): string | null {
  const match = input.trim().match(/(?:lichess\.org\/)?([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:[/?#].*)?$/);
  return match ? match[1] : null;
}

export type ChessCheck =
  | { ok: true; winnerUsername: string }
  | { ok: false; reason: string };

export function checkChessGame(
  game: LichessGame,
  usernameA: string,
  usernameB: string,
  notBefore: Date,
): ChessCheck {
  const white = game.players.white.user?.name?.toLowerCase();
  const black = game.players.black.user?.name?.toLowerCase();
  const a = usernameA.toLowerCase();
  const b = usernameB.toLowerCase();
  const samePlayers = (white === a && black === b) || (white === b && black === a);
  if (!samePlayers) return { ok: false, reason: "That game was not played between the two players in this match." };
  if (game.createdAt < notBefore.getTime()) return { ok: false, reason: "That game was played before this match opened." };
  if (!game.winner) {
    return { ok: false, reason: game.status === "started" ? "That game is still in progress." : "That game was a draw. Play again." };
  }
  const winner = game.winner === "white" ? game.players.white.user!.name : game.players.black.user!.name;
  return { ok: true, winnerUsername: winner };
}
