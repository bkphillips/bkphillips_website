"""Build the data behind the Nightly project page.

Reads two New York City Airbnb listing files (kept out of git in
analysis/data/airbnb/):

  2026-09-14/listings.csv.gz   Inside Airbnb snapshot, CC BY 4.0
  2019/AB_NYC_2019.csv         the 2019 file from my original course project
  geo/neighbourhoods.geojson   Inside Airbnb neighbourhood outlines

and writes public/data/nightly.json, which holds only model outputs and
summaries: a grid of predicted prices with ranges, neighbourhood outlines,
the model's test results, and a 2019 against 2026 comparison. No individual
listings or host details are written.

Run with:  analysis/.venv/bin/python -I analysis/build_nightly.py
"""

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from sklearn.ensemble import HistGradientBoostingRegressor

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "analysis" / "data" / "airbnb"
OUT = ROOT / "public" / "data" / "nightly.json"

SNAPSHOT = "2026-09-14"
SEED = 2007  # the seed my 2020 report used
PRICE_MIN, PRICE_MAX = 25, 2000  # roughly the 0.5th and 99th percentiles
COVERAGE = 0.8  # the range should hold 8 in 10 prices
CELL_KM = 0.3
NEAR_KM = 1.0  # "nearby" for counting comparable listings
MIN_NEAR = 5  # fewer comparable listings than this: no estimate shown
LAT0, LON0 = 40.70, -73.95
KM_PER_LAT = 110.57
KM_PER_LON = 111.32 * math.cos(math.radians(LAT0))
VIEW_W = 1000

KINDS = ["entire", "private", "hotel"]
# Every combination the page offers: (kind, long stay?, guests).
COMBOS = (
    [("entire", s, g) for s in (0, 1) for g in (2, 4, 6)]
    + [("private", s, g) for s in (0, 1) for g in (1, 2)]
    + [("hotel", 0, g) for g in (2, 4)]
)


def to_km(lon, lat):
    return (np.asarray(lon) - LON0) * KM_PER_LON, (np.asarray(lat) - LAT0) * KM_PER_LAT


# ---------------------------------------------------------------- 2026 data

raw = pd.read_csv(DATA / SNAPSHOT / "listings.csv.gz", low_memory=False)
raw["price"] = pd.to_numeric(
    raw["price"].astype(str).str.replace(r"[$,]", "", regex=True), errors="coerce"
)
is_hotel = (raw["room_type"] == "Hotel room") | raw["property_type"].str.contains(
    "hotel", case=False, na=False
)
raw["kind"] = np.select(
    [is_hotel, raw["room_type"] == "Entire home/apt", raw["room_type"] == "Private room"],
    ["hotel", "entire", "private"],
    default="shared",
)
raw["long"] = (raw["minimum_nights"] >= 30).astype(int)
raw["x"], raw["y"] = to_km(raw["longitude"], raw["latitude"])

priced = raw[
    raw["price"].between(PRICE_MIN, PRICE_MAX) & (raw["kind"] != "shared")
].copy()
priced["guests"] = priced["accommodates"].clip(1, 8)
priced["logp"] = np.log(priced["price"])
priced["kind_code"] = priced["kind"].map({k: i for i, k in enumerate(KINDS)})


# Trees split along their input axes, which leaves stripes on a map. Giving
# them the same position along six rotated axes lets them cut at any angle
# (Manhattan's grid runs about 29 degrees off north) and smooths the surface.
ANGLES = [math.radians(a) for a in (0, 30, 60, 90, 120, 150)]


def features(x, y, kind_code, long, guests):
    x, y = np.asarray(x, float), np.asarray(y, float)
    return np.column_stack(
        [x * math.cos(a) + y * math.sin(a) for a in ANGLES]
        + [
            np.asarray(kind_code, float),
            np.asarray(long, float),
            np.asarray(guests, float),
        ]
    )


X = features(priced["x"], priced["y"], priced["kind_code"], priced["long"], priced["guests"])
y = priced["logp"].to_numpy()

rng = np.random.default_rng(SEED)
order = rng.permutation(len(priced))
n_test = n_cal = len(priced) // 5
test, cal, train = order[:n_test], order[n_test : n_test + n_cal], order[n_test + n_cal :]

