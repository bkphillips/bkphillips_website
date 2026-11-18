# Bryan Phillips — personal site

Portfolio site for data science work. Next.js 16 (App Router), TypeScript, Tailwind CSS v4.

## Run locally

Needs Node 20 or newer. A copy of Node 24 lives in `.tools/node` (not committed), so until Node is updated system-wide:

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm run dev
```

Then open http://localhost:3000.

## Where things are

| Path | What it holds |
| --- | --- |
| `src/content/` | All site copy: contact details, projects, experience, publications |
| `src/app/` | Pages: home, `/about`, `/work/inflection`, `/work/org-explorer`, `/work/nightly`, `/work/taste-map` |
| `src/components/sculpture/` | The 3D "regime terrain" on the home page (three.js). Its data is `public/data/terrain.json`; rebuild it with `npx tsx analysis/build_terrain.ts` |
| `src/components/story/`, `src/content/story.ts` | The About page scroll story: one set of dots that forms a globe, an epidemic curve, a US population map and an org structure. Its data is `public/data/story.json`; rebuild it with `npx tsx analysis/build_story.ts` |
| `src/components/hero-chart.tsx` | The live change point chart on the home page |
| `src/lib/changepoint.ts` | PELT change point detection (home page chart) |
| `src/components/inflection/`, `src/lib/inflection/` | The Inflection tool |
| `src/components/nightly/`, `src/lib/nightly.ts` | The Nightly price map |
| `src/components/tastemap/`, `src/lib/tastemap.ts` | The Taste Map recommender |
| `src/app/globals.css` | Design tokens (colors, type) for light and dark themes |

## Inflection

The tool at `/work/inflection` finds shifts in a time series and explains them with news.

- **Detection** runs in the browser: `src/lib/segmentation.ts` (exact dynamic programming, level or trend model).
- **Data** comes through `/api/series` from Yahoo Finance (unofficial endpoint), the Wikimedia Pageviews API, and Our World in Data.
- **Explanations** come from `/api/explain`. With `NEWSAPI_AI_KEY` set it lists the top articles published around each shift (NewsAPI.ai). With `ANTHROPIC_API_KEY` also set, Claude writes a headline and summary from those articles. With only the Anthropic key, Claude does its own web search. Keys go in `.env.local` (see `.env.example`) and in the host's environment settings. Both services charge per use, so set limits on the accounts; the built-in rate limits are in-memory only.
- **How the news search was tuned**: `npx tsx analysis/eval_news_search.ts` scores search variants on 16 shifts with well-known causes (add `--fetch` to run searches that are not cached; about 5 tokens each). Today's settings in `src/lib/news.ts` came out of that test: title keywords with wider market words, a curated outlet list, junk headlines excluded in the query, 100 candidates, and a small lift for articles in a multi-article event. Tried and dropped: entity search (no better), ranking sources by the service's own rank (lets in tabloids), sentiment (unreliable on market news), and the separate event search (20 tokens a call and noisy on small moves).
- **Saved explanations**: the example series at their default settings load their news and summaries from `public/data/inflection-saved.json`, so no search or model call happens when a visitor picks one. Rebuild it with the dev server running: `npx tsx analysis/build_inflection_saved.ts` (about 5 news tokens per shift and one model call per series; add `--refresh` to redo cached ones). The series are live, so run it again from time to time. A shift is matched to a saved explanation by date, within a few days; changing a setting or loading another series goes through `/api/explain` as before.
- **Landing page news**: `npx tsx analysis/add_terrain_news.ts --fetch` looks up articles for each change point on the terrain and stores them in `public/data/terrain.json`. Searches are cached in `analysis/cache/`, so each is paid for once. Run it again after `build_terrain.ts`.

To check the segmentation against the Python `ruptures` library:

```bash
python3 -m venv analysis/.venv && analysis/.venv/bin/pip install -r analysis/requirements.txt
```

```bash
analysis/.venv/bin/python analysis/validate_segmentation.py
```

## Kestrel Org Explorer

The tool at `/work/org-explorer` runs on Kestrel, a fictional company of about 5,000 people.

- **Data**: `analysis/generate_org.py` simulates 36 months of hires, exits, reporting lines and attendance, with four known events planted in the history. It writes `src/data/org.json`. To regenerate: `analysis/.venv/bin/python analysis/generate_org.py`.
- **Metrics and detection**: `src/lib/org/` (model, insights, groupings). `npx tsx analysis/check_org.ts` prints what the models find next to the planted events.
- **Views**: `src/components/org/` (KPI cards, metric chart, sunburst, treemap, org chart).
- **Assistant**: `/api/org/chat` calls the Claude API with a fixed set of tools (`src/lib/org/tools.ts`), scoped to the organization on screen. It uses the same `ANTHROPIC_API_KEY` as Inflection.

## Nightly

The tool at `/work/nightly` maps the typical nightly Airbnb price across New York City with a range, and compares the city's listings in 2019 and 2026.

- **Data**: Inside Airbnb's New York City snapshot (CC BY 4.0) and the 2019 Kaggle file from my original course project. The raw files live in `analysis/data/airbnb/`, which is kept out of git. Inside Airbnb asks that its data not be republished, so only model outputs and summaries are committed.
- **Model**: `analysis/build_nightly.py` fits three gradient-boosted quantile models (scikit-learn), calibrates the range with a conformal step, tests everything on held-back listings, and writes `public/data/nightly.json`. To rebuild: `analysis/.venv/bin/python -I analysis/build_nightly.py`.
- **Page**: `src/components/nightly/` draws the price grid on a canvas with neighbourhood outlines in SVG. It loads the one data file and calls no server.

## Taste Map

The tool at `/work/taste-map` places a visitor on a map of 3,000 films from a few ratings and recommends films.

- **Data**: MovieLens 32M from GroupLens (University of Minnesota). Download `ml-32m.zip` from grouplens.org into `analysis/data/movielens/` and unzip it there; the folder is kept out of git. The licence allows non-commercial use and redistribution of transformations under the same conditions, so `public/data/tastemap.json` carries those conditions too, and the page cites Harper and Konstan (2015).
- **Steps**: `analysis/prep_movielens.py` converts the ratings to compact arrays. `analysis/fetch_posters.py` looks up poster paths on TMDB once (needs `TMDB_READ_TOKEN` in `.env.local`) and caches them in `analysis/cache/tmdb-posters.json`. `analysis/build_tastemap.py` trains the model, runs the tests, lays out the map and writes the data file. Each runs as `analysis/.venv/bin/python -I analysis/<script>`. Training needs about 3 GB of memory.
- **Model**: film and viewer averages, then matrix factorization of what is left (alternating least squares, 32 factors), then t-SNE for the layout. A visitor is placed by a ridge regression that the browser runs (`placeVisitor` in `src/lib/tastemap.ts`), which mirrors `place` in the build script so the tests measure what the page does.
- **Posters**: loaded by the browser from TMDB's image server. This product uses the TMDB API but is not endorsed or certified by TMDB.

## Roadmap

1. Site shell and design system (done)
2. Inflection (beta; explanations not yet tested with a live API key)
3. Kestrel Org Explorer (beta; assistant not yet tested with a live API key)
4. Nightly (beta)
5. Taste Map (beta)
6. Polished resume and experience section
