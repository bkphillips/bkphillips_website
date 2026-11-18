"""Look up poster addresses on TMDB for the films on the taste map.

MovieLens gives a TMDB id for each film (links.csv). This asks TMDB for each
film's poster path, once, and caches the answers in
analysis/cache/tmdb-posters.json so later runs make no requests. Only the
path is kept; the browser loads the image from TMDB's image server.

Needs TMDB_READ_TOKEN in .env.local. This product uses the TMDB API but is
not endorsed or certified by TMDB.

Run with:  analysis/.venv/bin/python -I analysis/fetch_posters.py [count]
"""

import json
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "analysis" / "data" / "movielens"
CACHE = ROOT / "analysis" / "cache" / "tmdb-posters.json"
COUNT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000


def read_token():
    for line in (ROOT / ".env.local").read_text().splitlines():
        if line.startswith("TMDB_READ_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"')
    return ""


# The python.org build of Python on macOS ships without root certificates, so
# point it at the system's bundle rather than turning verification off.
SYSTEM_CERTS = Path("/etc/ssl/cert.pem")
TLS = ssl.create_default_context(cafile=str(SYSTEM_CERTS) if SYSTEM_CERTS.exists() else None)

TOKEN = read_token()
if not TOKEN:
    sys.exit("TMDB_READ_TOKEN is not set in .env.local")

ids, counts = np.unique(np.load(DIR / "movieId.npy"), return_counts=True)
top = ids[np.argsort(-counts)][:COUNT]
links = pd.read_csv(DIR / "ml-32m" / "links.csv").set_index("movieId")["tmdbId"]

cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
todo = [int(m) for m in top if str(int(m)) not in cache]
print(f"{len(top)} films, {len(todo)} to look up")


def lookup(movie_id):
    tmdb = links.get(movie_id)
    if pd.isna(tmdb):
        return movie_id, None
    req = urllib.request.Request(
        f"https://api.themoviedb.org/3/movie/{int(tmdb)}",
        headers={"Authorization": f"Bearer {TOKEN}", "accept": "application/json"},
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=20, context=TLS) as res:
                return movie_id, json.load(res).get("poster_path")
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return movie_id, None
            if err.code == 401:
                raise SystemExit("TMDB rejected the token (401)") from None
            time.sleep(2 + 3 * attempt if err.code == 429 else 1)
        except (urllib.error.URLError, TimeoutError) as err:
            problem[0] = str(err)
            time.sleep(1 + attempt)
    return movie_id, "ERROR"


problem = [""]
done = 0
with ThreadPoolExecutor(max_workers=4) as pool:
    for movie_id, path in pool.map(lookup, todo):
        if path != "ERROR":
            cache[str(movie_id)] = path
        done += 1
        if done % 250 == 0:
            CACHE.write_text(json.dumps(cache, separators=(",", ":")))
            print(done, "done", flush=True)
            time.sleep(0.5)

CACHE.write_text(json.dumps(cache, separators=(",", ":")))
have = sum(1 for m in top if cache.get(str(int(m))))
print(f"posters found for {have} of {len(top)} films")
if problem[0]:
    print("last connection problem:", problem[0])