lo_q, hi_q = (1 - COVERAGE) / 2, 1 - (1 - COVERAGE) / 2
models = {}
for q in (lo_q, 0.5, hi_q):
    m = HistGradientBoostingRegressor(
        loss="quantile",
        quantile=q,
        max_iter=400,
        learning_rate=0.06,
        max_leaf_nodes=24,
        min_samples_leaf=25,
        l2_regularization=1.0,
        categorical_features=[len(ANGLES)],
        random_state=SEED,
    )
    models[q] = m.fit(X[train], y[train])


def predict(Xn):
    return tuple(models[q].predict(Xn) for q in (lo_q, 0.5, hi_q))


# Conformal step: widen (or narrow) the range by one constant so that it holds
# the promised share of prices on listings the model has not seen.
c_lo, _, c_hi = predict(X[cal])
scores = np.maximum(c_lo - y[cal], y[cal] - c_hi)
level = min(1.0, math.ceil((len(cal) + 1) * COVERAGE) / len(cal))
widen = float(np.quantile(scores, level, method="higher"))

t_lo, t_mid, t_hi = predict(X[test])
t_lo_raw, t_hi_raw = t_lo.copy(), t_hi.copy()
t_lo, t_hi = t_lo - widen, t_hi + widen
actual = priced["price"].to_numpy()[test]


def errors(pred_dollars):
    err = pred_dollars - actual
    return {
        "medianAbs": round(float(np.median(np.abs(err))), 1),
        "medianPct": round(float(np.median(np.abs(err) / actual)) * 100, 1),
        "rmse": round(float(np.sqrt(np.mean(err**2))), 1),
    }


# Baselines, fitted on everything outside the test set.
fit = priced.iloc[np.concatenate([train, cal])]
held = priced.iloc[test]
mu = fit["price"].mean()

# A simple model to beat, and the one my original report used: the average, plus a regularised
# neighbourhood effect, plus a room type effect on what is left.
LAMBDA = 5.0
hood = fit.groupby("neighbourhood_cleansed")["price"].agg(["sum", "count"])
b_n = (hood["sum"] - mu * hood["count"]) / (hood["count"] + LAMBDA)
resid = fit["price"] - mu - fit["neighbourhood_cleansed"].map(b_n)
b_t = resid.groupby(fit["room_type"]).mean()
old = (
    mu
    + held["neighbourhood_cleansed"].map(b_n).fillna(0)
    + held["room_type"].map(b_t).fillna(0)
).to_numpy()

inside = (y[test] >= t_lo) & (y[test] <= t_hi)
inside_raw = (y[test] >= t_lo_raw) & (y[test] <= t_hi_raw)
report = {
    "rows": {
        "priced": int(len(priced)),
        "train": int(len(train)),
        "calibrate": int(len(cal)),
        "test": int(len(test)),
    },
    "methods": [
        {"name": "Citywide average", **errors(np.full(len(test), mu))},
        {"name": "Neighbourhood and room type model", **errors(old)},
        {"name": "This model", **errors(np.exp(t_mid))},
    ],
    "coverage": {
        "target": COVERAGE,
        "actual": round(float(inside.mean()), 3),
        "beforeAdjust": round(float(inside_raw.mean()), 3),
        "widenPct": round((math.exp(widen) - 1) * 100, 1),
        "medianWidthRatio": round(float(np.median(np.exp(t_hi - t_lo))), 2),
        "byKind": {
            k: {
                "n": int((held["kind"] == k).sum()),
                "actual": round(float(inside[(held["kind"] == k).to_numpy()].mean()), 3),
            }
            for k in KINDS
        },
        "byStay": {
            name: {
                "n": int((held["long"] == v).sum()),
                "actual": round(float(inside[(held["long"] == v).to_numpy()].mean()), 3),
            }
            for name, v in (("short", 0), ("long", 1))
        },
    },
}

# ---------------------------------------------------------------- price grid

all_tree = cKDTree(priced[["x", "y"]].to_numpy())
xs = np.arange(priced["x"].min(), priced["x"].max() + CELL_KM, CELL_KM)
ys = np.arange(priced["y"].min(), priced["y"].max() + CELL_KM, CELL_KM)
gx, gy = np.meshgrid(xs, ys)
centres = np.column_stack([gx.ravel(), gy.ravel()])
# Keep cells that have listings close by, so the map follows where people stay.
close = np.array([len(v) for v in all_tree.query_ball_point(centres, 0.45)])
centres = centres[close >= 3]

