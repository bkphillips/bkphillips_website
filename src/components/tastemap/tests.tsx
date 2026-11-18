import type { TasteData } from "@/lib/tastemap";

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** How the recommender did on ratings and people it never saw. */
export function Tests({ data }: { data: TasteData }) {
  const { recent, visitors } = data.tests;
  const { meta } = data;
  const worst = Math.max(...recent.methods.map((m) => m.rmse));

  // Learning curve: error against the number of ratings a newcomer has given.
  const W = 520;
  const H = 250;
  const pad = { l: 44, r: 150, t: 16, b: 38 };
  const all = [...visitors.model, ...visitors.generosity, visitors.filmOnly];
  const lo = Math.floor((Math.min(...all) - 0.01) * 50) / 50;
  const hi = Math.ceil((Math.max(...all) + 0.01) * 50) / 50;
  const x = (i: number) =>
    pad.l + (i / (visitors.given.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const path = (vals: number[]) =>
    vals
      .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join("");
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += 0.04) ticks.push(Number(v.toFixed(2)));
  const last = visitors.given.length - 1;
  const ten = visitors.given.indexOf(visitors.picks.given);
  const picks = visitors.picks;

  return (
    <section className="mt-16">
      <p className="eyebrow">How good is it</p>
      <h2 className="display mt-3 text-[clamp(1.8rem,4vw,2.6rem)]">
        Tested the way you just used it
      </h2>
      <p className="mt-3 max-w-[70ch] leading-relaxed text-muted">
        {visitors.people.toLocaleString("en-US")} real people were kept out of
        training to play the part of visitors. The model saw a handful of each
        person&rsquo;s ratings, exactly as it sees yours, and had to predict the
        rest. Error is measured in stars, and lower is better.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          <figure className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <figcaption className="font-serif text-[1.25rem] tracking-tight">
              How quickly it learns a newcomer
            </figcaption>
            <p className="mt-1 text-sm text-muted">
              Prediction error for the same hidden ratings, by number of ratings
              seen.
            </p>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="mt-4 block w-full"
              role="img"
              aria-label="Prediction error falls as the model sees more of a newcomer's ratings"
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={pad.l}
                    x2={W - pad.r}
                    y1={y(t)}
                    y2={y(t)}
                    stroke="var(--line)"
                    strokeWidth={1}
                  />
                  <text
                    x={pad.l - 8}
                    y={y(t) + 3.5}
                    textAnchor="end"
                    className="fill-muted font-mono text-[10px]"
                  >
                    {t.toFixed(2)}
                  </text>
                </g>
              ))}
              {visitors.given.map((g, i) => (
                <text
                  key={g}
                  x={x(i)}
                  y={H - pad.b + 16}
                  textAnchor="middle"
                  className="fill-muted font-mono text-[10px]"
                >
                  {g}
                </text>
              ))}
              <text
                x={(pad.l + W - pad.r) / 2}
                y={H - 4}
                textAnchor="middle"
                className="fill-faint font-mono text-[10px]"
              >
                ratings seen
              </text>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(visitors.filmOnly)}
                y2={y(visitors.filmOnly)}
                stroke="var(--faint)"
                strokeWidth={1.5}
                strokeDasharray="2 4"
              />
              <path
                d={path(visitors.generosity)}
                fill="none"
                stroke="var(--faint)"
                strokeWidth={1.75}
              />
              <path
                d={path(visitors.model)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.5}
              />
              {visitors.model.map((v, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={3.5}
                  fill="var(--accent)"
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                />
              ))}
              <text
                x={W - pad.r + 8}
                y={y(visitors.filmOnly) + 3.5}
                className="fill-muted text-[11px]"
              >
                Film averages only
              </text>
              <text
                x={W - pad.r + 8}
                y={y(visitors.generosity[last]) + 3.5}
                className="fill-muted text-[11px]"
              >
                + how generous you are
              </text>
              <text
                x={W - pad.r + 8}
                y={y(visitors.model[last]) + 3.5}
                className="fill-ink text-[11px]"
              >
                This model
              </text>
            </svg>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              After {visitors.picks.given} ratings the error is{" "}
              {visitors.model[ten].toFixed(2)} stars, against{" "}
              {visitors.filmOnly.toFixed(2)} when the model knows nothing about
              the person.
            </p>
          </figure>
          <figure className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <figcaption className="font-serif text-[1.25rem] tracking-tight">
              And for people it already knows
            </figcaption>
            <p className="mt-1 text-sm text-muted">
              Error on each person&rsquo;s most recent ratings, hidden during
              training ({(recent.ratings / 1e6).toFixed(1)} million of them).
            </p>
            <ul className="mt-5 space-y-3">
              {recent.methods.map((m, i) => {
                const on = i === recent.methods.length - 1;
                return (
                  <li key={m.name}>
                    <p className="flex items-baseline justify-between text-sm">
                      <span className={on ? "text-ink" : "text-muted"}>
                        {m.name}
                      </span>
                      <span
                        className={`font-mono text-[0.75rem] ${on ? "text-ink" : "text-muted"}`}
                      >
                        {m.rmse.toFixed(3)}
                      </span>
                    </p>
                    <div
                      className={`mt-1.5 h-2 rounded-[2px] ${on ? "bg-accent" : "border border-faint"}`}
                      style={{ width: `${(m.rmse / worst) * 100}%` }}
                    />
                  </li>
                );
              })}
            </ul>
          </figure>
        </div>
        <figure className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <figcaption className="font-serif text-[1.25rem] tracking-tight">
            Are its picks any good?
          </figcaption>
          <p className="mt-1 text-sm text-muted">
            After {picks.given} ratings, the {picks.count} films it ranked
            highest for each person, among films they went on to rate.
          </p>
          <ul className="mt-5 space-y-3">
            {[
              { name: "Safe picks", v: picks.safe.liked, on: true },
              { name: "Personal picks", v: picks.personal.liked, on: true },
              {
                name: "The most acclaimed films",
                v: picks.likedAcclaimed,
                on: false,
              },
              { name: "Any film they rated", v: picks.likedAny, on: false },
            ].map((r) => (
              <li key={r.name}>
                <p className="flex items-baseline justify-between text-sm">
                  <span className={r.on ? "text-ink" : "text-muted"}>
                    {r.name}
                  </span>
                  <span className="font-mono text-[0.75rem] text-muted">
                    <span className={r.on ? "text-ink" : ""}>{pct(r.v)}</span>{" "}
                    rated 4+ stars
                  </span>
                </p>
                <div
                  className={`mt-1.5 h-2 rounded-[2px] ${r.on ? "bg-accent" : "border border-faint"}`}
                  style={{ width: `${r.v * 100}%` }}
                />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Safe picks are liked most often but are mostly the same famous
            films: across everyone&rsquo;s lists, {pct(picks.safe.top20Share)}{" "}
            of places went to just 20 films. Personal picks are liked less often
            but differ from person to person: the top 20 took{" "}
            {pct(picks.personal.top20Share)} of places, spread over{" "}
            {picks.personal.distinctFilms.toLocaleString("en-US")} films against{" "}
            {picks.safe.distinctFilms.toLocaleString("en-US")}.
          </p>
        </figure>
      </div>
      <p className="mt-3 max-w-[80ch] text-sm leading-relaxed text-muted">
        Trained on {(meta.trainRatings / 1e6).toFixed(1)} million ratings of{" "}
        {meta.modelFilms.toLocaleString("en-US")} films (those with at least{" "}
        {meta.minRatings} ratings); the map shows the{" "}
        {data.films.length.toLocaleString("en-US")} most rated. The picks test
        can only score films a person chose to watch and rate, which flatters
        every method, so read it as a comparison between rows and not as a hit
        rate you should expect.
      </p>
    </section>
  );
}
