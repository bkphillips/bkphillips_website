"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tests } from "@/components/tastemap/tests";
import {
  affinities,
  decodeFactors,
  genresOf,
  placeVisitor,
  posterUrl,
  predicted,
  similarity,
  type TasteData,
} from "@/lib/tastemap";
import { rgba, useThemeColors } from "@/lib/use-theme-colors";
import { useWidth } from "@/lib/use-width";

const RECOMMENDATIONS = 8;
const COLORS = ["accent", "ink", "faint", "signal"] as const;

export function TasteExplorer() {
  const [data, setData] = useState<TasteData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/data/tastemap.json")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((d: TasteData) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-muted">
        The film data could not be loaded. Reload the page to try again.
      </p>
    );
  }
  if (!data) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-muted">
        Loading 3,000 films…
      </p>
    );
  }
  // The map mounts only once the data is in, so that its frame exists when
  // the width tracker starts watching it.
  return <Explorer data={data} />;
}

function Poster({
  path,
  title,
  className,
}: {
  path: string | null;
  title: string;
  className: string;
}) {
  if (!path) {
    return (
      <div
        className={`grid place-items-center bg-line/60 p-1 text-center text-[0.6rem] leading-tight text-muted ${className}`}
      >
        {title}
      </div>
    );
  }
  return (
    // Posters come straight from TMDB's image server. Next's image optimizer
    // would copy them through this site, which TMDB's terms do not call for.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={posterUrl(path)}
      alt=""
      loading="lazy"
      className={`bg-line/60 object-cover ${className}`}
    />
  );
}

