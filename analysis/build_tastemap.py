"""Build the data behind the Taste Map project page.

Trains a matrix factorization recommender on MovieLens 32M, tests it two
ways, lays the most-rated films out on a 2D map, and writes
public/data/tastemap.json. The page then places a visitor on the map from a
handful of ratings, entirely in the browser.

Inputs (kept out of git in analysis/data/movielens/):
  userId.npy, movieId.npy, rating.npy, timestamp.npy   from prep_movielens.py
  ml-32m/movies.csv                                    titles and genres
  analysis/cache/tmdb-posters.json                     from fetch_posters.py

Run with:  analysis/.venv/bin/python -I analysis/build_tastemap.py
Options:   --retrain      ignore the cached factors and train again
           --users N      train on a sample of N people (for quick trials)
           --lam X        regularisation strength for training
"""

import argparse
import base64
import json
import re
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.manifold import TSNE

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "analysis" / "data" / "movielens"
OUT = ROOT / "public" / "data" / "tastemap.json"
POSTERS = ROOT / "analysis" / "cache" / "tmdb-posters.json"

parser = argparse.ArgumentParser()
parser.add_argument("--retrain", action="store_true")
parser.add_argument("--users", type=int, default=0)
parser.add_argument("--lam", type=float, default=0.06)
parser.add_argument("--rank", type=int, default=32)
parser.add_argument("--iters", type=int, default=12)
parser.add_argument("--explore", action="store_true")
args = parser.parse_args()

SEED = 7
RANK = args.rank
LAM = args.lam
MIN_RATINGS = 200  # films with fewer ratings are left out of the model
MAP_FILMS = 3000  # the most-rated films are drawn on the map
NEW_PEOPLE = 10_000  # people held out entirely, to play the part of visitors
RECENT_SHARE = 0.1  # each remaining person's latest ratings are hidden for testing
SHRINK = 10.0  # pulls averages built on few ratings toward zero
GIVEN = [3, 5, 10, 20, 40]  # how many ratings a "visitor" gives in the test
CLUSTERS = 16

rng = np.random.default_rng(SEED)
clock = time.time()


def log(*msg):
    print(f"[{time.time() - clock:6.0f}s]", *msg, flush=True)


def rmse(pred, actual):
    return float(np.sqrt(np.mean((np.clip(pred, 0.5, 5) - actual) ** 2)))


# ------------------------------------------------------------------- load

user = np.load(DIR / "userId.npy")
movie = np.load(DIR / "movieId.npy")
rating = np.load(DIR / "rating.npy")
total_ratings, total_users = len(rating), len(np.unique(user))

ids, counts = np.unique(movie, return_counts=True)
keep_ids = ids[counts >= MIN_RATINGS]
film_of = np.full(ids.max() + 1, -1, np.int32)
film_of[keep_ids] = np.arange(len(keep_ids), dtype=np.int32)
ok = film_of[movie] >= 0
user, rating, film = user[ok], rating[ok], film_of[movie[ok]]
del movie, ok
n_films = len(keep_ids)

# People as consecutive numbers; the arrays are already sorted by person, then time.
people, person, per_person = np.unique(user, return_inverse=True, return_counts=True)
person = person.astype(np.int32)
del user
n_people = len(people)
start = np.concatenate([[0], np.cumsum(per_person)])
log(f"{len(rating):,} ratings, {n_people:,} people, {n_films:,} films")

# Hold out some people entirely, then hide each remaining person's latest ratings.
new_people = rng.choice(n_people, NEW_PEOPLE, replace=False)
is_new = np.zeros(n_people, bool)
is_new[new_people] = True
if args.users:
    pool = np.flatnonzero(~is_new)
    drop = np.ones(n_people, bool)
    drop[rng.choice(pool, args.users, replace=False)] = False
    drop[new_people] = False
else:
    drop = np.zeros(n_people, bool)

position = np.arange(len(rating), dtype=np.int32) - start[person].astype(np.int32)  # 0 = first rating
hidden_from = (per_person - np.floor(per_person * RECENT_SHARE)).astype(np.int32)
recent = position >= hidden_from[person]
del position
train = ~is_new[person] & ~recent & ~drop[person]
test = ~is_new[person] & recent & ~drop[person]
log(f"train {train.sum():,}  recent test {test.sum():,}  new people {NEW_PEOPLE:,}")

