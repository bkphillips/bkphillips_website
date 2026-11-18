"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { createStage, type Palette } from "@/components/sculpture/stage";

type TerrainData = {
  generated: string;
  dates: string[];
  series: {
    id: string;
    label: string;
    v: number[];
    cps: number[];
    /** Per change point: top articles from around that date (t title, s source, u url, d date). */
    news?: { t: string; s: string; u: string; d: string }[][];
    /** Per change point: % change in the series' average, period after vs period before. */
    shift?: number[];
    /** Per change point: an AI-written caption and the article it rests on. */
    insight?: (Insight | null)[];
    /** Per change point: shown automatically as the time line sweeps past. */
    featured?: boolean[];
  }[];
};

type Insight = {
  h: string; // headline
  t: string; // one or two sentences
  c: "high" | "medium" | "low";
  i: number;
  u?: string; // lead article
  s?: string; // its publisher
  d?: string;
};

type Hover = {
  series: number;
  index: number;
  /** Position of the hovered point inside the frame, and the frame's width. */
  x: number;
  y: number;
  frameWidth: number;
  /** Which of the series' change points the pointer is on, or -1. */
  cp: number;
};

/** The story card is docked beside the hero's text only where the frame is at least this wide. */
const DOCK_MIN_WIDTH = 900;

/** Dot size for a % change: square-root scale, so a +170% move is about three times a +5% one. */
const dotSize = (pct: number | undefined) =>
  pct === undefined
    ? 1
    : 0.7 + 1.6 * Math.sqrt(Math.min(Math.abs(pct), 160) / 160);

// World-space layout: time runs along x, one series per row along z.
const WIDTH = 10.4;
const ROW_GAP = 0.28;
const PEAK = 2.05;
const Z_LIMIT = 2.6; // z-scores beyond this are clipped

let dataPromise: Promise<TerrainData> | null = null;
const loadData = () =>
  (dataPromise ??= fetch("/data/terrain.json").then((res) => {
    if (!res.ok) throw new Error("terrain data missing");
    return res.json() as Promise<TerrainData>;
  }));

const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * `backdrop` draws the terrain as a background that fills its parent, set high
 * and a little to the right so text can sit over the lower left. Without it
 * the terrain is a self-contained figure with its own height.
 */
