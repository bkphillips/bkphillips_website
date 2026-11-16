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
| `src/app/` | Pages: home, `/about`, `/work/inflection`, `/work/org-health` |
| `src/components/sculpture/` | The 3D "regime terrain" on the home page (three.js). Its data is `public/data/terrain.json`; rebuild it with `npx tsx analysis/build_terrain.ts` |
| `src/components/hero-chart.tsx` | The live change point chart on the home page |
| `src/lib/changepoint.ts` | PELT change point detection (home page chart) |
| `src/components/inflection/`, `src/lib/inflection/` | The Inflection tool |
| `src/app/globals.css` | Design tokens (colors, type) for light and dark themes |

## Inflection

The tool at `/work/inflection` finds shifts in a time series and explains them with news.

- **Detection** runs in the browser: `src/lib/segmentation.ts` (exact dynamic programming, level or trend model).
- **Data** comes through `/api/series` from Yahoo Finance (unofficial endpoint), the Wikimedia Pageviews API, and Our World in Data.
- **Explanations** come from `/api/explain`, which calls the Claude API with web search. To turn them on, copy `.env.example` to `.env.local` and add an Anthropic API key. Each request costs money, so set a spend limit on the API account; the built-in rate limits are in-memory only.

To check the segmentation against the Python `ruptures` library:

```bash
python3 -m venv analysis/.venv && analysis/.venv/bin/pip install -r analysis/requirements.txt
```

```bash
analysis/.venv/bin/python analysis/validate_segmentation.py
```

## Org Health Explorer

The tool at `/work/org-health` runs on Kestrel, a fictional company of about 5,000 people.

- **Data**: `analysis/generate_org.py` simulates 36 months of hires, exits, reporting lines and attendance, with four known events planted in the history. It writes `src/data/org.json`. To regenerate: `analysis/.venv/bin/python analysis/generate_org.py`.
- **Metrics and detection**: `src/lib/org/` (model, insights, groupings). `npx tsx analysis/check_org.ts` prints what the models find next to the planted events.
- **Views**: `src/components/org/` (KPI cards, metric chart, sunburst, treemap, org chart).
- **Assistant**: `/api/org/chat` calls the Claude API with a fixed set of tools (`src/lib/org/tools.ts`), scoped to the organization on screen. It uses the same `ANTHROPIC_API_KEY` as Inflection.

## Roadmap

1. Site shell and design system (done)
2. Inflection (beta; explanations not yet tested with a live API key)
3. Org Health Explorer (beta; assistant not yet tested with a live API key)
4. Polished resume and experience section