# --------------------------------------------- averages (the simple model)

tp, tf, tr = person[train], film[train], rating[train]
mu = float(tr.mean())
n_f = np.bincount(tf, minlength=n_films)
b_film = (np.bincount(tf, tr - np.float32(mu), minlength=n_films) / (n_f + SHRINK)).astype(np.float32)
n_p = np.bincount(tp, minlength=n_people)
resid = tr - np.float32(mu) - b_film[tf]
b_person = (np.bincount(tp, resid, minlength=n_people) / (n_p + SHRINK)).astype(np.float32)
resid -= b_person[tp]

# ------------------------------------------------------ matrix factorization


def groups(keys, n):
    """Sort order and slice boundaries that gather ratings by key."""
    order = np.argsort(keys, kind="stable")
    bounds = np.concatenate([[0], np.cumsum(np.bincount(keys, minlength=n))])
    return order, bounds


def solve_side(bounds, others, values, factors, lam):
    """One half of alternating least squares: with the other side's factors
    fixed, each row's best factors are a small ridge regression."""
    k = factors.shape[1]
    out = np.zeros((len(bounds) - 1, k), np.float32)
    for g in range(len(bounds) - 1):
        s, e = bounds[g], bounds[g + 1]
        if e == s:
            continue
        f = factors[others[s:e]]
        a = f.T @ f
        a.flat[:: k + 1] += lam * (e - s)
        out[g] = np.linalg.solve(a, f.T @ values[s:e])
    return out


def dots(P, Q, people_idx, film_idx, chunk=1_000_000):
    """Row-by-row dot products, in pieces: gathering the factors for tens of
    millions of ratings at once would need several gigabytes."""
    out = np.empty(len(people_idx), np.float32)
    for s in range(0, len(out), chunk):
        e = s + chunk
        out[s:e] = np.einsum("ij,ij->i", P[people_idx[s:e]], Q[film_idx[s:e]])
    return out


cache = DIR / (f"factors-{args.users}.npz" if args.users else "factors.npz")
if cache.exists() and not args.retrain:
    saved = np.load(cache)
    P, Q = saved["P"], saved["Q"]
    log("loaded cached factors")
else:
    xp, xf, xr = person[test], film[test], rating[test]
    by_person, person_bounds = groups(tp, n_people)
    by_film, film_bounds = groups(tf, n_films)
    p_others, p_vals = tf[by_person], resid[by_person]
    f_others, f_vals = tp[by_film], resid[by_film]
    del by_person, by_film
    Q = (rng.standard_normal((n_films, RANK)) * 0.1).astype(np.float32)
    for it in range(args.iters):
        P = solve_side(person_bounds, p_others, p_vals, Q, LAM)
        Q = solve_side(film_bounds, f_others, f_vals, P, LAM)
        held = rmse(mu + b_film[xf] + b_person[xp] + dots(P, Q, xp, xf), xr)
        log(f"iteration {it + 1}: recent test {held:.4f}")
    np.savez(cache, P=P, Q=Q)
    del p_others, p_vals, f_others, f_vals

# ------------------------------------------- test 1: people's latest ratings

xp, xf, xr = person[test], film[test], rating[test]
recent_test = {
    "ratings": int(test.sum()),
    "methods": [
        {"name": "Overall average", "rmse": round(rmse(np.full(len(xr), mu), xr), 4)},
        {"name": "Film and viewer averages", "rmse": round(rmse(mu + b_film[xf] + b_person[xp], xr), 4)},
        {
            "name": "This model",
            "rmse": round(rmse(mu + b_film[xf] + b_person[xp] + dots(P, Q, xp, xf), xr), 4),
        },
    ],
}
log("recent test", recent_test["methods"])
if args.users:
    raise SystemExit("quick trial: stopping before the visitor test and the map")

# ------------------------------------------------------- the films on the map

map_films = np.argsort(-n_f)[:MAP_FILMS]  # indices into the model's films, most-rated first
map_slot = np.full(n_films, -1, np.int32)
map_slot[map_films] = np.arange(MAP_FILMS, dtype=np.int32)
QM = Q[map_films].astype(np.float64)
bM = b_film[map_films]

