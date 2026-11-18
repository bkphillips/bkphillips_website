"""Convert MovieLens ratings.csv into compact arrays, once.

The CSV is 877 MB; as typed arrays the same ratings load in a second. Reads
analysis/data/movielens/ml-32m/ratings.csv and writes four .npy files beside
it, sorted by user and then by time.

Run with:  analysis/.venv/bin/python -I analysis/prep_movielens.py
"""

from pathlib import Path

import numpy as np
import pandas as pd

DIR = Path(__file__).resolve().parent / "data" / "movielens"

parts = {"userId": [], "movieId": [], "rating": [], "timestamp": []}
dtypes = {"userId": "int32", "movieId": "int32", "rating": "float32", "timestamp": "int64"}
for chunk in pd.read_csv(DIR / "ml-32m" / "ratings.csv", dtype=dtypes, chunksize=4_000_000):
    for k in parts:
        parts[k].append(chunk[k].to_numpy())
cols = {k: np.concatenate(v) for k, v in parts.items()}
order = np.lexsort((cols["timestamp"], cols["userId"]))
for k, v in cols.items():
    np.save(DIR / f"{k}.npy", v[order])
print(len(order), "ratings,", len(np.unique(cols["userId"])), "users,", len(np.unique(cols["movieId"])), "movies")
