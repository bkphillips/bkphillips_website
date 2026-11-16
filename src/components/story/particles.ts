import * as THREE from "three";

export type StoryData = {
  generated: string;
  globe: {
    years: [number, number];
    world: number[];
    countries: number[][];
    dots: number[];
  };
  covid: {
    from: string;
    to: string;
    peak: number;
    peakWeek: number;
    values: number[];
    warnings: { warning: number; surge: number; peak: number }[];
  };
  usa: { population: number; peoplePerDot: number; points: number[]; outline: number[] };
  org: { company: string; count: number; people: number[] };
};

export const PARTICLES = 9000;
const GLOBE_RADIUS = 2.1;
const MAP_SCALE = 1.12; // the data file's map is six units wide
// The case curve runs from -3 to +3 across, rising from its baseline.
const CURVE_HALF_WIDTH = 3;
const CURVE_BASE = -1.45;
const CURVE_HEIGHT = 3.1;

/** Small deterministic random source, so the sculpture looks the same on every visit. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const vertexShader = /* glsl */ `
  #define CURVE_HALF_WIDTH ${CURVE_HALF_WIDTH.toFixed(2)}
  #define CURVE_BASE ${CURVE_BASE.toFixed(2)}
  attribute vec3 aCurve;
  attribute vec3 aMap;
  attribute vec3 aOrg;
  attribute vec4 aAlpha;   // per shape: globe, curve, map, org
  attribute vec4 aSize;
  attribute vec3 aKind;    // colour class for curve, map, org: 0 ink, 1 accent, 2 signal, 3 alert
  attribute vec2 aBurden;  // globe: value this year and next year (0-1, negative = no data)
  attribute vec2 aMisc;    // x: random seed, y: order in which the map's lights come on

  uniform float uFrom;
  uniform float uTo;
  uniform float uT;
  uniform float uYear;     // fraction of the way from this year to the next
  uniform float uFill;     // share of the map's lights that are on
  uniform float uTrace;    // how far along the case curve has been drawn, 0-1
  uniform float uTime;
  uniform float uPx;
  uniform float uAspect;
  uniform vec2 uPointer;
  uniform float uPointerOn;
  uniform vec3 uInk;
  uniform vec3 uAccent;
  uniform vec3 uSignal;
  uniform vec3 uAlert;

  varying vec3 vColor;
  varying float vAlpha;

  vec3 kindColor(float k) {
    return k < 0.5 ? uInk : (k < 1.5 ? uAccent : (k < 2.5 ? uSignal : uAlert));
  }

  void shape(float index, out vec3 p, out vec3 c, out float a, out float s) {
    if (index < 0.5) {
      float has = step(0.0, aBurden.x);
      float b = max(mix(aBurden.x, aBurden.y, uYear), 0.0) * has;
      p = position * (1.0 + 0.22 * b);
      c = mix(uInk, uSignal, smoothstep(0.3, 0.95, b));
      // Dots on the far side of the globe stay visible but faint.
      float facing = normalize((modelViewMatrix * vec4(normalize(position), 0.0)).xyz).z;
      a = aAlpha.x * mix(0.16, 1.0, smoothstep(-0.25, 0.3, facing));
      s = aSize.x * (0.75 + 1.1 * b);
    } else if (index < 1.5) {
      p = aCurve; c = kindColor(aKind.x); a = aAlpha.y; s = aSize.y;
      // The curve is drawn from left to right. Dots wait on the baseline and
      // rise as the pen passes; warning lines switch on when it reaches them.
      float along = (aCurve.x + CURVE_HALF_WIDTH) / (2.0 * CURVE_HALF_WIDTH);
      float drawn = smoothstep(along, along + 0.02, uTrace);
      if (aKind.x > 2.5) {
        a *= drawn;
        s *= 1.0 + 0.6 * drawn * (1.0 - smoothstep(along + 0.02, along + 0.08, uTrace));
      } else {
        p.y = mix(CURVE_BASE, p.y, drawn);
        a *= mix(0.5, 1.0, drawn);
        // The pen's head glows.
        float head = drawn * (1.0 - smoothstep(along + 0.01, along + 0.05, uTrace));
        c = mix(c, uAccent, head);
        s *= 1.0 + 0.9 * head;
      }
    } else if (index < 2.5) {
      // A little warmth, like city lights.
      p = aMap; c = mix(kindColor(aKind.y), uSignal, 0.24); s = aSize.z;
      a = aAlpha.z * smoothstep(aMisc.y - 0.02, aMisc.y, uFill);
    } else {
      p = aOrg; c = kindColor(aKind.z); a = aAlpha.w; s = aSize.w;
    }
  }

  void main() {
    vec3 p0; vec3 c0; float a0; float s0;
    vec3 p1; vec3 c1; float a1; float s1;
    shape(uFrom, p0, c0, a0, s0);
    shape(uTo, p1, c1, a1, s1);

    // Each dot leaves and arrives at its own moment.
    float seed = aMisc.x;
    float t = smoothstep(seed * 0.35, seed * 0.35 + 0.65, uT);

    vec3 p = mix(p0, p1, t);
    vec3 drift = normalize(vec3(sin(seed * 91.7), cos(seed * 57.3), sin(seed * 23.1 + 1.3)));
    p += drift * sin(3.14159 * t) * (0.35 + 0.6 * seed);
    p += 0.012 * vec3(
      sin(uTime * 0.9 + seed * 40.0),
      cos(uTime * 0.7 + seed * 33.0),
      sin(uTime * 0.8 + seed * 21.0));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;

    // The pointer pushes nearby dots aside, measured on screen.
    vec2 away = (clip.xy / clip.w - uPointer) * vec2(uAspect, 1.0);
    float push = uPointerOn * smoothstep(0.34, 0.0, length(away)) * 0.12;
    clip.xy += normalize(away + 1e-5) / vec2(uAspect, 1.0) * push * clip.w;

    gl_Position = clip;
    gl_PointSize = mix(s0, s1, t) * uPx * (10.0 / -mv.z);
    vColor = mix(c0, c1, t);
    vAlpha = mix(a0, a1, t);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5 || vAlpha < 0.01) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.32, r));
    #include <colorspace_fragment>
  }
`;

