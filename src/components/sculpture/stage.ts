import * as THREE from "three";

/** The site's colours, read from the CSS variables so 3D matches the theme. */
export type Palette = Record<
  "paper" | "surface" | "ink" | "muted" | "line" | "accent" | "signal",
  THREE.Color
>;

export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string) => new THREE.Color(css.getPropertyValue(name).trim() || "#888888");
  return {
    paper: get("--paper"),
    surface: get("--surface"),
    ink: get("--ink"),
    muted: get("--muted"),
    line: get("--line"),
    accent: get("--accent"),
    signal: get("--signal"),
  };
}

export type Stage = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** Visitor prefers reduced motion: nothing moves by itself. */
  reduced: boolean;
  width: number;
  height: number;
  /** Called every frame with seconds elapsed (only while visible) and the frame's delta. */
  onFrame: (fn: (time: number, delta: number) => void) => void;
  /** Called now and whenever the light/dark theme changes. */
  onTheme: (fn: (palette: Palette) => void) => void;
  /** Called now and whenever the container changes size. */
  onResize: (fn: (width: number, height: number) => void) => void;
  /** Draw one frame soon. Needed in reduced-motion mode, where there is no loop. */
  invalidate: () => void;
  dispose: () => void;
};

/**
 * A WebGL canvas that fills `container`, with a render loop that pauses when
 * the canvas is off screen or the tab is hidden. Returns null without WebGL.
 */
export function createStage(container: HTMLElement, fov = 30): Stage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%";
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const frames: ((time: number, delta: number) => void)[] = [];
  const themes: ((palette: Palette) => void)[] = [];
  const resizes: ((width: number, height: number) => void)[] = [];

  let raf = 0;
  let onScreen = true;
  let disposed = false;
  let time = 0;
  let last = 0;

  const stage: Stage = {
    scene,
    camera,
    renderer,
    reduced,
    width: 1,
    height: 1,
    onFrame: (fn) => frames.push(fn),
    onTheme: (fn) => {
      themes.push(fn);
      fn(readPalette());
    },
    onResize: (fn) => {
      resizes.push(fn);
      fn(stage.width, stage.height);
    },
    invalidate: () => {
      if (!raf && !disposed) raf = requestAnimationFrame(tick);
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      viewObserver.disconnect();
      themeObserver.disconnect();
      scheme.removeEventListener("change", retheme);
      document.removeEventListener("visibilitychange", wake);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      renderer.dispose();
      canvas.remove();
    },
  };

  function tick(now: number) {
    raf = 0;
    if (disposed) return;
    const delta = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (!reduced) time += delta;
    for (const fn of frames) fn(time, delta);
    renderer.render(scene, camera);
    // Keep looping only while it can be seen and motion is wanted.
    if (!reduced && onScreen && document.visibilityState === "visible") {
      raf = requestAnimationFrame(tick);
    } else {
      last = 0;
    }
  }
  const wake = () => stage.invalidate();

  const resizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width < 2 || height < 2) return;
    stage.width = width;
    stage.height = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    for (const fn of resizes) fn(width, height);
    stage.invalidate();
  });
  resizeObserver.observe(container);

  const viewObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) stage.invalidate();
  });
  viewObserver.observe(container);

  const retheme = () => {
    const palette = readPalette();
    for (const fn of themes) fn(palette);
    stage.invalidate();
  };
  const themeObserver = new MutationObserver(retheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", retheme);
  document.addEventListener("visibilitychange", wake);

  stage.invalidate();
  return stage;
}
