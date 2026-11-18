"use client";

import { useEffect, useState } from "react";

export type Rgb = [number, number, number];

const parse = (value: string): Rgb => {
  const s = value.trim().replace("#", "");
  const n = parseInt(s.length === 3 ? s.replace(/./g, "$&$&") : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const rgba = (c: Rgb, alpha = 1) =>
  `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;

/**
 * Reads theme colours (CSS variables such as "accent" or "ink") as numbers,
 * for drawing on a canvas, and reads them again when the theme changes.
 */
export function useThemeColors<K extends string>(names: readonly K[]) {
  const [colors, setColors] = useState<Record<K, Rgb> | null>(null);
  const key = names.join(",");
  useEffect(() => {
    const list = key.split(",") as K[];
    const read = () => {
      const css = getComputedStyle(document.documentElement);
      setColors(
        Object.fromEntries(
          list.map((n) => [n, parse(css.getPropertyValue(`--${n}`))]),
        ) as Record<K, Rgb>,
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [key]);
  return colors;
}
