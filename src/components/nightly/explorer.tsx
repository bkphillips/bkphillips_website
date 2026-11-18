"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Compare } from "@/components/nightly/compare";
import { useWidth } from "@/lib/use-width";
import {
  comboIndex,
  count,
  dollars,
  GUESTS,
  isEstimate,
  KIND_LABEL,
  percent,
  STAY_LABEL,
  type Kind,
  type NightlyData,
} from "@/lib/nightly";

const KINDS: Kind[] = ["entire", "private", "hotel"];
/** Where the map starts: a busy neighbourhood with every kind of stay. */
const START = "Williamsburg";

function Tabs<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[0.68rem] tracking-wide text-muted uppercase">
        {label}
      </p>
      <div
        className="inline-flex rounded-full border border-line p-0.5"
        role="group"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              o.value === value
                ? "bg-ink text-paper"
                : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Rgb = [number, number, number];
const hex = (v: string): Rgb => {
  const s = v.trim().replace("#", "");
  const n = parseInt(s.length === 3 ? s.replace(/./g, "$&$&") : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const blend = (a: Rgb, b: Rgb, t: number) =>
  a.map((v, i) => v + (b[i] - v) * t) as Rgb;
const mix = (a: Rgb, b: Rgb, t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

/** Reads the theme's colours, and again whenever the theme changes. */
function usePalette() {
  const [palette, setPalette] = useState<{
    low: Rgb;
    high: Rgb;
    none: Rgb;
  } | null>(null);
  useEffect(() => {
    const read = () => {
      const css = getComputedStyle(document.documentElement);
      const accent = hex(css.getPropertyValue("--accent"));
      setPalette({
        // Start a little way up the ramp so the cheapest squares still show.
        low: blend(hex(css.getPropertyValue("--accent-soft")), accent, 0.2),
        high: accent,
        none: hex(css.getPropertyValue("--line")),
      });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return palette;
}

export function NightlyExplorer() {
  const [data, setData] = useState<NightlyData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/data/nightly.json")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((d: NightlyData) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-muted">
        The price data could not be loaded. Reload the page to try again.
      </p>
    );
  }
  if (!data) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-muted">
        Loading the map…
      </p>
    );
  }
  // The map mounts only once the data is in, so that its frame exists when
  // the width tracker starts watching it.
  return <Explorer data={data} />;
}

function Explorer({ data }: { data: NightlyData }) {
  const [kind, setKind] = useState<Kind>("entire");
  const [long, setLong] = useState<0 | 1>(1);
  const [zoom, setZoom] = useState<"core" | "city">("core");
  const [guests, setGuests] = useState(2);
  const [picked, setPicked] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [frame, width] = useWidth<HTMLDivElement>(640);
  const canvas = useRef<HTMLCanvasElement>(null);
  const palette = usePalette();

  const combo = comboIndex(data.meta.combos, kind, long, guests);

  // The colour scale runs between the 5th and 95th percentile of what is on
  // the map, on a log scale, so a few very expensive blocks do not flatten it.
  const scale = useMemo(() => {
    if (combo < 0) return null;
    const mids = data.cells
      .map((c) => c[3][combo])
      .filter(isEstimate)
      .map((e) => e[1])
      .sort((a, b) => a - b);
    if (!mids.length) return null;
    const lo = mids[Math.floor(mids.length * 0.05)];
    const hi = Math.max(mids[Math.floor(mids.length * 0.95)], lo + 1);
    return {
      lo,
      hi,
      t: (v: number) =>
        Math.min(1, Math.max(0, Math.log(v / lo) / Math.log(hi / lo))),
    };
  }, [data, combo]);

  // The busiest cell of each neighbourhood for the current choice, used by
  // the neighbourhood menu and to choose where the map starts.
  const best = useMemo(() => {
    const byHood = new Map<number, { cell: number; n: number }>();
    if (combo < 0) return byHood;
    data.cells.forEach((c, i) => {
      const e = c[3][combo];
      if (!isEstimate(e)) return;
      const now = byHood.get(c[2]);
      if (!now || e[3] > now.n) byHood.set(c[2], { cell: i, n: e[3] });
    });
    return byHood;
  }, [data, combo]);

  const start = useMemo(() => {
    const home = data.hoods.findIndex((h) => h.name === START);
    return best.get(home)?.cell ?? [...best.values()][0]?.cell ?? null;
  }, [data, best]);
  const chosen = picked ?? start;

  const [viewW, viewH] = data.meta.view;
  // The closer view is the box that holds most listings, widened to a shape
  // that sits well beside the result panel.
  const region = useMemo(() => {
    const core = data.meta.core;
    if (zoom === "city" || !core) return { x: 0, y: 0, w: viewW, h: viewH };
    const h = core[3] - core[1];
    const w = Math.max(core[2] - core[0], h * 1.1);
    return { x: (core[0] + core[2]) / 2 - w / 2, y: core[1], w, h };
  }, [data, zoom, viewW, viewH]);
  const height = Math.round((width * region.h) / region.w);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !palette || combo < 0) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.round(width * ratio);
    el.height = Math.round(height * ratio);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const k = (width / region.w) * ratio;
    const size = data.meta.cellPx * k;
    ctx.clearRect(0, 0, el.width, el.height);
    for (const [cx, cy, , entries] of data.cells) {
      const x = cx - region.x;
      const y = cy - region.y;
      const e = entries[combo];
      if (isEstimate(e) && scale) {
        ctx.fillStyle = mix(palette.low, palette.high, scale.t(e[1]));
        ctx.fillRect(
          x * k - size / 2,
          y * k - size / 2,
          size + 0.5,
          size + 0.5,
        );
      } else {
        // Listings exist here, but too few like this one for an estimate.
        ctx.fillStyle = mix(palette.none, palette.none, 0);
        ctx.fillRect(
          x * k - size * 0.14,
          y * k - size * 0.14,
          size * 0.28,
          size * 0.28,
        );
      }
    }
  }, [data, palette, combo, scale, width, height, region]);

  const outlines = useMemo(
    () => data?.hoods.map((h) => h.d).join("") ?? "",
    [data],
  );

  const { meta, cells, hoods, model } = data;
  const nearest = (clientX: number, clientY: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return null;
    const x = region.x + ((clientX - box.left) / box.width) * region.w;
    const y = region.y + ((clientY - box.top) / box.height) * region.h;
    let at = -1;
    let bestD = (meta.cellPx * 1.5) ** 2;
    cells.forEach((c, i) => {
      const d = (c[0] - x) ** 2 + (c[1] - y) ** 2;
      if (d < bestD) {
        bestD = d;
        at = i;
      }
    });
    return at >= 0 ? at : null;
  };

  const chooseKind = (next: Kind) => {
    setKind(next);
    if (next === "hotel") setLong(0);
    if (!GUESTS[next].some(([v]) => v === guests)) setGuests(2);
  };

  const cell = chosen !== null ? cells[chosen] : null;
  const entry = cell?.[3][combo];
  const hood = cell ? hoods[cell[2]] : null;
  const city = data.city[combo];
  const hovered = hover !== null ? cells[hover] : null;
  const half = meta.cellPx / 2;
  const unit = region.w / width; // map units per screen pixel
  const inCore = (c: (typeof cells)[number]) =>
    !meta.core ||
    (c[0] > meta.core[0] &&
      c[0] < meta.core[2] &&
      c[1] > meta.core[1] &&
      c[1] < meta.core[3]);

  // The same spot for the other kinds of stay, to show what moves the price.
  const others: { kind: Kind; long: 0 | 1; guests: number }[] = [
    { kind: "entire", long: 0, guests: 2 },
    { kind: "entire", long: 1, guests: 2 },
    { kind: "private", long: 0, guests: 2 },
    { kind: "private", long: 1, guests: 2 },
    { kind: "hotel", long: 0, guests: 2 },
  ];
  const cov = model.coverage;
  const worst = Math.max(...model.methods.map((m) => m.medianAbs));

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <Tabs
          label="Kind of stay"
          value={kind}
          onChange={chooseKind}
          options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        />
        <Tabs
          label="Length"
          value={long}
          onChange={setLong}
          options={[
            { value: 0 as const, label: STAY_LABEL[0] },
            {
              value: 1 as const,
              label: STAY_LABEL[1],
              disabled: kind === "hotel",
            },
          ]}
        />
        <Tabs
          label="Guests"
          value={guests}
          onChange={setGuests}
          options={GUESTS[kind].map(([value, label]) => ({ value, label }))}
        />
        <label className="ml-auto block">
          <span className="mb-1.5 block font-mono text-[0.68rem] tracking-wide text-muted uppercase">
            Neighbourhood
          </span>
          <select
            className="max-w-[15rem] rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-ink"
            value={cell && best.get(cell[2])?.cell === chosen ? cell[2] : ""}
            onChange={(e) => {
              const next = best.get(Number(e.target.value));
              if (!next) return;
              setPicked(next.cell);
              if (!inCore(cells[next.cell])) setZoom("city");
            }}
          >
            <option value="" disabled>
              Jump to…
            </option>
            {hoods
              .map((h, i) => ({ h, i }))
              .filter(({ i }) => best.has(i))
              .map(({ h, i }) => (
                <option key={h.name} value={i}>
                  {h.name}, {h.borough}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_21rem]">
        <figure className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
          <div
            ref={frame}
            className="relative cursor-crosshair touch-manipulation"
            style={{ height }}
            onPointerMove={(e) => setHover(nearest(e.clientX, e.clientY))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              const at = nearest(e.clientX, e.clientY);
              if (at !== null) setPicked(at);
            }}
          >
            <canvas
              ref={canvas}
              className="absolute inset-0 size-full"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setZoom(zoom === "core" ? "city" : "core");
              }}
              className="absolute top-1 right-1 z-10 cursor-pointer rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:border-ink hover:text-ink"
            >
              {zoom === "core" ? "Show the whole city" : "Zoom in"}
            </button>
            <svg
              viewBox={`${region.x} ${region.y} ${region.w} ${region.h}`}
              className="pointer-events-none absolute inset-0 size-full"
              role="img"
              aria-label="Map of New York City shaded by predicted nightly price"
            >
              <path
                d={outlines}
                fill="none"
                stroke="var(--faint)"
                strokeWidth={0.75}
                opacity={0.6}
                vectorEffect="non-scaling-stroke"
              />
              {hood && (
                <path
                  d={hood.d}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {hovered && (
                <rect
                  x={hovered[0] - half}
                  y={hovered[1] - half}
                  width={meta.cellPx}
                  height={meta.cellPx}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {cell && (
                <g>
                  <circle
                    cx={cell[0]}
                    cy={cell[1]}
                    r={9 * unit}
                    fill="none"
                    stroke="var(--surface)"
                    strokeWidth={5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={cell[0]}
                    cy={cell[1]}
                    r={9 * unit}
                    fill="none"
                    stroke="var(--signal)"
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )}
            </svg>
            {hovered && (
              <p
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[0.68rem] whitespace-nowrap text-ink shadow-sm"
                style={{
                  left: `${((hovered[0] - region.x) / region.w) * 100}%`,
                  top: `${((hovered[1] - half - 6 * unit - region.y) / region.h) * 100}%`,
                }}
              >
                {hoods[hovered[2]]?.name}
                {isEstimate(hovered[3][combo]) &&
                  ` · ${dollars((hovered[3][combo] as number[])[1])}`}
              </p>
            )}
          </div>
          <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-1 text-sm text-muted">
            {scale && palette ? (
              <span className="flex items-center gap-2 font-mono text-[0.7rem]">
                {dollars(scale.lo)}
                <span
                  className="h-2 w-28 rounded-full"
                  style={{
                    background: `linear-gradient(to right, ${mix(palette.low, palette.high, 0)}, ${mix(palette.low, palette.high, 1)})`,
                  }}
                />
                {dollars(scale.hi)}+ a night
              </span>
            ) : (
              <span />
            )}
            <span className="flex items-center gap-2 text-[0.8rem]">
              <span className="size-1.5 rounded-[1px] bg-line" />
              too few similar listings
            </span>
          </figcaption>
        </figure>

        <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          {cell && hood ? (
            <div
              key={`${chosen}-${combo}`}
              className="animate-[fade_0.3s_ease_both]"
            >
              <p className="font-mono text-[0.7rem] tracking-wide text-muted uppercase">
                {hood.borough}
              </p>
              <h3 className="mt-1 font-serif text-[1.6rem] leading-tight tracking-tight">
                {hood.name}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {KIND_LABEL[kind]} · {STAY_LABEL[long].toLowerCase()} ·{" "}
                {GUESTS[kind].find(([v]) => v === guests)?.[1]} guests
              </p>

              {isEstimate(entry) ? (
                <>
                  <p className="mt-6 text-[0.8rem] text-muted">
                    Typical price per night
                  </p>
                  <p className="font-serif text-[3.2rem] leading-none tracking-tight">
                    {dollars(entry[1])}
                  </p>
                  <Range
                    lo={entry[0]}
                    mid={entry[1]}
                    hi={entry[2]}
                    min={meta.priceMin}
                    max={meta.priceMax}
                  />
                  <p className="mt-3 leading-relaxed text-muted">
                    The model expects 8 in 10 listings like this to cost between{" "}
                    <span className="text-ink">{dollars(entry[0])}</span> and{" "}
                    <span className="text-ink">{dollars(entry[2])}</span> a
                    night.
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Based on {count(entry[3])} similar listings within{" "}
                    {meta.nearKm} km.
                    {city.median !== null && (
                      <>
                        {" "}
                        The citywide typical price for this kind of stay is{" "}
                        {dollars(city.median)}.
                      </>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-6 leading-relaxed text-muted">
                  Only {entry ?? 0} similar{" "}
                  {entry === 1 ? "listing" : "listings"} within {meta.nearKm}{" "}
                  km. That is too few for an honest estimate, so the model does
                  not give one here.
                </p>
              )}

              <p className="eyebrow mt-8">Same spot, other stays</p>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {others.map((o) => {
                  const e =
                    cell[3][comboIndex(meta.combos, o.kind, o.long, o.guests)];
                  const active = o.kind === kind && o.long === long;
                  return (
                    <li key={`${o.kind}-${o.long}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setKind(o.kind);
                          setLong(o.long);
                          setGuests(o.guests);
                        }}
                        className={`flex w-full items-baseline justify-between gap-3 py-2 text-left text-sm transition-colors hover:text-accent ${
                          active ? "text-ink" : "text-muted"
                        }`}
                      >
                        <span>
                          {KIND_LABEL[o.kind]},{" "}
                          {STAY_LABEL[o.long].toLowerCase()}
                        </span>
                        <span className="font-mono text-[0.8rem]">
                          {isEstimate(e) ? dollars(e[1]) : "too few"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="text-muted">Choose a spot on the map.</p>
          )}
        </div>
      </div>

      <p className="mt-3 max-w-[80ch] text-sm leading-relaxed text-muted">
        Click anywhere on the map. Prices are what Airbnb quoted in
        mid-September 2026: a stay of one to three nights for short stays, and
        the nightly rate of a 30-night booking for monthly stays. Each square is{" "}
        {meta.cellKm * 1000} metres across.
      </p>

      <section className="mt-16">
        <p className="eyebrow">How good is it</p>
        <h2 className="display mt-3 text-[clamp(1.8rem,4vw,2.6rem)]">
          Checked on listings it never saw
        </h2>
        <p className="mt-3 max-w-[70ch] leading-relaxed text-muted">
          One in five priced listings ({count(model.rows.test)}) was held back,
          and each method had to guess its price. A simpler model, which adjusts
          the citywide average for neighbourhood and room type, is the one to
          beat.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <figure className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <figcaption className="font-serif text-[1.25rem] tracking-tight">
              Typical miss, per night
            </figcaption>
            <p className="mt-1 text-sm text-muted">
              Median gap between the guess and the real price.
            </p>
            <ul className="mt-6 space-y-4">
              {model.methods.map((m, i) => {
                const last = i === model.methods.length - 1;
                return (
                  <li key={m.name}>
                    <p className="flex items-baseline justify-between text-sm">
                      <span className={last ? "text-ink" : "text-muted"}>
                        {m.name}
                      </span>
                      <span className="font-mono text-[0.75rem] text-muted">
                        <span className={last ? "text-ink" : ""}>
                          {dollars(m.medianAbs)}
                        </span>{" "}
                        · {Math.round(m.medianPct)}% off
                      </span>
                    </p>
                    <div
                      className={`mt-1.5 h-2 rounded-[2px] ${last ? "bg-accent" : "border border-faint"}`}
                      style={{ width: `${(m.medianAbs / worst) * 100}%` }}
                    />
                  </li>
                );
              })}
            </ul>
          </figure>

          <figure className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <figcaption className="font-serif text-[1.25rem] tracking-tight">
              Does the range hold?
            </figcaption>
            <p className="mt-1 text-sm text-muted">
              The range is meant to contain {percent(cov.target)} of real
              prices.
            </p>
            <p className="mt-6 font-serif text-[3.2rem] leading-none tracking-tight">
              {percent(cov.actual, 1)}
            </p>
            <p className="mt-2 leading-relaxed text-muted">
              of held-back prices fell inside their range. Before a calibration
              step widened the ranges by {cov.widenPct}%, it was{" "}
              {percent(cov.beforeAdjust, 1)}.
            </p>
            <p className="mt-4 font-mono text-[0.72rem] leading-relaxed text-muted">
              {KINDS.map(
                (k) => `${KIND_LABEL[k]} ${percent(cov.byKind[k].actual, 1)}`,
              ).join(" · ")}
              <br />
              Short stays {percent(cov.byStay.short.actual, 1)} · Monthly stays{" "}
              {percent(cov.byStay.long.actual, 1)}
            </p>
          </figure>
        </div>
        <p className="mt-3 max-w-[80ch] text-sm leading-relaxed text-muted">
          The model knows only location, kind of stay, length and guests. It
          cannot see photos, reviews or amenities, which is why its ranges are
          wide: the high end is typically {cov.medianWidthRatio.toFixed(1)}{" "}
          times the low end. Of {count(meta.listings)} listings in the snapshot,{" "}
          {count(meta.priced)} had a usable price between{" "}
          {dollars(meta.priceMin)} and {dollars(meta.priceMax)}; shared rooms
          were left out.
        </p>
      </section>

      <Compare data={data} />
    </div>
  );
}

/** The predicted range on a log price axis, with the typical price marked. */
function Range({
  lo,
  mid,
  hi,
  min,
  max,
}: {
  lo: number;
  mid: number;
  hi: number;
  min: number;
  max: number;
}) {
  const at = (v: number) =>
    `${Math.min(100, Math.max(0, (Math.log(v / min) / Math.log(max / min)) * 100))}%`;
  return (
    <div className="mt-5">
      <div className="relative h-2 rounded-full bg-line/70">
        <div
          className="absolute inset-y-0 rounded-full bg-accent"
          style={{ left: at(lo), right: `calc(100% - ${at(hi)})` }}
        />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink"
          style={{ left: at(mid) }}
        />
      </div>
      <p className="mt-1.5 flex justify-between font-mono text-[0.65rem] text-faint">
        <span>{dollars(min)}</span>
        <span>{dollars(max)}</span>
      </p>
    </div>
  );
}
