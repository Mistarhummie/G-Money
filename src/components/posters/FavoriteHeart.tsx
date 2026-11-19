"use client";

import { useEffect, useState } from "react";

const KEY = "gm-favorites";
const EVENT = "gm-favorites-change";

export function readFavorites(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeFavorites(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Private mode or blocked storage: favourites just don't stick.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Favourites live in this browser only. Re-renders whenever any heart changes. */
export function useFavorites() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setIds(readFavorites());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return ids;
}

export function FavoriteHeart({ id, name }: { id: string; name: string }) {
  const ids = useFavorites();
  const on = ids.includes(id);
  const [pop, setPop] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      onClick={() => {
        const now = readFavorites();
        writeFavorites(on ? now.filter((x) => x !== id) : [...now, id]);
        setPop(true);
      }}
      onAnimationEnd={() => setPop(false)}
      className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/45 backdrop-blur transition hover:bg-black/60 active:scale-90 ${pop ? "heart-pop" : ""}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path
          d="M12 20.5s-7.5-4.4-7.5-10A4.5 4.5 0 0 1 12 7.6a4.5 4.5 0 0 1 7.5 2.9c0 5.6-7.5 10-7.5 10Z"
          fill={on ? "#f43f5e" : "none"}
          stroke={on ? "#f43f5e" : "#fff"}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
