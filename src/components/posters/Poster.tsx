import Link from "next/link";
import { POSTER_ART, POSTER_THEME, type PosterKey } from "./art";
import { FavoriteHeart } from "./FavoriteHeart";

export type PosterItem = {
  /** Unique id, also used for favourites. */
  id: string;
  href?: string;
  art: PosterKey;
  /** Big lettering on the poster. */
  title: string;
  /** Name and line under the poster. */
  name: string;
  sub?: string;
  badge?: "HOT" | "NEW" | "LIVE" | "SOON" | "OPEN" | "DONE";
  /** Small line on the poster, e.g. a prize. */
  ribbon?: string;
};

const BADGE: Record<NonNullable<PosterItem["badge"]>, string> = {
  HOT: "bg-gradient-to-r from-rose-500 to-fuchsia-600",
  NEW: "bg-gradient-to-r from-emerald-400 to-teal-500 !text-navy",
  LIVE: "bg-gradient-to-r from-emerald-400 to-teal-500 !text-navy",
  SOON: "bg-white/20 backdrop-blur",
  OPEN: "bg-gradient-to-r from-violet-500 to-violet-700",
  DONE: "bg-black/50",
};

/** A portrait game poster: big art, heavy title, a badge and a favourite heart. */
export function Poster({ item, favorite = true, className = "" }: { item: PosterItem; favorite?: boolean; className?: string }) {
  const Art = POSTER_ART[item.art];
  const theme = POSTER_THEME[item.art];
  const body = (
    <>
      <div className="poster-art relative aspect-[3/4] overflow-hidden rounded-2xl ring-1 ring-white/10" style={{ background: theme.bg }}>
        <div
          className="absolute -right-1/4 -top-1/4 h-3/4 w-3/4 rounded-full opacity-50 blur-2xl"
          style={{ background: theme.light }}
          aria-hidden
        />
        <div className="poster-figure absolute inset-x-[6%] top-[6%] h-[64%]">
          <Art />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/25 to-transparent" aria-hidden />
        <div className="absolute inset-x-2 bottom-[13%] text-center">
          {item.ribbon && <p className="mb-0.5 font-display text-[10px] font-extrabold uppercase tracking-wider text-white/85">{item.ribbon}</p>}
          <p className="poster-title font-display text-[clamp(1.05rem,4.4vw,1.4rem)] font-black uppercase leading-[0.95] text-white">{item.title}</p>
        </div>
        {item.badge && (
          <span
            className={`absolute bottom-[4%] left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 font-display text-[10px] font-black tracking-wider text-white shadow-lg ${BADGE[item.badge]}`}
          >
            {item.badge}
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-white">{item.name}</p>
      {item.sub && <p className="truncate text-xs text-white/55">{item.sub}</p>}
    </>
  );
  return (
    <div className={`poster relative ${className}`}>
      {item.href ? (
        <Link href={item.href} className="block rounded-2xl">
          {body}
        </Link>
      ) : (
        <div aria-disabled>{body}</div>
      )}
      {favorite && <FavoriteHeart id={item.id} name={item.name} />}
    </div>
  );
}

/** A titled, sideways-scrolling row of posters, like a shelf. */
export function PosterRow({ title, icon, items, id }: { title: string; icon?: React.ReactNode; items: PosterItem[]; id?: string }) {
  if (items.length === 0) return null;
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-3 flex items-center gap-2 text-xl">
        {icon}
        {title}
      </h2>
      <div className="poster-row reveal -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0">
        {items.map((item) => (
          <Poster key={item.id} item={item} className="w-[38%] shrink-0 snap-start sm:w-[150px]" />
        ))}
      </div>
    </section>
  );
}