export default function Terrain({ backdrop = false }: { backdrop?: boolean }) {
  const router = useRouter();
  const frame = useRef<HTMLDivElement>(null);
  const dateTag = useRef<HTMLSpanElement>(null);
  const [data, setData] = useState<TerrainData | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  // The featured change point the time line is currently resting on, if any.
  const [auto, setAuto] = useState<Hover | null>(null);
  // The last dot the pointer was on: its story stays up until the next featured one.
  const [pinned, setPinned] = useState<Hover | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadData()
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const el = frame.current;
    if (!el || !data) return;
    const stage = createStage(el, 28);
    if (!stage) {
      // No WebGL: report it after this effect, and render nothing.
      queueMicrotask(() => setFailed(true));
      return;
    }
    const { scene, camera } = stage;

    const S = data.series.length;
    const T = data.dates.length;
    const depth = (S - 1) * ROW_GAP;
    const xAt = (i: number) => -WIDTH / 2 + (i / (T - 1)) * WIDTH;
    const zAt = (s: number) => depth / 2 - s * ROW_GAP; // first series nearest the viewer
    const yAt = (s: number, i: number) => {
      const z = Math.max(
        -Z_LIMIT,
        Math.min(Z_LIMIT, data.series[s].v[i] / 100),
      );
      return ((z + Z_LIMIT) / (2 * Z_LIMIT)) * PEAK;
    };

    const group = new THREE.Group();
    scene.add(group);

    // Curtains: a paper-coloured wall under each ridge hides the ridges behind it.
    const wallPositions: number[] = [];
    const wallIndex: number[] = [];
    for (let s = 0; s < S; s++) {
      const base = wallPositions.length / 3;
      for (let i = 0; i < T; i++) {
        wallPositions.push(xAt(i), yAt(s, i), zAt(s), xAt(i), -0.05, zAt(s));
      }
      for (let i = 0; i < T - 1; i++) {
        const a = base + i * 2;
        wallIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const wallGeometry = new THREE.BufferGeometry();
    wallGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(wallPositions, 3),
    );
    wallGeometry.setIndex(wallIndex);
    const wallMaterial = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    });
    group.add(new THREE.Mesh(wallGeometry, wallMaterial));

    // Ridges: one thick line per series.
    const ridgeMaterials: LineMaterial[] = [];
    const ridgeLines: Line2[] = [];
    for (let s = 0; s < S; s++) {
      const positions: number[] = [];
      for (let i = 0; i < T; i++) positions.push(xAt(i), yAt(s, i), zAt(s));
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      const material = new LineMaterial({ linewidth: 1.35 });
      ridgeMaterials.push(material);
      const line = new Line2(geometry, material);
      ridgeLines.push(line);
      group.add(line);
    }

    // Change points: a bead on the ridge at each detected trend change.
    // Its size shows how far the series' average moved; its colour shows which way.
    const marks: {
      s: number;
      k: number;
      i: number;
      pct?: number;
      base: number;
    }[] = [];
    data.series.forEach((series, s) =>
      series.cps.forEach((i, k) =>
        marks.push({
          s,
          k,
          i,
          pct: series.shift?.[k],
          base: dotSize(series.shift?.[k]),
        }),
      ),
    );
    // Featured change points, in date order: the time line rests on each in turn.
    const stops = marks
      .filter((m) => data.series[m.s].featured?.[m.k])
      .sort((a, b) => a.i - b.i);
    // White, so each bead takes its own colour.
    const beadMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const beads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.046, 14, 10),
      beadMaterial,
      marks.length,
    );
    // Drawn after the lines, so a highlighted line never paints over a dot.
    beads.renderOrder = 11;
    group.add(beads);

    // Fault lines: join change points in neighbouring series that fall within
    // a few weeks of each other, so shifts shared across markets read as one line.
    const faultPositions: number[] = [];
    for (let s = 0; s < S - 1; s++) {
      for (const i of data.series[s].cps) {
        const near = data.series[s + 1].cps
          .filter((j) => Math.abs(j - i) <= 5)
          .sort((a, b) => Math.abs(a - i) - Math.abs(b - i))[0];
        if (near === undefined) continue;
        faultPositions.push(
          xAt(i),
          yAt(s, i) + 0.01,
          zAt(s),
          xAt(near),
          yAt(s + 1, near) + 0.01,
          zAt(s + 1),
        );
      }
    }
    const faultGeometry = new THREE.BufferGeometry();
    faultGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(faultPositions, 3),
    );
    const faultMaterial = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.45,
    });
    group.add(new THREE.LineSegments(faultGeometry, faultMaterial));

    // Scan: a faint sheet that sweeps through time; beads flare as it passes.
    const scanMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const scan = new THREE.Mesh(
      new THREE.PlaneGeometry(depth + 0.8, PEAK + 0.5),
      scanMaterial,
    );
    scan.rotation.y = Math.PI / 2;
    scan.position.y = (PEAK + 0.5) / 2 - 0.05;
    scan.visible = !stage.reduced;
    scene.add(scan);

    // --- Interaction -------------------------------------------------------
    let palette: Palette | null = null;
    let hovered: Hover | null = null;
    // A dot's story stays up after the pointer moves off it, so its link can be
    // reached, until the time line reaches the next featured change point.
    let pinned: Hover | null = null;
    let resting = -1; // which featured stop the time line is resting on
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const probe = new THREE.Vector3();

    /** The change point whose story card is showing: a hovered or pinned dot, else the featured stop. */
    const told = () => {
      const dot = hovered && hovered.cp >= 0 ? hovered : pinned;
      if (dot) return { s: dot.series, k: dot.cp };
      return resting >= 0 ? stops[resting] : null;
    };

    function paintHover() {
      if (!palette) return;
      const { accent, ink, paper } = palette;
      const story = told()?.s ?? -1;
      ridgeMaterials.forEach((m, s) => {
        // The story's line is drawn over the ridges in front of it, so the
        // whole line shows; every other line is hidden where a ridge covers it.
        m.depthTest = s !== story;
        m.depthWrite = s !== story;
        ridgeLines[s].renderOrder = s === story ? 10 : 0;
        if (s === story) {
          // The line the story card is about.
          m.color.copy(accent);
          m.linewidth = 3.4;
        } else if (hovered?.series === s) {
          // The ridge under the pointer: accent, unless a story's line has it.
          m.color.copy(story >= 0 ? ink : accent);
          m.linewidth = story >= 0 ? 2.4 : 3;
        } else {
          // Ridges fade toward the back, like hills in haze.
          m.color.copy(ink).lerp(paper, 0.62 * (s / (S - 1)));
          m.linewidth = 1.5 - 0.5 * (s / (S - 1));
        }
      });
    }

    stage.onTheme((p) => {
      wallMaterial.color.copy(p.paper);
      marks.forEach((m, n) =>
        beads.setColorAt(
          n,
          m.pct === undefined ? p.signal : m.pct >= 0 ? p.accent : p.alert,
        ),
      );
      if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
      faultMaterial.color.copy(p.signal);
      scanMaterial.color.copy(p.accent);
      palette = p;
      paintHover();
    });
    stage.onResize((w, h) =>
      ridgeMaterials.forEach((m) => m.resolution.set(w, h)),
    );

    const project = (s: number, i: number) => {
      probe.set(xAt(i), yAt(s, i) * group.scale.y, zAt(s)).project(camera);
      return {
        x: ((probe.x + 1) / 2) * stage.width,
        y: ((1 - probe.y) / 2) * stage.height,
      };
    };

    const onMove = (e: PointerEvent) => {
      // Over the story card: drop the ridge under the pointer, but leave the
      // card up (a hovered dot's story is pinned) so its link can be followed.
      if (
        e.target instanceof Element &&
        e.target.closest("[data-terrain-card]")
      ) {
        onLeave();
        return;
      }
      const box = el.getBoundingClientRect();
      const px = e.clientX - box.left;
      const py = e.clientY - box.top;
      // As a backdrop the pointer is tracked across the whole window (text sits
      // on top of the canvas), so leaving the frame has to be detected by hand.
      if (px < 0 || py < 0 || px > box.width || py > box.height) {
        onLeave();
        return;
      }
      if (e.pointerType === "mouse") {
        pointer.tx = (px / box.width) * 2 - 1;
        pointer.ty = (py / box.height) * 2 - 1;
      }
      let best: Hover | null = null;
      let bestDistance = 26 * 26; // must be within 26px of a ridge
      for (let s = 0; s < S; s++) {
        for (let i = 0; i < T; i += 2) {
          const at = project(s, i);
          const d = (at.x - px) ** 2 + (at.y - py) ** 2;
          if (d < bestDistance) {
            bestDistance = d;
            best = {
              series: s,
              index: i,
              x: at.x,
              y: at.y,
              frameWidth: box.width,
              cp: -1,
            };
          }
        }
      }
      // Near a change point, snap to its bead so the card describes that moment.
      if (best) {
        const near = best;
        const cps = data.series[near.series].cps;
        const cp = cps.findIndex((c) => Math.abs(c - near.index) <= 3);
        if (cp >= 0) {
          const at = project(near.series, cps[cp]);
          best = { ...near, index: cps[cp], x: at.x, y: at.y, cp };
        }
      }
      const changed =
        best?.series !== hovered?.series || best?.index !== hovered?.index;
      hovered = best;
      if (changed) {
        if (best && best.cp >= 0) {
          pinned = best;
          setPinned(best);
        }
        paintHover();
        setHover(best);
        el.style.cursor = best ? "pointer" : "";
        stage.invalidate();
      }
    };
    const onLeave = () => {
      pointer.tx = 0;
      pointer.ty = 0;
      if (hovered) {
        hovered = null;
        paintHover();
        setHover(null);
        el.style.cursor = "";
        stage.invalidate();
      }
    };
    const onClick = () => {
      if (!hovered) return;
      // A change point opens the article behind it; any other ridge opens Inflection.
      const series = data.series[hovered.series];
      const url =
        hovered.cp >= 0
          ? (series.insight?.[hovered.cp]?.u ??
            series.news?.[hovered.cp]?.[0]?.u)
          : null;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else router.push("/work/inflection");
    };
    const moveSource: HTMLElement | Window = backdrop ? window : el;
    moveSource.addEventListener("pointermove", onMove as EventListener);
    // As a backdrop, leaving the frame is detected in onMove (the card and the
    // hero text sit above the canvas, so pointerleave would fire too early).
    if (!backdrop) el.addEventListener("pointerleave", onLeave);
    document.documentElement.addEventListener("mouseleave", onLeave);
    el.addEventListener("click", onClick);

    // --- Animation ---------------------------------------------------------
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const at = new THREE.Vector3();
    const noTurn = new THREE.Quaternion();
    const target = new THREE.Vector3(0, 0.55, -0.1);
    const INTRO = 2.2; // let the ridges rise before the time line starts
    const SWEEP = 16; // seconds of travel for the time line to cross
    const DWELL = 5; // seconds it rests on each featured change point
    const REST = 1.5; // pause before starting over
    const speed = (T - 1) / SWEEP; // points per second
    const loop = SWEEP + stops.length * DWELL + REST;
    let placedAt = 0;

    stage.onFrame((time) => {
      // Ridges rise out of the floor when the sculpture first appears.
      const rise = stage.reduced
        ? 1
        : 1 - Math.pow(1 - Math.min(time / 1.8, 1), 3);
      group.scale.y = Math.max(rise, 0.001);

      // Camera: slow sway, a little parallax from the pointer, and pulled back
      // on narrow screens so the whole terrain stays in view.
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      const yaw =
        (backdrop ? 0.15 : 0.24) * Math.sin(time * 0.13) + pointer.x * 0.12;
      const wide = camera.aspect > 1.2;
      // On wide screens the backdrop is drawn a little smaller, so its lower
      // left corner stays above the hero's text.
      const back = backdrop
        ? Math.max(wide ? 1.64 : 1.5, 1.25 / camera.aspect)
        : Math.max(1, 2.05 / camera.aspect);
      const radius = 11.5 * back;
      // As a backdrop, look below and to the left of the terrain so it sits
      // high and a little to the right, clear of the text at the lower left.
      if (backdrop) target.set(wide ? -1.5 : 0, wide ? -2.05 : 0.5, -0.1);
      camera.position.set(
        Math.sin(yaw) * radius,
        (5.5 - pointer.y * 0.5) * back,
        Math.cos(yaw) * radius,
      );
      camera.lookAt(target);

      // Time line: travels from the first date to the last, resting on each
      // featured change point long enough for its card to be read.
      const clock = time - INTRO;
      let position = 0;
      let sweeping = !stage.reduced && clock >= 0;
      let stop = -1;
      if (sweeping) {
        const tau = clock % loop;
        position = (tau - stops.length * DWELL) * speed;
        for (let k = 0; k < stops.length; k++) {
          const arrive = stops[k].i / speed + k * DWELL;
          if (tau < arrive) {
            position = (tau - k * DWELL) * speed;
            break;
          }
          if (tau < arrive + DWELL) {
            position = stops[k].i;
            stop = k;
            break;
          }
        }
        if (position > T - 1) sweeping = false;
      }
      const scanX = xAt(Math.min(position, T - 1));
      scan.visible = sweeping;
      scan.position.x = scanX;

      // Show the featured point's card while the line rests on it, and keep the
      // card pinned to the bead as the camera drifts.
      if (stop !== resting || (stop >= 0 && time - placedAt > 0.5)) {
        const moved = stop !== resting;
        resting = stop;
        placedAt = time;
        if (moved) {
          // A new featured story takes over from a pinned one.
          if (stop >= 0 && pinned) {
            pinned = null;
            setPinned(null);
          }
          paintHover();
        }
        if (stop < 0) setAuto(null);
        else {
          const m = stops[stop];
          const p = project(m.s, m.i);
          setAuto({
            series: m.s,
            index: m.i,
            x: p.x,
            y: p.y,
            frameWidth: stage.width,
            cp: m.k,
          });
        }
      }

      const story = told();
      marks.forEach((m, k) => {
        const flare = sweeping
          ? Math.exp(-(((xAt(m.i) - scanX) / 0.32) ** 2))
          : 0;
        // The bead whose story is showing breathes so the eye finds it.
        const featured =
          story && story.s === m.s && story.k === m.k
            ? 0.5 + 0.2 * Math.sin(time * 4)
            : 0;
        const size = m.base * (1 + 0.9 * flare + featured);
        // Undo the group's vertical squash so beads stay round while rising.
        scale.set(size, size / group.scale.y, size);
        at.set(xAt(m.i), yAt(m.s, m.i) + 0.02, zAt(m.s));
        beads.setMatrixAt(k, matrix.compose(at, noTurn, scale));
      });
      beads.instanceMatrix.needsUpdate = true;

      // Date tag rides along the front edge under the scan.
      const tag = dateTag.current;
      if (tag) {
        if (sweeping) {
          probe.set(scanX, -0.05, depth / 2 + 0.45).project(camera);
          const x = ((probe.x + 1) / 2) * stage.width;
          // Keep the tag inside the frame when the front edge runs off the bottom.
          const y = Math.min(
            ((1 - probe.y) / 2) * stage.height,
            stage.height - (backdrop ? 64 : 22),
          );
          tag.style.opacity = "1";
          tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 6px)`;
          tag.textContent = monthYear(
            data.dates[Math.round(Math.min(position, T - 1))],
          );
        } else {
          tag.style.opacity = "0";
        }
      }
    });

    return () => {
      moveSource.removeEventListener("pointermove", onMove as EventListener);
      el.removeEventListener("pointerleave", onLeave);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("click", onClick);
      el.style.cursor = "";
      stage.dispose();
    };
  }, [data, router, backdrop]);

  if (failed) return null;

  // The story shown: the dot under the pointer, else the last dot the pointer
  // was on, else the featured one the time line is resting on.
  const dot = hover && hover.cp >= 0 ? hover : null;
  const shown = dot ?? pinned ?? auto;
  // A ridge under the pointer, away from any dot, just gets a name tag.
  const tip = hover && !dot ? hover : null;
  const active = shown && data ? data.series[shown.series] : null;
  const insight = (shown && active?.insight?.[shown.cp]) || null;
  const pct = shown ? active?.shift?.[shown.cp] : undefined;
  const stories = (!insight && shown && active?.news?.[shown.cp]) || [];
  const hasStories =
    data?.series.some(
      (x) => x.insight?.some(Boolean) || x.news?.some((n) => n.length),
    ) ?? false;

  // Where the story card goes. As a backdrop it is docked at the lower right of
  // the hero, below the terrain, so it never covers the ridges; the story's
  // line and dot are highlighted instead. Where there is no room beside the
  // page's text (phones, narrow windows) a short version sits at the top of the
  // frame. Used as a figure on its own, the card sits beside the point.
  const cardLayer = backdrop ? document.getElementById("terrain-cards") : null;
  const dock = backdrop ? document.getElementById("terrain-story") : null;
  const docked = !!dock && !!shown && shown.frameWidth >= DOCK_MIN_WIDTH;
  const compact = backdrop && !docked;
  let cardStyle: React.CSSProperties = {};
  let cardAbove = false;
  if (shown && !docked) {
    const width = Math.min(312, shown.frameWidth - 24);
    if (compact) {
      const left =
        shown.frameWidth < 640
          ? (shown.frameWidth - width) / 2
          : shown.frameWidth - width - 24;
      cardStyle = { top: 16, left, width };
    } else {
      // Tallest the card gets, with a margin: it must not run off the top.
      const room = insight ? 310 : stories.length ? 240 : 80;
      cardAbove = shown.y >= room;
      const left =
        shown.x > shown.frameWidth / 2 ? shown.x - 14 - width : shown.x + 14;
      cardStyle = {
        top: cardAbove ? shown.y - 14 : shown.y + 18,
        left: Math.max(12, Math.min(left, shown.frameWidth - width - 12)),
        width,
      };
    }
  }

  const card = shown && active && data && (
    <div
      data-terrain-card
      key={`${shown.series}-${shown.cp}`}
      className={`pointer-events-auto z-10 animate-[fade_0.4s_ease_both] rounded-lg border border-line bg-paper px-3.5 py-3 shadow-md ${
        docked ? "" : "absolute"
      } ${cardAbove ? "-translate-y-full" : ""}`}
      style={cardStyle}
    >
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-medium text-ink">
        <span className="flex items-center gap-2">
          {/* Matches the highlighted line on the terrain. */}
          <span
            aria-hidden="true"
            className="h-[3px] w-4 rounded-full bg-accent"
          />
          {active.label}
        </span>
        <span className="font-mono text-[0.68rem] font-normal text-muted">
          {monthYear(data.dates[shown.index])}
        </span>
      </p>
      {pct !== undefined && (
        <p className="mt-1 font-mono text-[0.7rem] text-muted">
          <span className={pct >= 0 ? "text-accent" : "text-alert"}>
            {pct >= 0 ? "▲ +" : "▼ −"}
            {Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%
          </span>{" "}
          average after this point, against before
        </p>
      )}
      {insight && (
        <>
          <p className="mt-2 border-t border-line pt-2 font-serif text-[1.05rem] leading-snug tracking-tight text-ink">
            {insight.h}
          </p>
          {/* The short version leaves the text out, so the terrain stays visible below it. */}
          {!compact && (
            <p className="mt-1.5 text-[0.8rem] leading-relaxed text-muted">
              {insight.t}
            </p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 font-mono text-[0.62rem] text-faint">
            {insight.u && (
              <a
                href={insight.u}
                target="_blank"
                rel="noreferrer"
                className="link text-ink"
              >
                Read: {insight.s ?? "source"} ↗
              </a>
            )}
            <span>AI summary of news coverage</span>
          </p>
        </>
      )}
      {stories.length > 0 && (
        <>
          <p className="mt-2 border-t border-line pt-2 font-mono text-[0.62rem] tracking-[0.08em] text-faint uppercase">
            In the news that week
          </p>
          {stories.map((story) => (
            <p
              key={story.u}
              className="mt-1.5 text-[0.8rem] leading-snug text-ink"
            >
              {story.t}
              <span className="ml-1.5 font-mono text-[0.64rem] whitespace-nowrap text-faint">
                {story.s}
              </span>
            </p>
          ))}
          <p className="mt-2 font-mono text-[0.62rem] text-faint">
            Click the point to read the top story
          </p>
        </>
      )}
    </div>
  );

  // Name tag for the ridge under the pointer.
  const tag = tip && data && (
    <div
      className={`pointer-events-none absolute z-10 rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-ink shadow-sm ${
        tip.y >= 60 ? "-translate-y-full" : ""
      } ${tip.x > tip.frameWidth / 2 ? "-translate-x-full" : ""}`}
      style={{
        top: tip.y >= 60 ? tip.y - 12 : tip.y + 16,
        left: tip.x > tip.frameWidth / 2 ? tip.x - 12 : tip.x + 12,
      }}
    >
      {data.series[tip.series].label}
      <span className="ml-2.5 font-mono text-[0.68rem] font-normal text-muted">
        {monthYear(data.dates[tip.index])}
      </span>
    </div>
  );

  return (
    <figure className={backdrop ? "absolute inset-0" : "relative"}>
      <div
        ref={frame}
        className={
          backdrop
            ? "terrain-backdrop absolute inset-0 touch-pan-y opacity-85 select-none"
            : "relative mx-auto aspect-[3/2] max-h-[640px] w-full touch-pan-y [mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)] select-none sm:aspect-[16/9] lg:aspect-[21/9]"
        }
        role="img"
        aria-label={
          data
            ? `A three-dimensional landscape of ${data.series.length} market time series over five years. Dots mark detected trend changes: green where the series' average rose afterwards, red where it fell, larger for bigger changes.`
            : "Loading a three-dimensional landscape of market time series."
        }
      >
        <span
          ref={dateTag}
          className="pointer-events-none absolute top-0 left-0 font-mono text-[0.7rem] whitespace-nowrap text-accent opacity-0 transition-opacity duration-300"
        />
      </div>
      {/* Card: outside the frame so the frame's fade does not wash it out. */}
      {card &&
        (docked
          ? createPortal(card, dock)
          : cardLayer
            ? createPortal(card, cardLayer)
            : card)}
      {tag && (cardLayer ? createPortal(tag, cardLayer) : tag)}
      {/* As the hero's backdrop the terrain carries no caption. */}
      {!backdrop && (
        <figcaption className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-5 gap-y-1 px-5 pt-2 font-mono text-[0.7rem] text-muted sm:px-8">
          <span className="tracking-[0.09em] uppercase">
            Fig. 1 · Regime terrain
          </span>
          {data && (
            <>
              <span>
                {data.series.length} market series · {monthYear(data.dates[0])}{" "}
                to {monthYear(data.dates[data.dates.length - 1])} · weekly
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent" /> up
                <span className="ml-1.5 size-2 rounded-full bg-alert" /> down
                <span className="ml-1">
                  · dot size shows the % change in the average
                </span>
              </span>
              <span className="hidden sm:inline">
                {hasStories
                  ? "Hover a dot for the story behind it."
                  : "Hover a ridge to see what it is."}
              </span>
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}
