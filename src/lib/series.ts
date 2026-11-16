/** Deterministic synthetic series with a handful of level shifts. */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeries(seed: number, n = 240): number[] {
  const rand = mulberry32(seed);
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  // Pick 3-5 shift locations, at least `gap` points apart.
  const gap = 26;
  const target = 3 + Math.floor(rand() * 3);
  const shifts: number[] = [];
  for (let tries = 0; shifts.length < target && tries < 200; tries++) {
    const p = gap + Math.floor(rand() * (n - 2 * gap));
    if (shifts.every((q) => Math.abs(q - p) >= gap)) shifts.push(p);
  }
  shifts.sort((a, b) => a - b);

  const y: number[] = [];
  let level = 0;
  let noise = 0;
  let next = 0;
  for (let i = 0; i < n; i++) {
    if (i === shifts[next]) {
      const size = 2.2 + rand() * 2.6;
      // Bias jumps back toward zero so the series stays in frame.
      const up = level > 3 ? false : level < -3 ? true : rand() < 0.5;
      level += up ? size : -size;
      next++;
    }
    noise = 0.35 * noise + 0.85 * gauss();
    y.push(level + noise);
  }
  return y;
}