group_trees = {}
for kind in KINDS:
    for long in (0, 1):
        pts = priced[(priced["kind"] == kind) & (priced["long"] == long)][["x", "y"]].to_numpy()
        group_trees[(kind, long)] = cKDTree(pts) if len(pts) else None

near = {}
for key, tree in group_trees.items():
    near[key] = (
        np.array([len(v) for v in tree.query_ball_point(centres, NEAR_KM)])
        if tree is not None
        else np.zeros(len(centres), int)
    )

grid_values = []  # per combo: (lo, mid, hi, n) arrays
for kind, long, guests in COMBOS:
    Xg = features(
        centres[:, 0],
        centres[:, 1],
        np.full(len(centres), KINDS.index(kind)),
        np.full(len(centres), long),
        np.full(len(centres), guests),
    )
    g_lo, g_mid, g_hi = predict(Xg)
    grid_values.append(
        (np.exp(g_lo - widen), np.exp(g_mid), np.exp(np.maximum(g_hi + widen, g_mid)), near[(kind, long)])
    )

# ------------------------------------------------- neighbourhoods and the map

geo = json.loads((DATA / "geo" / "neighbourhoods.geojson").read_text())


def simplify(points, tol):
    """Douglas-Peucker on an open list of (x, y) points."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        worst, at = 0.0, -1
        for i in range(a + 1, b):
            qx, qy = points[i]
            # A closed ring starts and ends at one point, so there is no
            # baseline to measure from: use the distance to that point.
            d = (
                abs(dy * (qx - ax) - dx * (qy - ay)) / norm
                if norm > 1e-9
                else math.hypot(qx - ax, qy - ay)
            )
            if d > worst:
                worst, at = d, i
        if worst > tol:
            keep[at] = True
            stack += [(a, at), (at, b)]
    return [p for p, k in zip(points, keep) if k]


rings_by_hood = {}
for f in geo["features"]:
    name = f["properties"]["neighbourhood"]
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    rings = rings_by_hood.setdefault(
        name, {"borough": f["properties"]["neighbourhood_group"], "rings": []}
    )["rings"]
    for poly in polys:
        for ring in poly:
            lon, lat = np.array(ring)[:, 0], np.array(ring)[:, 1]
            kx, ky = to_km(lon, lat)
            rings.append(list(zip(kx.tolist(), ky.tolist())))

all_x = [p[0] for h in rings_by_hood.values() for r in h["rings"] for p in r]
all_y = [p[1] for h in rings_by_hood.values() for r in h["rings"] for p in r]
x_min, x_max, y_min, y_max = min(all_x), max(all_x), min(all_y), max(all_y)
scale = VIEW_W / (x_max - x_min)
view_h = round((y_max - y_min) * scale)


def px(x, y):
    return (x - x_min) * scale, (y_max - y) * scale


def ring_area(ring):
    return abs(
        sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])) / 2
    )


old19 = pd.read_csv(DATA / "2019" / "AB_NYC_2019.csv")
count19 = old19["neighbourhood"].value_counts()
count26 = raw["neighbourhood_cleansed"].value_counts()
short19 = old19[old19["minimum_nights"] < 30]["neighbourhood"].value_counts()
short26 = raw[raw["minimum_nights"] < 30]["neighbourhood_cleansed"].value_counts()

hood_names = sorted(rings_by_hood)
hoods = []
for name in hood_names:
    h = rings_by_hood[name]
    parts = []
    for ring in h["rings"]:
        if ring_area(ring) < 0.02:  # drop slivers and tiny islands (under 2 hectares)
            continue
        pts = simplify(ring, 0.03)
        if len(pts) < 4:
            continue
        parts.append(
            "M" + "L".join(f"{u:.1f},{v:.1f}" for u, v in (px(*p) for p in pts)) + "Z"
        )
    hoods.append(
        {
            "name": name,
            "borough": h["borough"],
            "d": "".join(parts),
            "n19": int(count19.get(name, 0)),
            "n26": int(count26.get(name, 0)),
            "s19": int(short19.get(name, 0)),
            "s26": int(short26.get(name, 0)),
        }
    )

# Each cell takes the neighbourhood of the listing nearest to its centre.
raw_tree = cKDTree(raw[["x", "y"]].to_numpy())
_, nearest = raw_tree.query(centres)
hood_index = {n: i for i, n in enumerate(hood_names)}
cell_hood = [hood_index.get(n, -1) for n in raw["neighbourhood_cleansed"].to_numpy()[nearest]]

cells = []
for i, (cx, cy) in enumerate(centres):
    u, v = px(cx, cy)
    entries = []
    for g_lo, g_mid, g_hi, n in grid_values:
        if n[i] < MIN_NEAR:
            entries.append(int(n[i]))
        else:
            entries.append([round(g_lo[i]), round(g_mid[i]), round(g_hi[i]), int(n[i])])
    if all(isinstance(e, int) for e in entries):
        continue
    cells.append([round(u, 1), round(v, 1), cell_hood[i], entries])

# A closer view for the page: the box that holds the middle 95% of listings.
lx, ly = px(raw["x"].to_numpy(), raw["y"].to_numpy())
core = [
    round(float(np.quantile(lx, 0.025)) - 15),
    round(float(np.quantile(ly, 0.025)) - 15),
    round(float(np.quantile(lx, 0.975)) + 15),
    round(float(np.quantile(ly, 0.975)) + 15),
]

# Typical price for each combination across the city, for "compared with".
city = []
for kind, long, guests in COMBOS:
    sel = priced[(priced["kind"] == kind) & (priced["long"] == long)]
    city.append({"n": int(len(sel)), "median": round(float(sel["price"].median())) if len(sel) else None})

# ------------------------------------------------------- 2019 against 2026

NIGHT_BINS = [("1", 1, 1), ("2", 2, 2), ("3", 3, 3), ("4–6", 4, 6), ("7–29", 7, 29), ("30", 30, 30), ("31+", 31, 10**6)]


def night_shares(series):
    n = len(series)
    return [round(float(series.between(a, b).sum()) / n, 4) for _, a, b in NIGHT_BINS]


def by(series, keys):
    counts = series.value_counts()
    return [int(counts.get(k, 0)) for k in keys]


BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"]
short_26 = raw[raw["minimum_nights"] < 30]
lic = short_26["license"].fillna("").str.upper()
compare = {
    "total": {"y2019": int(len(old19)), "y2026": int(len(raw))},
    "short": {
        "y2019": int((old19["minimum_nights"] < 30).sum()),
        "y2026": int(len(short_26)),
    },
    "nightBins": [b[0] for b in NIGHT_BINS],
    "nights": {
        "y2019": night_shares(old19["minimum_nights"]),
        "y2026": night_shares(raw["minimum_nights"]),
    },
    "boroughs": BOROUGHS,
    "byBorough": {
        "y2019": by(old19["neighbourhood_group"], BOROUGHS),
        "y2026": by(raw["neighbourhood_group_cleansed"], BOROUGHS),
        "short2019": by(old19[old19["minimum_nights"] < 30]["neighbourhood_group"], BOROUGHS),
        "short2026": by(short_26["neighbourhood_group_cleansed"], BOROUGHS),
    },
    "shortNow": {
        "total": int(len(short_26)),
        "hotel": int((short_26["kind"] == "hotel").sum()),
        "registered": int(lic.str.startswith("OSE-STRREG").sum()),
        "exempt": int((lic == "EXEMPT").sum()),
        "none": int((lic == "").sum()),
    },
}

out = {
    "meta": {
        "snapshot": SNAPSHOT,
        "listings": int(len(raw)),
        "priced": int(len(priced)),
        "priceMin": PRICE_MIN,
        "priceMax": PRICE_MAX,
        "cellKm": CELL_KM,
        "nearKm": NEAR_KM,
        "minNear": MIN_NEAR,
        "view": [VIEW_W, view_h],
        "core": core,
        "cellPx": round(CELL_KM * scale, 2),
        "combos": [{"kind": k, "long": s, "guests": g} for k, s, g in COMBOS],
    },
    "city": city,
    "cells": cells,
    "hoods": hoods,
    "model": report,
    "compare": compare,
}
OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))

print(json.dumps(report, indent=1))
print(json.dumps(compare, indent=1))
print("cells", len(cells), "of", len(centres), "| hoods", len(hoods), "| view", VIEW_W, view_h)
print("city", city)
print("bytes", OUT.stat().st_size)
print("core", core)
