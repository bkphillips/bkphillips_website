"use client";

import { useEffect, useRef, useState } from "react";

/** Tracks an element's pixel width so SVG charts can draw at real size. */
export function useWidth<T extends HTMLElement>(initial = 960) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, Math.round(entry.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