function Stars({
  title,
  value,
  onRate,
}: {
  title: string;
  value: number | undefined;
  onRate: (stars: number | null) => void;
}) {
  return (
    <div className="flex" role="group" aria-label={`Rate ${title}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
          aria-pressed={value === n}
          onClick={() => onRate(value === n ? null : n)}
          className={`px-[1.5px] text-[1.05rem] leading-none transition-colors hover:text-signal ${
            value && n <= value ? "text-signal" : "text-faint/60"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function Explorer({ data }: { data: TasteData }) {
  const { meta, films, clusters } = data;
  const [viewW, viewH] = meta.view;
  const factors = useMemo(
    () => decodeFactors(data.factors, meta.factorScale),
    [data, meta.factorScale],
  );
  const [ratings, setRatings] = useState<Map<number, number>>(new Map());
  /** Films the visitor brought into the row themselves, newest first. */
  const [added, setAdded] = useState<number[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"personal" | "safe">("personal");
  const [frame, width] = useWidth<HTMLDivElement>(660);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const colors = useThemeColors(COLORS);
  const height = Math.round((width * viewH) / viewW);

  const taste = useMemo(
    () => placeVisitor(data, factors, ratings),
    [data, factors, ratings],
  );
  const affinity = useMemo(
    () => (taste ? affinities(data, factors, taste) : null),
    [data, factors, taste],
  );

  const recommendations = useMemo(() => {
    if (!taste || !affinity) return [];
    const liked = [...ratings].filter(([, stars]) => stars >= 4);
    // "Safe" ranks by predicted rating. "Personal" ranks by how much more a
    // film suits this visitor than the average viewer, among films still
    // predicted to be good. Both are scored in the tests further down.
    const floor = data.tests.visitors.picks.personalFloor;
    return films
      .map((_, i) => ({
        film: i,
        stars: predicted(data, i, affinity[i], taste),
        match: affinity[i],
      }))
      .filter(
        (r) => !ratings.has(r.film) && (mode === "safe" || r.stars >= floor),
      )
      .sort((a, b) => (mode === "safe" ? b.stars - a.stars : b.match - a.match))
      .slice(0, RECOMMENDATIONS)
      .map((r) => {
        let because: number | null = null;
        let best = 0.35; // below this the two films are not meaningfully alike
        for (const [film] of liked) {
          const s = similarity(factors, meta.rank, r.film, film);
          if (s > best) {
            best = s;
            because = film;
          }
        }
        return { ...r, because };
      });
  }, [data, films, factors, meta.rank, ratings, taste, affinity, mode]);

  const row = useMemo(
    () => [...added, ...data.starters.filter((f) => !added.includes(f))],
    [added, data.starters],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const found: number[] = [];
    for (let i = 0; i < films.length && found.length < 8; i++) {
      if (films[i][0].toLowerCase().includes(q)) found.push(i);
    }
    return found;
  }, [films, query]);

  const rate = (film: number, stars: number | null) =>
    setRatings((old) => {
      const next = new Map(old);
      if (stars === null) next.delete(film);
      else next.set(film, stars);
      return next;
    });

  const bring = (film: number) => {
    setAdded((old) => [film, ...old.filter((f) => f !== film)]);
    setFocus(film);
    strip.current?.scrollTo({ left: 0, behavior: "smooth" });
  };

  // Dots are drawn least-suited first, so the films that suit the visitor sit on top.
  const order = useMemo(() => {
    const idx = films.map((_, i) => i);
    if (affinity) idx.sort((a, b) => affinity[a] - affinity[b]);
    return idx;
  }, [films, affinity]);
  const strong = useMemo(() => {
    if (!affinity) return 1;
    const sorted = Float32Array.from(affinity).sort();
    return Math.max(sorted[Math.floor(sorted.length * 0.97)], 0.05);
  }, [affinity]);
  const mostRated = films[0][5];
  // Dots shrink a little on narrow screens so that 3,000 of them still read.
  const dotScale = Math.max(0.55, Math.min(1, width / 660));
  const radius = (film: number) =>
    (1.3 + 3 * Math.sqrt(films[film][5] / mostRated)) * dotScale;

  useEffect(() => {
    const el = canvas.current;
    if (!el || !colors) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.round(width * ratio);
    el.height = Math.round(height * ratio);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const k = (width / viewW) * ratio;
    ctx.clearRect(0, 0, el.width, el.height);
    for (const i of order) {
      const t = affinity ? Math.min(1, Math.max(0, affinity[i] / strong)) : 0;
      ctx.fillStyle = !affinity
        ? rgba(colors.ink, 0.3)
        : t > 0.08
          ? rgba(colors.accent, 0.3 + 0.7 * t)
          : rgba(colors.faint, 0.28);
      ctx.beginPath();
      ctx.arc(
        films[i][2] * k,
        films[i][3] * k,
        radius(i) * (1 + 0.35 * t) * ratio,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    // `radius` only reads `films`, which is covered by the dependencies below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, width, height, viewW, order, affinity, strong, films]);

  const nearest = (clientX: number, clientY: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return null;
    const x = ((clientX - box.left) / box.width) * viewW;
    const y = ((clientY - box.top) / box.height) * viewH;
    const reach = (14 * viewW) / box.width; // 14 screen pixels
    let at: number | null = null;
    let best = reach * reach;
    films.forEach((f, i) => {
      const d = (f[2] - x) ** 2 + (f[3] - y) ** 2;
      if (d < best) {
        best = d;
        at = i;
      }
    });
    return at;
  };

  const unit = viewW / width; // map units per screen pixel
  const shown = hover ?? focus;
  const shownFilm = shown !== null ? films[shown] : null;
  const count = ratings.size;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <span className="font-mono text-[0.68rem] tracking-wide text-muted uppercase">
          Try a sample taste
        </span>
        {data.presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setRatings(new Map(p.ratings));
              setAdded(p.ratings.map(([film]) => film));
              setFocus(null);
              strip.current?.scrollTo({ left: 0, behavior: "smooth" });
            }}
            className="rounded-full border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-ink hover:text-ink"
          >
            {p.label}
          </button>
        ))}
        {count > 0 && (
          <button
            type="button"
            onClick={() => {
              setRatings(new Map());
              setAdded([]);
              setFocus(null);
            }}
            className="link text-sm text-muted"
          >
            Clear my ratings
          </button>
        )}
        <div className="relative ml-auto w-full sm:w-64">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a film to rate…"
            aria-label="Find a film to rate"
            className="w-full rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink placeholder:text-faint"
          />
          {matches.length > 0 && (
            <ul className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
              {matches.map((i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      bring(i);
                      setQuery("");
                    }}
                    className="flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-line/40"
                  >
                    <span className="truncate">{films[i][0]}</span>
                    <span className="font-mono text-[0.7rem] text-muted">
                      {films[i][1]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div ref={strip} className="mt-5 flex gap-3 overflow-x-auto pb-3">
        {row.map((i) => {
          const f = films[i];
          return (
            <div
              key={i}
              onMouseEnter={() => setFocus(i)}
              onMouseLeave={() => setFocus(null)}
              className={`w-[6.5rem] shrink-0 rounded-xl border p-1.5 transition-colors ${
                ratings.has(i)
                  ? "border-signal/70 bg-surface"
                  : "border-line bg-surface"
              }`}
            >
              <Poster
                path={f[7]}
                title={f[0]}
                className="aspect-[2/3] w-full rounded-lg"
              />
              <p
                className="mt-1.5 line-clamp-2 h-[2.1rem] text-[0.72rem] leading-tight"
                title={f[0]}
              >
                {f[0]}
              </p>
              <Stars
                title={f[0]}
                value={ratings.get(i)}
                onRate={(s) => rate(i, s)}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_21rem]">
        <figure className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
          <div
            ref={frame}
            className="relative cursor-crosshair touch-manipulation"
            style={{ height }}
            onPointerMove={(e) => setHover(nearest(e.clientX, e.clientY))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              const at = nearest(e.clientX, e.clientY);
              if (at !== null) bring(at);
            }}
          >
            <canvas
              ref={canvas}
              className="absolute inset-0 size-full"
              aria-hidden="true"
            />
            <svg
              viewBox={`0 0 ${viewW} ${viewH}`}
              className="pointer-events-none absolute inset-0 size-full"
              role="img"
              aria-label="Map of 3,000 films, arranged so that films liked by the same people sit together"
            >
              {recommendations.map((r) => (
                <circle
                  key={r.film}
                  cx={films[r.film][2]}
                  cy={films[r.film][3]}
                  r={(radius(r.film) + 3.5) * unit}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1.25}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {[...ratings].map(([film, stars]) => (
                <circle
                  key={film}
                  cx={films[film][2]}
                  cy={films[film][3]}
                  r={(radius(film) + 1.5) * unit}
                  fill={stars >= 4 ? "var(--signal)" : "var(--surface)"}
                  stroke="var(--signal)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {shownFilm && (
                <circle
                  cx={shownFilm[2]}
                  cy={shownFilm[3]}
                  r={(radius(shown!) + 5) * unit}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            {clusters.map((c, i) => (
              <span
                key={i}
                className="pointer-events-none absolute hidden -translate-x-1/2 -translate-y-1/2 font-mono text-[0.62rem] tracking-wide whitespace-nowrap text-ink uppercase [text-shadow:0_0_4px_var(--surface),0_0_4px_var(--surface),0_0_8px_var(--surface)] sm:block"
                style={{
                  left: `${(c.x / viewW) * 100}%`,
                  top: `${(c.y / viewH) * 100}%`,
                }}
              >
                {c.label}
              </span>
            ))}
            {shownFilm && shown !== null && (
              <div
                className="pointer-events-none absolute z-20 flex w-56 gap-2.5 rounded-xl border border-line bg-surface p-2 shadow-lg"
                style={{
                  left: `${(shownFilm[2] / viewW) * 100}%`,
                  top: `${(shownFilm[3] / viewH) * 100}%`,
                  transform: `translate(${shownFilm[2] > viewW * 0.6 ? "calc(-100% - 14px)" : "14px"}, ${
                    shownFilm[3] > viewH * 0.6 ? "calc(-100% + 10px)" : "-10px"
                  })`,
                }}
              >
                <Poster
                  path={shownFilm[7]}
                  title={shownFilm[0]}
                  className="h-[4.5rem] w-12 shrink-0 rounded-md"
                />
                <div className="min-w-0">
                  <p className="text-sm leading-tight">{shownFilm[0]}</p>
                  <p className="mt-0.5 font-mono text-[0.65rem] text-muted">
                    {shownFilm[1]} ·{" "}
                    {genresOf(shownFilm[8], data.genres).slice(0, 2).join(", ")}
                  </p>
                  <p className="mt-1 font-mono text-[0.68rem] text-ink">
                    {ratings.has(shown)
                      ? `You rated it ${ratings.get(shown)} ★`
                      : taste && affinity
                        ? `Predicted for you ${predicted(data, shown, affinity[shown], taste).toFixed(1)} ★`
                        : `Average ${shownFilm[6].toFixed(1)} ★`}
                  </p>
                </div>
              </div>
            )}
          </div>
          <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-[0.8rem] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-accent" />
              suits your taste
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-signal bg-signal" />
              you rated 4–5
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-signal" />
              you rated 1–3
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border border-ink" />
              recommended
            </span>
            <span className="ml-auto">Bigger dots have more ratings.</span>
          </figcaption>
        </figure>

        <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">Recommended for you</p>
            <div
              className="flex rounded-full border border-line p-0.5"
              role="group"
              aria-label="How to rank recommendations"
            >
              {(["personal", "safe"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-full px-2.5 py-1 text-[0.78rem] transition-colors ${
                    mode === m
                      ? "bg-ink text-paper"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {m === "personal" ? "Personal" : "Safe"}
                </button>
              ))}
            </div>
          </div>
          {count === 0 ? (
            <p className="mt-4 leading-relaxed text-muted">
              Rate a few of the films above, or pick a sample taste. Every film
              is a dot on the map; once you rate something, the map lights up
              where your taste is and this list fills in.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                From {count} {count === 1 ? "rating" : "ratings"}.
                {count < 5 && " A few more will sharpen it."}
                {taste && count >= 5 && Math.abs(taste.generosity) >= 0.15 && (
                  <>
                    {" "}
                    You rate about {Math.abs(taste.generosity).toFixed(
                      1,
                    )} stars {taste.generosity > 0 ? "higher" : "lower"} than
                    most people.
                  </>
                )}
              </p>
              <ol className="mt-4 divide-y divide-line border-y border-line">
                {recommendations.map((r) => {
                  const f = films[r.film];
                  return (
                    <li key={r.film}>
                      <button
                        type="button"
                        onMouseEnter={() => setFocus(r.film)}
                        onMouseLeave={() => setFocus(null)}
                        onClick={() => bring(r.film)}
                        className="group flex w-full gap-3 py-2.5 text-left"
                      >
                        <Poster
                          path={f[7]}
                          title={f[0]}
                          className="h-[4.1rem] w-11 shrink-0 rounded-md"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm group-hover:text-accent">
                              {f[0]}
                            </span>
                            <span className="shrink-0 font-mono text-[0.72rem] text-ink">
                              {r.stars.toFixed(1)} ★
                            </span>
                          </span>
                          <span className="block font-mono text-[0.65rem] text-muted">
                            {f[1]} ·{" "}
                            {genresOf(f[8], data.genres).slice(0, 2).join(", ")}
                          </span>
                          <span className="mt-0.5 block text-[0.75rem] leading-snug text-muted">
                            {r.because !== null
                              ? `Close to ${films[r.because][0]}, which you rated ${ratings.get(r.because)} ★`
                              : "Rated highly by people whose ratings look like yours"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-3 text-[0.75rem] leading-relaxed text-muted">
                {mode === "personal"
                  ? "Personal picks are the films that suit you more than they suit most people. "
                  : "Safe picks are the films you are most likely to rate highly, which favours famous ones. "}
                Seen one of these? Click it to add it to the row above and rate
                it.
              </p>
            </>
          )}
        </div>
      </div>

      <p className="mt-3 max-w-[80ch] text-sm leading-relaxed text-muted">
        Films sit close together when the same people tend to like them; no
        genre labels were used to place them. Squeezing {meta.rank} dimensions
        onto a flat page distorts some distances, so treat neighbourhoods as
        real and exact positions as approximate. Everything is computed in your
        browser, and your ratings are not sent anywhere.
      </p>

      <Tests data={data} />

      <p className="mt-10 max-w-[80ch] text-[0.8rem] leading-relaxed text-muted">
        Ratings come from the MovieLens 32M dataset (F. Maxwell Harper and
        Joseph A. Konstan, 2015, “The MovieLens Datasets: History and Context”,
        ACM TiiS 5, 4), used here for non-commercial purposes under its licence.
        This project is not endorsed by the University of Minnesota or the
        GroupLens Research Group. Posters are served by TMDB. This product uses
        the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  );
}
