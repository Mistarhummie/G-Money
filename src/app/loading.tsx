/** Shown while a page's data loads: a shimmering outline of a page, so taps feel instant. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-40 rounded-3xl sm:h-56" />
      <div className="skeleton h-6 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-2xl border border-white/5 p-3">
            <div className="skeleton aspect-[16/10] w-full" />
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
