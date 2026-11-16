"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { createStage, type Palette } from "@/components/sculpture/stage";

type TerrainData = {
  generated: string;
  dates: string[];
  series: { id: string; label: string; v: number[]; cps: number[] }[];
};

type Hover = {
  series: number;
  index: number;
  /** Position of the hovered point inside the frame, and the frame's width. */
  x: number;
  y: number;
  frameWidth: number;
  shift: boolean;
};

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

export default function Terrain() {
  const router = useRouter();
  const frame = useRef<HTMLDivElement>(null);
  const dateTag = useRef<HTMLSpanElement>(null);
  const [data, setData] = useState<TerrainData | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
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
      const z = Math.max(-Z_LIMIT, Math.min(Z_LIMIT, data.series[s].v[i] / 100));
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
    wallGeometry.setAttribute("position", new THREE.Float32BufferAttribute(wallPositions, 3));
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
    for (let s = 0; s < S; s++) {
      const positions: number[] = [];
      for (let i = 0; i < T; i++) positions.push(xAt(i), yAt(s, i), zAt(s));
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      const material = new LineMaterial({ linewidth: 1.35 });
      ridgeMaterials.push(material);
      group.add(new Line2(geometry, material));
    }

    // Change points: a bead on the ridge at each detected trend change.
    const marks: { s: number; i: number }[] = [];
    data.series.forEach((series, s) => series.cps.forEach((i) => marks.push({ s, i })));
    const beadMaterial = new THREE.MeshBasicMaterial();
    const beads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.046, 14, 10),
      beadMaterial,
      marks.length,
    );
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
        faultPositions.push(xAt(i), yAt(s, i) + 0.01, zAt(s), xAt(near), yAt(s + 1, near) + 0.01, zAt(s + 1));
      }
    }
    const faultGeometry = new THREE.BufferGeometry();
    faultGeometry.setAttribute("position", new THREE.Float32BufferAttribute(faultPositions, 3));
    const faultMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 });
    group.add(new THREE.LineSegments(faultGeometry, faultMaterial));

    // Scan: a faint sheet that sweeps through time; beads flare as it passes.
    const scanMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(depth + 0.8, PEAK + 0.5), scanMaterial);
    scan.rotation.y = Math.PI / 2;
    scan.position.y = (PEAK + 0.5) / 2 - 0.05;
    scan.visible = !stage.reduced;
    scene.add(scan);

    // --- Interaction -------------------------------------------------------
    let palette: Palette | null = null;
    let hovered: Hover | null = null;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const probe = new THREE.Vector3();

    function paintHover() {
      if (!palette) return;
      const { accent, ink, paper } = palette;
      ridgeMaterials.forEach((m, s) => {
        const on = hovered?.series === s;
        // Ridges fade toward the back, like hills in haze.
        if (on) m.color.copy(accent);
        else m.color.copy(ink).lerp(paper, 0.62 * (s / (S - 1)));
        m.linewidth = on ? 3 : 1.5 - 0.5 * (s / (S - 1));
      });
    }

    stage.onTheme((p) => {
      wallMaterial.color.copy(p.paper);
      beadMaterial.color.copy(p.signal);
      faultMaterial.color.copy(p.signal);
      scanMaterial.color.copy(p.accent);
      palette = p;
      paintHover();
    });
    stage.onResize((w, h) => ridgeMaterials.forEach((m) => m.resolution.set(w, h)));


    const project = (s: number, i: number) => {
      probe.set(xAt(i), yAt(s, i) * group.scale.y, zAt(s)).project(camera);
      return { x: ((probe.x + 1) / 2) * stage.width, y: ((1 - probe.y) / 2) * stage.height };
    };

    const onMove = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const px = e.clientX - box.left;
      const py = e.clientY - box.top;
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
              shift: data.series[s].cps.some((c) => Math.abs(c - i) <= 3),
            };
          }
        }
      }
      const changed =
        best?.series !== hovered?.series || best?.index !== hovered?.index;
      hovered = best;
      if (changed) {
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
      if (hovered) router.push("/work/inflection");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("click", onClick);

    // --- Animation ---------------------------------------------------------
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const at = new THREE.Vector3();
    const noTurn = new THREE.Quaternion();
    const target = new THREE.Vector3(0, 0.55, -0.1);
    const SWEEP = 16; // seconds for the scan to cross, then a short rest

    stage.onFrame((time) => {
      // Ridges rise out of the floor when the sculpture first appears.
      const rise = stage.reduced ? 1 : 1 - Math.pow(1 - Math.min(time / 1.8, 1), 3);
      group.scale.y = Math.max(rise, 0.001);

      // Camera: slow sway, a little parallax from the pointer, and pulled back
      // on narrow screens so the whole terrain stays in view.
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      const yaw = 0.24 * Math.sin(time * 0.13) + pointer.x * 0.12;
      const back = Math.max(1, 2.05 / camera.aspect);
      const radius = 11.5 * back;
      camera.position.set(
        Math.sin(yaw) * radius,
        (5.5 - pointer.y * 0.5) * back,
        Math.cos(yaw) * radius,
      );
      camera.lookAt(target);

      // Scan position, from the first date to the last.
      const phase = (time / SWEEP) % 1.12;
      const sweeping = !stage.reduced && phase <= 1;
      const scanX = -WIDTH / 2 + Math.min(phase, 1) * WIDTH;
      scan.visible = sweeping;
      scan.position.x = scanX;

      marks.forEach((m, k) => {
        const flare = sweeping ? Math.exp(-(((xAt(m.i) - scanX) / 0.32) ** 2)) : 0;
        const size = 1 + 1.3 * flare;
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
          const y = Math.min(((1 - probe.y) / 2) * stage.height, stage.height - 22);
          tag.style.opacity = "1";
          tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 6px)`;
          tag.textContent = monthYear(data.dates[Math.round(Math.min(phase, 1) * (T - 1))]);
        } else {
          tag.style.opacity = "0";
        }
      }
    });

    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("click", onClick);
      el.style.cursor = "";
      stage.dispose();
    };
  }, [data, router]);

  if (failed) return null;

  const active = hover && data ? data.series[hover.series] : null;

  return (
    <figure className="relative">
      <div
        ref={frame}
        className="relative mx-auto aspect-[3/2] max-h-[640px] w-full touch-pan-y [mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)] select-none sm:aspect-[16/9] lg:aspect-[21/9]"
        role="img"
        aria-label={
          data
            ? `A three-dimensional landscape of ${data.series.length} market time series over five years. Orange beads mark detected trend changes; lines join changes that several markets share.`
            : "Loading a three-dimensional landscape of market time series."
        }
      >
        <span
          ref={dateTag}
          className="pointer-events-none absolute top-0 left-0 font-mono text-[0.7rem] whitespace-nowrap text-accent opacity-0 transition-opacity duration-300"
        />
        {hover && active && data && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-line bg-paper px-3 py-2 shadow-sm"
            style={{
              top: Math.max(0, hover.y - 62),
              ...(hover.x > hover.frameWidth / 2
                ? { right: hover.frameWidth - hover.x + 12 }
                : { left: hover.x + 12 }),
            }}
          >
            <p className="text-sm font-medium whitespace-nowrap text-ink">{active.label}</p>
            <p className="mt-0.5 font-mono text-[0.68rem] whitespace-nowrap text-muted">
              {monthYear(data.dates[hover.index])}
              {hover.shift && <span className="text-signal"> · trend change detected</span>}
            </p>
          </div>
        )}
      </div>
      <figcaption className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-5 gap-y-1 px-5 pt-2 font-mono text-[0.7rem] text-muted sm:px-8">
        <span className="tracking-[0.09em] uppercase">Fig. 1 · Regime terrain</span>
        {data && (
          <>
            <span>
              {data.series.length} market series · {monthYear(data.dates[0])} to{" "}
              {monthYear(data.dates[data.dates.length - 1])} · weekly
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-signal" /> detected trend change
            </span>
            <span className="hidden sm:inline">Hover a ridge to see what it is.</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