# The browser gets the factors as 8-bit integers; test with the same rounding.
factor_scale = float(np.abs(QM).max()) / 127
QM8 = np.round(QM / factor_scale).astype(np.int8)
QMq = QM8.astype(np.float64) * factor_scale

# ---------------------------------------------- test 2: brand-new "visitors"


def place(q_given, target, lam, lam_bias):
    """Find a newcomer's factors and generosity from a few ratings: a ridge
    regression on the rated films' factors. The page runs this same step.
    `lam` is (fixed part, part per rating given), as in training, where the
    penalty grows with the number of ratings."""
    k = q_given.shape[1]
    x = np.hstack([q_given, np.ones((len(target), 1))])
    a = x.T @ x
    a[np.arange(k), np.arange(k)] += lam[0] + lam[1] * len(target)
    a[k, k] += lam_bias
    w = np.linalg.solve(a, x.T @ target)
    return w[:k], w[k]


need = max(GIVEN) + 20
visitors = []
for p in new_people:
    s, e = start[p], start[p + 1]
    slots = map_slot[film[s:e]]
    on_map = slots >= 0
    if on_map.sum() < need:
        continue
    order = rng.permutation(int(on_map.sum()))
    visitors.append((slots[on_map][order], rating[s:e][on_map][order].astype(np.float64)))
half = len(visitors) // 2
tune, report = visitors[:half], visitors[half:]
log(f"{len(visitors):,} held-out people have {need}+ ratings on map films")


def visitor_errors(group, lam, lam_bias, given_counts):
    """Squared errors on each person's ratings past the first 40, having seen
    only the first few. The same ratings are scored whatever the number seen."""
    out = {g: [] for g in given_counts}
    for slots, stars in group:
        target = stars - mu - bM[slots]
        ev = slice(max(GIVEN), None)
        for g in given_counts:
            p_vec, gen = place(QMq[slots[:g]], target[:g], lam, lam_bias)
            pred = mu + bM[slots[ev]] + gen + QMq[slots[ev]] @ p_vec
            out[g].append((np.clip(pred, 0.5, 5) - stars[ev]) ** 2)
    return {g: float(np.sqrt(np.mean(np.concatenate(v)))) for g, v in out.items()}


best = None
for fixed in (0.4, 1.0, 2.0, 3.0, 5.0):
    for per_rating in (0.0, 0.03, 0.06):
        for lam_bias in (1.0, 3.0, 6.0):
            scores = visitor_errors(tune[:1500], (fixed, per_rating), lam_bias, GIVEN)
            score = float(np.mean(list(scores.values())))
            if args.explore:
                print(fixed, per_rating, lam_bias, {g: round(v, 4) for g, v in scores.items()}, round(score, 4))
            if best is None or score < best[0]:
                best = (score, (fixed, per_rating), lam_bias)
_, LAM_FOLD, LAM_BIAS = best
log(f"fold-in regularisation chosen on the tuning half: {LAM_FOLD}, {LAM_BIAS}")

model_curve = visitor_errors(report, LAM_FOLD, LAM_BIAS, GIVEN)

# Two simpler ways to guess a newcomer's ratings, on the same held-back ratings.
film_only, generous = [], {g: [] for g in GIVEN}
for slots, stars in report:
    ev = slice(max(GIVEN), None)
    base = mu + bM[slots[ev]]
    film_only.append((np.clip(base, 0.5, 5) - stars[ev]) ** 2)
    for g in GIVEN:
        gen = float(np.sum(stars[:g] - mu - bM[slots[:g]]) / (g + LAM_BIAS))
        generous[g].append((np.clip(base + gen, 0.5, 5) - stars[ev]) ** 2)
film_only_rmse = float(np.sqrt(np.mean(np.concatenate(film_only))))
generous_curve = {g: float(np.sqrt(np.mean(np.concatenate(v)))) for g, v in generous.items()}