export function createParticles(data: StoryData) {
  const N = PARTICLES;
  const rand = seeded(7);
  const pick = (n: number) => Math.floor(rand() * n);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(2 * Math.PI * rand());

  const globe = new Float32Array(N * 3);
  const curve = new Float32Array(N * 3);
  const map = new Float32Array(N * 3);
  const org = new Float32Array(N * 3);
  const alpha = new Float32Array(N * 4);
  const size = new Float32Array(N * 4);
  const kind = new Float32Array(N * 3);
  const burden = new Float32Array(N * 2).fill(-1);
  const misc = new Float32Array(N * 2);
  /** Row of the country table behind each dot, or -1. */
  const country = new Int32Array(N).fill(-1);

  // --- Globe: land points ---------------------------------------------------
  const dots = data.globe.dots;
  const land = dots.length / 3;
  for (let i = 0; i < N; i++) {
    const d = (i < land ? i : pick(land)) * 3;
    const lat = (dots[d] / 10) * (Math.PI / 180);
    const lon = (dots[d + 1] / 10) * (Math.PI / 180);
    globe[i * 3] = GLOBE_RADIUS * Math.cos(lat) * Math.sin(lon);
    globe[i * 3 + 1] = GLOBE_RADIUS * Math.sin(lat);
    globe[i * 3 + 2] = GLOBE_RADIUS * Math.cos(lat) * Math.cos(lon);
    if (i < land) {
      country[i] = dots[d + 2];
      alpha[i * 4] = country[i] >= 0 ? 1 : 0.4;
    }
    size[i * 4] = 1;
    misc[i * 2] = rand();
  }

  // --- Curve: weekly cases as a filled area ----------------------------------
  const weeks = data.covid.values.map((v) => v / 1000);
  const W = weeks.length;
  const cumulative: number[] = [];
  weeks.reduce((sum, v, i) => (cumulative[i] = sum + v + 0.012), 0);
  const total = cumulative[W - 1];
  // Early warnings: a vertical line of dots at each warning week.
  const warnings = data.covid.warnings.map((w) => w.warning);
  const LINE_DOTS = 110;
  const lineDots = warnings.length * LINE_DOTS;
  const xOfWeek = (week: number) => -CURVE_HALF_WIDTH + (week / W) * CURVE_HALF_WIDTH * 2;
  for (let i = 0; i < N; i++) {
    if (i < lineDots) {
      const step = (i % LINE_DOTS) / (LINE_DOTS - 1);
      curve[i * 3] = xOfWeek(warnings[Math.floor(i / LINE_DOTS)]);
      curve[i * 3 + 1] = CURVE_BASE + step * (CURVE_HEIGHT + 0.25);
      curve[i * 3 + 2] = 0;
      alpha[i * 4 + 1] = 1;
      size[i * 4 + 1] = 1.7;
      kind[i * 3] = 3;
      continue;
    }
    // More dots where there were more cases, so the area has even density.
    const target = rand() * total;
    let w = 0;
    while (cumulative[w] < target) w++;
    const within = rand();
    const next = weeks[Math.min(w + 1, W - 1)];
    const height = weeks[w] + (next - weeks[w]) * within;
    const outline = rand() < 0.34;
    curve[i * 3] = xOfWeek(w + within);
    curve[i * 3 + 1] = CURVE_BASE + (outline ? height : height * rand()) * CURVE_HEIGHT;
    curve[i * 3 + 2] = (rand() - 0.5) * 0.1;
    alpha[i * 4 + 1] = outline ? 1 : 0.42;
    size[i * 4 + 1] = outline ? 1.1 : 0.85;
    kind[i * 3] = 0;
  }

  // --- Map: where people live in the United States ---------------------------
  // Each population dot stands for the same number of people, so cities show
  // up as dense clusters, like lights seen from orbit. A faint outline of the
  // country fills the rest of the dots.
  const residents = data.usa.points;
  const border = data.usa.outline;
  const lit = residents.length / 2;
  const edge = border.length / 2;
  const places = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = pick(i + 1);
    [places[i], places[j]] = [places[j], places[i]];
  }
  for (let k = 0; k < N; k++) {
    const i = places[k];
    const isLight = k < lit;
    const isEdge = !isLight && k < lit + edge;
    const source = isLight ? residents : border;
    const at = (isLight ? k : isEdge ? k - lit : pick(edge)) * 2;
    map[i * 3] = (source[at] / 1000) * MAP_SCALE;
    map[i * 3 + 1] = (source[at + 1] / 1000) * MAP_SCALE;
    map[i * 3 + 2] = 0;
    alpha[i * 4 + 2] = isLight ? 0.92 : isEdge ? 0.3 : 0;
    size[i * 4 + 2] = isLight ? 0.95 : 0.6;
    kind[i * 3 + 1] = 0;
    // Lights come on in random order as the reader scrolls; the outline is always there.
    misc[i * 2 + 1] = isLight ? rand() : 0;
  }

  // --- Org: every employee in a radial tree ----------------------------------
  const people = data.org.people;
  const headcount = people.length / 3;
  let deepest = 1;
  for (let k = 0; k < headcount; k++) deepest = Math.max(deepest, people[k * 3 + 1]);
  // Spread employees across the dots at random so the morph has no visible order.
  const seats = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = pick(i + 1);
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  for (let k = 0; k < Math.min(headcount, N); k++) {
    const i = seats[k];
    const angle = people[k * 3] / 1000;
    const depth = people[k * 3 + 1];
    const role = people[k * 3 + 2];
    const r = (depth / deepest) * 2.85 + gauss() * 0.018;
    org[i * 3] = r * Math.cos(angle);
    org[i * 3 + 1] = r * Math.sin(angle);
    org[i * 3 + 2] = 0.9 - (depth / deepest) * 1.7;
    alpha[i * 4 + 3] = role ? 1 : 0.8;
    size[i * 4 + 3] = role === 2 ? 2.6 : role === 1 ? 1.5 : 0.85;
    kind[i * 3 + 2] = role;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(globe, 3));
  geometry.setAttribute("aCurve", new THREE.BufferAttribute(curve, 3));
  geometry.setAttribute("aMap", new THREE.BufferAttribute(map, 3));
  geometry.setAttribute("aOrg", new THREE.BufferAttribute(org, 3));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 4));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 4));
  geometry.setAttribute("aKind", new THREE.BufferAttribute(kind, 3));
  const burdenAttribute = new THREE.BufferAttribute(burden, 2);
  geometry.setAttribute("aBurden", burdenAttribute);
  geometry.setAttribute("aMisc", new THREE.BufferAttribute(misc, 2));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);

  const uniforms = {
    uFrom: { value: 0 },
    uTo: { value: 0 },
    uT: { value: 0 },
    uYear: { value: 0 },
    uFill: { value: 0 },
    uTrace: { value: 0 },
    uTime: { value: 0 },
    uPx: { value: 3 },
    uAspect: { value: 1 },
    uPointer: { value: new THREE.Vector2(9, 9) },
    uPointerOn: { value: 0 },
    uInk: { value: new THREE.Color() },
    uAccent: { value: new THREE.Color() },
    uSignal: { value: new THREE.Color() },
    uAlert: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  // Load one year of data into the globe: each dot gets its country's value
  // for that year and the next, and the shader blends between them.
  let loadedYear = -1;
  const table = data.globe.countries;
  const lastYear = table[0].length - 1;
  const setYear = (index: number) => {
    const y = Math.max(0, Math.min(lastYear, index));
    if (y === loadedYear) return;
    loadedYear = y;
    const y2 = Math.min(y + 1, lastYear);
    for (let i = 0; i < N; i++) {
      const row = country[i];
      if (row < 0) continue;
      const a = table[row][y];
      const b = table[row][y2];
      burden[i * 2] = a < 0 ? -1 : a / 100;
      burden[i * 2 + 1] = (b < 0 ? a : b) / 100;
    }
    burdenAttribute.needsUpdate = true;
  };
  setYear(0);

  return { points: new THREE.Points(geometry, material), uniforms, setYear, yearCount: lastYear + 1 };
}
