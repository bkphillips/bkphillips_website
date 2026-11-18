import { count, percent, type NightlyData } from "@/lib/nightly";

const change = (from: number, to: number) => {
  const pct = Math.round(((to - from) / from) * 100);
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
};

function Legend() {
  return (
    <p className="flex items-center gap-4 font-mono text-[0.7rem] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[2px] border border-faint" />
        2019
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[2px] bg-accent" />
        2026
      </span>
    </p>
  );
}

/** New York's listings in 2019 against 2026, either side of the 2023 rules. */
export function Compare({ data }: { data: NightlyData }) {
  const c = data.compare;
  const thirty = c.nightBins.indexOf("30");
  const tiles = [
    {
      label: "Listings",
      from: count(c.total.y2019),
      to: count(c.total.y2026),
      delta: change(c.total.y2019, c.total.y2026),
    },
    {
      label: "Allow stays under 30 nights",
      from: count(c.short.y2019),
      to: count(c.short.y2026),
      delta: change(c.short.y2019, c.short.y2026),
    },
    {
      label: "Minimum set to exactly 30 nights",
      from: percent(c.nights.y2019[thirty]),
      to: percent(c.nights.y2026[thirty]),
      delta: null,
    },
  ];
  const tallest = Math.max(...c.nights.y2019, ...c.nights.y2026);
  const widest = Math.max(...c.byBorough.short2019);
  const now = c.shortNow;

  return (
    <section className="mt-16">
      <p className="eyebrow">Before and after the rules</p>
      <h2 className="display mt-3 text-[clamp(1.8rem,4vw,2.6rem)]">
        2019 against 2026
      </h2>
      <p className="mt-3 max-w-[70ch] leading-relaxed text-muted">
        In September 2023 New York began enforcing Local Law 18, which requires
        hosts to register before renting a home for fewer than 30 nights. My
        2020 project used a 2019 snapshot of the city, so the two files show the
        market on either side of that change.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-2xl border border-line bg-surface p-5"
          >
            <p className="text-[0.8rem] leading-tight text-muted">{t.label}</p>
            <p className="mt-3 font-serif text-[1.75rem] leading-none tracking-tight">
              <span className="text-muted">{t.from}</span>
              <span className="mx-2 text-faint">→</span>
              {t.to}
            </p>
            <p className="mt-2 font-mono text-[0.7rem] text-muted">
              2019 → 2026
              {t.delta && <span className="text-signal"> · {t.delta}</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <figure className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="font-serif text-[1.25rem] tracking-tight">
              Shortest stay a host accepts
            </span>
            <Legend />
          </figcaption>
          <p className="mt-1 text-sm text-muted">
            Share of listings by minimum nights.
          </p>
          <div className="mt-6 grid grid-cols-7 gap-2">
            {c.nightBins.map((bin, i) => (
              <div key={bin} className="flex flex-col items-center">
                <div className="flex h-40 w-full items-end justify-center gap-1">
                  {[c.nights.y2019[i], c.nights.y2026[i]].map((share, year) => (
                    <div
                      key={year}
                      className="flex h-full w-1/2 max-w-7 flex-col justify-end"
                    >
                      <span className="mb-1 text-center font-mono text-[0.6rem] text-muted">
                        {share >= 0.005 ? percent(share) : "<1%"}
                      </span>
                      <div
                        className={`rounded-t-[3px] ${year ? "bg-accent" : "border border-b-0 border-faint"}`}
                        style={{
                          height: `${Math.max(1, (share / tallest) * 82)}%`,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <span className="mt-2 w-full border-t border-line pt-2 text-center font-mono text-[0.7rem] text-muted">
                  {bin}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center font-mono text-[0.68rem] text-faint">
            minimum nights
          </p>
        </figure>

        <figure className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="font-serif text-[1.25rem] tracking-tight">
              Short stays, by borough
            </span>
            <Legend />
          </figcaption>
          <p className="mt-1 text-sm text-muted">
            Listings that accept stays under 30 nights.
          </p>
          <ul className="mt-6 space-y-4">
            {c.boroughs.map((b, i) => {
              const before = c.byBorough.short2019[i];
              const after = c.byBorough.short2026[i];
              return (
                <li key={b}>
                  <p className="flex items-baseline justify-between text-sm">
                    <span>{b}</span>
                    <span className="font-mono text-[0.7rem] text-muted">
                      {count(before)} → {count(after)}
                      <span className="text-signal">
                        {" "}
                        · {change(before, after)}
                      </span>
                    </span>
                  </p>
                  <div className="mt-1.5 space-y-1">
                    <div
                      className="h-2 rounded-[2px] border border-faint"
                      style={{
                        width: `${Math.max(0.5, (before / widest) * 100)}%`,
                      }}
                    />
                    <div
                      className="h-2 rounded-[2px] bg-accent"
                      style={{
                        width: `${Math.max(0.5, (after / widest) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </figure>
      </div>

      <p className="mt-6 max-w-[80ch] leading-relaxed text-muted">
        Of the {count(now.total)} listings that still accept short stays,{" "}
        {count(now.hotel)} are hotel rooms. {count(now.registered)} show a city
        registration number, {count(now.exempt)} are marked exempt, and{" "}
        {count(now.none)} show neither.
      </p>
      <p className="mt-3 max-w-[80ch] text-sm leading-relaxed text-muted">
        Read this as a description, not a measurement of what the law caused.
        The pandemic also falls between the two snapshots, the two files were
        collected in different ways, and a listing that exists is not the same
        as a listing that gets booked. Prices are left out of the comparison:
        the 2019 file records a host&rsquo;s base nightly rate, while the 2026
        file records a quote for a specific stay.
      </p>
    </section>
  );
}