# With ten ratings: are the model's picks films the person went on to like?
# And does everyone get the same list? Two ways of ranking are scored: by
# predicted rating ("safe"), and by how much more a film suits this person
# than the average viewer ("personal"), keeping only films predicted at
# PERSONAL_FLOOR stars or more. The page offers both.
TEN, PICKS = 10, 10
PERSONAL_FLOOR = 3.5
liked = {"safe": [], "personal": [], "acclaimed": [], "any": []}
recommended = {"safe": np.zeros(MAP_FILMS, np.int64), "personal": np.zeros(MAP_FILMS, np.int64)}
for slots, stars in report:
    target = stars - mu - bM[slots]
    p_vec, gen = place(QMq[slots[:TEN]], target[:TEN], LAM_FOLD, LAM_BIAS)
    match = QMq @ p_vec  # how well every map film suits this person
    stars_hat = np.clip(mu + bM + gen + match, 0.5, 5)
    personal = np.where(stars_hat >= PERSONAL_FLOOR, match, -np.inf)
    ev_slots, ev_stars = slots[TEN:], stars[TEN:]
    liked["safe"].append(np.mean(ev_stars[np.argsort(-stars_hat[ev_slots])[:PICKS]] >= 4))
    liked["personal"].append(np.mean(ev_stars[np.argsort(-personal[ev_slots])[:PICKS]] >= 4))
    liked["acclaimed"].append(np.mean(ev_stars[np.argsort(-bM[ev_slots])[:PICKS]] >= 4))
    liked["any"].append(np.mean(ev_stars >= 4))
    for name, score in (("safe", stars_hat.copy()), ("personal", personal.copy())):
        score[slots[:TEN]] = -np.inf
        recommended[name][np.argsort(-score)[:PICKS]] += 1


def spread(counts):
    return {
        "distinctFilms": int((counts > 0).sum()),
        "top20Share": round(float(np.sort(counts)[::-1][:20].sum() / counts.sum()), 3),
    }


visitor_test = {
    "people": len(report),
    "given": GIVEN,
    "filmOnly": round(film_only_rmse, 4),
    "generosity": [round(generous_curve[g], 4) for g in GIVEN],
    "model": [round(model_curve[g], 4) for g in GIVEN],
    "picks": {
        "given": TEN,
        "count": PICKS,
        "personalFloor": PERSONAL_FLOOR,
        "likedAcclaimed": round(float(np.mean(liked["acclaimed"])), 3),
        "likedAny": round(float(np.mean(liked["any"])), 3),
        "safe": {"liked": round(float(np.mean(liked["safe"])), 3), **spread(recommended["safe"])},
        "personal": {"liked": round(float(np.mean(liked["personal"])), 3), **spread(recommended["personal"])},
    },
}
log("visitor test", visitor_test)

# -------------------------------------------------------- titles and genres

movies = pd.read_csv(DIR / "ml-32m" / "movies.csv").set_index("movieId")
ARTICLE = re.compile(r"^(.*), (The|A|An|Les|La|Le|L'|Il|Der|Das|Die|El|Los|Las)$")


def clean_title(raw):
    year = None
    m = re.search(r"\((\d{4})\)\s*$", raw)
    if m:
        year = int(m.group(1))
        raw = raw[: m.start()].strip()
    # Drop alternative titles in brackets, then move a trailing article forward.
    while raw.endswith(")") and "(" in raw:
        raw = raw[: raw.rindex("(")].strip()
    m = ARTICLE.match(raw)
    if m:
        joiner = "" if m.group(2).endswith("'") else " "
        raw = f"{m.group(2)}{joiner}{m.group(1)}"
    return raw, year


map_movie_ids = keep_ids[map_films]
titles, years, genre_lists = [], [], []
for mid in map_movie_ids:
    row = movies.loc[int(mid)]
    title, year = clean_title(row["title"])
    titles.append(title)
    years.append(year)
    # "IMAX" is a screening format, not a kind of film, so it is left out.
    genre_lists.append([g for g in row["genres"].split("|") if g not in ("(no genres listed)", "IMAX")])
GENRES = sorted({g for gl in genre_lists for g in gl})
genre_matrix = np.array([[g in gl for g in GENRES] for gl in genre_lists])

# ------------------------------------------------------------ the 2D layout

unit = QM / np.linalg.norm(QM, axis=1, keepdims=True)
xy = TSNE(
    n_components=2, perplexity=35, metric="cosine", init="pca", learning_rate="auto", random_state=SEED
).fit_transform(unit)
xy = xy - xy.min(axis=0)
xy = xy / xy.max() * 1000  # the longer side runs 0 to 1000
view = [int(np.ceil(xy[:, 0].max())), int(np.ceil(xy[:, 1].max()))]

