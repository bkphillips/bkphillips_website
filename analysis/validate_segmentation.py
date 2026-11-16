"""Check the site's TypeScript segmentation against ruptures.

For several synthetic series, compare the change points and total cost from
src/lib/segmentation.ts with ruptures' exact dynamic programming (rpt.Dynp),
for both models and every number of change points up to MAX_K.

    python analysis/validate_segmentation.py
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import ruptures as rpt

ROOT = Path(__file__).resolve().parent.parent
NODE = ROOT / ".tools" / "node" / "bin" / "node"
MAX_K = 8
MIN_SIZE = 6


def series(seed: int, kind: str, n: int = 300) -> np.ndarray:
    rng = np.random.default_rng(seed)
    if kind == "steps":
        cuts = np.sort(rng.choice(np.arange(30, n - 30, 10), 4, replace=False))
        levels = rng.normal(0, 3, 5)
        return np.repeat(levels, np.diff([0, *cuts, n])) + rng.normal(0, 1, n)
    if kind == "kinked":
        cuts = np.sort(rng.choice(np.arange(30, n - 30, 10), 3, replace=False))
        slopes = rng.normal(0, 0.15, 4)
        return np.cumsum(np.repeat(slopes, np.diff([0, *cuts, n]))) + rng.normal(0, 0.6, n)
    return np.cumsum(rng.normal(0.02, 1, n))  # random walk with drift


def typescript(y: np.ndarray, model: str) -> dict:
    payload = json.dumps({"y": y.tolist(), "model": model, "maxK": MAX_K, "minSize": MIN_SIZE})
    node = str(NODE) if NODE.exists() else "node"
    out = subprocess.run(
        [node, str(ROOT / "analysis" / "run_segmentation.mjs")],
        input=payload, capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def reference(y: np.ndarray, model: str, k: int) -> tuple[list[int], float]:
    n = len(y)
    if model == "level":
        algo = rpt.Dynp(model="l2", min_size=MIN_SIZE, jump=1).fit(y.reshape(-1, 1))
    else:
        # CostLinear: first column is the response, the rest are regressors.
        signal = np.column_stack([y, np.arange(n), np.ones(n)])
        algo = rpt.Dynp(model="linear", min_size=MIN_SIZE, jump=1).fit(signal)
    bkps = algo.predict(n_bkps=k)
    return bkps[:-1], algo.cost.sum_of_costs(bkps)


def main() -> int:
    checked = mismatched = 0
    for kind in ("steps", "kinked", "walk"):
        for seed in range(4):
            y = series(seed, kind)
            for model in ("level", "trend"):
                ts = typescript(y, model)
                for k in range(1, MAX_K + 1):
                    cps, cost = reference(y, model, k)
                    checked += 1
                    same_points = ts["changePoints"][k] == cps
                    same_cost = np.isclose(ts["cost"][k], cost, rtol=1e-6, atol=1e-6)
                    # Different points with equal cost is a tie, not an error.
                    if not same_points and not same_cost:
                        mismatched += 1
                        print(f"MISMATCH {kind} seed={seed} {model} k={k}: "
                              f"ts={ts['changePoints'][k]} ({ts['cost'][k]:.4f}) "
                              f"ruptures={cps} ({cost:.4f})")
    print(f"{checked - mismatched} of {checked} segmentations match ruptures")
    return 1 if mismatched else 0


if __name__ == "__main__":
    sys.exit(main())
