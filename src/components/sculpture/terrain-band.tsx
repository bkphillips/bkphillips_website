"use client";

import dynamic from "next/dynamic";

// three.js is loaded only in the browser and only after the page's text is up.
const Terrain = dynamic(() => import("@/components/sculpture/terrain"), { ssr: false });

/**
 * The landing page's 3D sculpture as a backdrop for the hero. It fills the
 * hero on wide screens and the upper part of it on phones; the hero's text
 * sits below and to the left.
 */
export function TerrainBackdrop() {
  return (
    <div
      className="rise absolute inset-x-0 top-0 h-[52svh] lg:inset-0 lg:h-auto"
      style={{ "--i": 4 } as React.CSSProperties}
    >
      <Terrain backdrop />
    </div>
  );
}