# Name each region of the map by the genres that are unusually common there.
km = KMeans(n_clusters=CLUSTERS, n_init=10, random_state=SEED).fit(xy)
overall = genre_matrix.mean(axis=0)
year_arr = np.array([y or 0 for y in years])
clusters = []
for c in range(CLUSTERS):
    members = np.flatnonzero(km.labels_ == c)
    share = genre_matrix[members].mean(axis=0)
    lift = np.where(share >= 0.22, share / overall, 0)
    names = [GENRES[i] for i in np.argsort(-lift)[:2] if lift[i] > 1.25]
    known = year_arr[members][year_arr[members] > 0]
    median_year = int(np.median(known))
    if median_year < 1975:
        names = ["Classics"] + names[:1]
    label = " · ".join(names) if names else "Mixed"
    popular = members[np.argsort(map_slot[map_films[members]])]  # most-rated first
    clusters.append(
        {
            "label": label,
            "x": round(float(np.median(xy[members, 0])), 1),
            "y": round(float(np.median(xy[members, 1])), 1),
            "n": int(len(members)),
            "year": median_year,
            "top": [int(i) for i in popular[:6]],
            "lift": float(np.sort(lift)[::-1][0]),
        }
    )

# Films to offer first: the most-rated film of every region, so the first few
# ratings cover very different kinds of film.
starters = [c["top"][0] for c in clusters]

# Sample tastes for visitors in a hurry: love the best-known films of one
# region and dislike those of the region least like it. The regions are
# chosen to be as unlike each other as possible, and each sample is named
# after its best-known film, since that says exactly what it contains.
centroids = np.array([unit[np.flatnonzero(km.labels_ == c)].mean(axis=0) for c in range(CLUSTERS)])
similarity = centroids @ centroids.T
chosen = [int(np.argmax([cl["lift"] for cl in clusters]))]
while len(chosen) < 5:
    chosen.append(int(np.argmin(similarity[chosen].max(axis=0))))
presets = []
for c in chosen:
    far = int(np.argmin(similarity[c]))
    presets.append(
        {
            "label": "Fans of " + titles[clusters[c]["top"][0]].split(":")[0],
            "ratings": [[i, 5] for i in clusters[c]["top"][:6]] + [[i, 2] for i in clusters[far]["top"][:3]],
        }
    )

# ------------------------------------------------------------------ write

posters = json.loads(POSTERS.read_text()) if POSTERS.exists() else {}
mean_rating = np.bincount(tf, tr, minlength=n_films) / np.maximum(n_f, 1)
films = []
for i, mid in enumerate(map_movie_ids):
    mask = int(sum(1 << g for g in np.flatnonzero(genre_matrix[i])))
    films.append(
        [
            titles[i],
            years[i],
            round(float(xy[i, 0]), 1),
            round(float(xy[i, 1]), 1),
            round(float(bM[i]), 3),
            int(n_f[map_films[i]]),
            round(float(mean_rating[map_films[i]]), 2),
            posters.get(str(int(mid))),
            mask,
            int(km.labels_[i]),
        ]
    )

out = {
    "meta": {
        "ratings": int(total_ratings),
        "people": int(total_users),
        "modelFilms": int(n_films),
        "trainRatings": int(train.sum()),
        "rank": RANK,
        "mu": round(mu, 4),
        "factorScale": factor_scale,
        "foldLam": LAM_FOLD[0],
        "foldLamPerRating": LAM_FOLD[1],
        "foldLamBias": LAM_BIAS,
        "view": view,
        "minRatings": MIN_RATINGS,
    },
    "genres": GENRES,
    "films": films,
    "factors": base64.b64encode(QM8.tobytes()).decode(),
    "clusters": [{k: v for k, v in c.items() if k not in ("top", "lift")} for c in clusters],
    "starters": starters,
    "presets": presets,
    "tests": {"recent": recent_test, "visitors": visitor_test},
}
OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))

log("clusters:", [(c["label"], c["n"], c["year"]) for c in clusters])
log("starters:", [titles[i] for i in starters])
log("presets:", [(p["label"], [titles[i] for i, _ in p["ratings"]]) for p in presets])
log("posters:", sum(1 for f in films if f[7]), "of", len(films))
log("bytes", OUT.stat().st_size)
