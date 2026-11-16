"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createStage } from "@/components/sculpture/stage";
import { createParticles, type StoryData } from "@/components/story/particles";

type Props = {
  /** Element whose children are the story's steps; scroll position is read from them. */
  steps: RefObject<HTMLDivElement | null>;
  onActive: (index: number) => void;
};

let dataPromise: Promise<StoryData> | null = null;
const loadData = () =>
  (dataPromise ??= fetch("/data/story.json").then((res) => {
    if (!res.ok) throw new Error("story data missing");
    return res.json() as Promise<StoryData>;
  }));

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Bring an angle into (-pi, pi] so a shape unwinds the short way round. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export default function StoryCanvas({ steps, onActive }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLParagraphElement>(null);
  const readoutNote = useRef<HTMLParagraphElement>(null);
  const [data, setData] = useState<StoryData | null>(null);
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
    const stage = createStage(el, 30);
    if (!stage) {
      queueMicrotask(() => setFailed(true));
      return;
    }
    const { scene, camera } = stage;
    const { points, uniforms, setYear, yearCount } = createParticles(data);
    scene.add(points);

    stage.onTheme((p) => {
      uniforms.uInk.value.copy(p.ink);
      uniforms.uAccent.value.copy(p.accent);
      uniforms.uSignal.value.copy(p.signal);
      uniforms.uAlert.value.copy(p.alert);
    });
    stage.onResize((w, h) => {
      uniforms.uAspect.value = w / h;
      uniforms.uPx.value =
        2.7 * stage.renderer.getPixelRatio() * Math.min(1.25, Math.max(0.7, h / 640));
      // Pull back when the frame is tall and narrow so the widest shape still fits.
      camera.position.set(0, 0, 11 * Math.max(1, 1.25 / (w / h)));
    });

    // --- Pointer: push dots aside, and drag to turn the globe or the org -------
    let globeSpin = -1.9; // start with Africa and Europe toward the viewer
    let orgSpin = 0;
    let spinSpeed = 0;
    let dragging = false;
    let lastX = 0;
    let pointerOn = 0;
    let pointerTarget = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const box = el.getBoundingClientRect();
      uniforms.uPointer.value.set(
        ((e.clientX - box.left) / box.width) * 2 - 1,
        1 - ((e.clientY - box.top) / box.height) * 2,
      );
      pointerTarget = 1;
      if (dragging) {
        spinSpeed = (e.clientX - lastX) * 0.006;
        globeSpin += spinSpeed;
        orgSpin -= spinSpeed;
        lastX = e.clientX;
      }
      stage.invalidate();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      dragging = true;
      lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const onUp = () => {
      dragging = false;
      el.style.cursor = "grab";
    };
    const onLeave = () => {
      pointerTarget = 0;
      stage.invalidate();
    };
    const onScroll = () => stage.invalidate();
    el.style.cursor = "grab";
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });

    // Kaiser chapter: the case curve is drawn as the reader scrolls through it.
    const weeks = data.covid.values.length;
    const firstWeek = Date.parse(`${data.covid.from}T00:00:00Z`);

    let active = -1;
    stage.onFrame((time, delta) => {
      // Where the reader is, as a single number: exactly k when step k sits at
      // the reading line, k + 0.5 when the reader is halfway to the next step.
      const items = steps.current?.children;
      const last = (items?.length ?? 1) - 1;
      let raw = 0;
      if (items?.length) {
        // On phones the sculpture covers the top of the screen, so reading happens lower down.
        const line = window.innerHeight * (window.innerWidth < 1024 ? 0.74 : 0.5);
        for (let i = 0; i < items.length; i++) {
          const box = items[i].getBoundingClientRect();
          if (i === 0 || box.top <= line) raw = i + (line - box.top) / box.height - 0.5;
        }
      }
      const position = Math.min(last, Math.max(0, raw));
      const index = Math.min(Math.floor(position), last);
      const to = Math.min(index + 1, last);
      // A shape holds while its step is being read, and reforms in between steps.
      let t = to === index ? 0 : clamp01((position - index - 0.3) / 0.4);
      if (stage.reduced) t = t > 0.5 ? 1 : 0;

      uniforms.uFrom.value = index;
      uniforms.uTo.value = to;
      uniforms.uT.value = t;
      uniforms.uTime.value = time;

      // Globe: the years run forward as its step scrolls into place.
      const yearAt = clamp01((raw + 0.4) / 0.62) * (yearCount - 1);
      const yearIndex = Math.min(Math.floor(yearAt), yearCount - 1);
      setYear(yearIndex);
      uniforms.uYear.value = yearAt - yearIndex;

      // Curve: scroll draws it. It is flat when the dots finish arriving (0.7)
      // and complete just before they start leaving for the next shape (1.3).
      const trace = clamp01((raw - 0.72) / 0.54);
      uniforms.uTrace.value = trace * 1.04; // a little past the end, so the last dots finish rising

      // Map: arrives with some lights on; the rest come on as the reader scrolls.
      const fill = 0.3 + 0.7 * clamp01((raw - 1.55) / 0.4);
      uniforms.uFill.value = fill;

      // Orientation: the globe spins on a tilted axis, the org lies back like a
      // dish, and the two flat charts face the reader.
      const ease = t * t * (3 - 2 * t);
      const weight = (shape: number) => (index === shape ? 1 - ease : 0) + (to === shape ? ease : 0);
      const asGlobe = index === to && index === 0 ? 1 : weight(0);
      const asOrg = index === to && index === 3 ? 1 : weight(3);
      if (!dragging) {
        globeSpin += delta * 0.16 + spinSpeed;
        orgSpin += delta * 0.05 - spinSpeed;
        spinSpeed *= 0.94;
      }
      points.rotation.set(
        0.3 * asGlobe - 0.82 * asOrg,
        wrap(globeSpin) * asGlobe,
        wrap(orgSpin) * asOrg,
      );

      pointerOn += (pointerTarget - pointerOn) * 0.12;
      uniforms.uPointerOn.value = pointerOn;

      const shown = t > 0.5 ? to : index;
      if (shown !== active) {
        active = shown;
        onActive(shown);
      }
      if (readout.current && readoutNote.current) {
        if (shown === 0) {
          readout.current.textContent = String(data.globe.years[0] + yearIndex);
          readoutNote.current.textContent = `${data.globe.world[yearIndex].toFixed(1)} deaths per 100 births, worldwide`;
        } else if (shown === 1 && trace > 0) {
          const week = Math.min(Math.round(trace * (weeks - 1)), weeks - 1);
          readout.current.textContent = new Date(firstWeek + week * 7 * 86_400_000).toLocaleDateString(
            "en-US",
            { month: "short", year: "numeric", timeZone: "UTC" },
          );
          const cases = (data.covid.values[week] / 1000) * data.covid.peak;
          const fired = data.covid.warnings.filter((w) => w.warning <= week).length;
          readoutNote.current.textContent =
            `${cases >= 1e6 ? `${(cases / 1e6).toFixed(1)}M` : `${Math.round(cases / 1000)}K`} cases that week` +
            (fired ? ` · ${fired} early ${fired === 1 ? "warning" : "warnings"}` : "");
        } else {
          readout.current.textContent = "";
          readoutNote.current.textContent = "";
        }
      }
    });

    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
      el.style.cursor = "";
      stage.dispose();
    };
  }, [data, steps, onActive]);

  if (failed) return null;

  return (
    <div className="relative h-full w-full">
      <div ref={frame} className="h-full w-full touch-pan-y select-none" aria-hidden="true" />
      <div className="pointer-events-none absolute top-3 left-0 lg:top-8">
        <p ref={readout} className="font-serif text-[2rem] leading-none tracking-tight text-ink lg:text-[2.8rem]" />
        <p ref={readoutNote} className="mt-1.5 font-mono text-[0.68rem] text-muted" />
      </div>
    </div>
  );
}
