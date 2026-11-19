"use client";

import { useFavorites } from "./FavoriteHeart";
import { PosterRow, type PosterItem } from "./Poster";

/** "Your favourites": the posters this browser has hearted, in the order they were hearted. */
export function FavoritesRow({ items }: { items: PosterItem[] }) {
  const ids = useFavorites();
  const picked = ids.map((id) => items.find((i) => i.id === id)).filter((i): i is PosterItem => !!i);
  return <PosterRow title="Your favourites" icon={<span aria-hidden>❤️</span>} items={picked} />;
}
