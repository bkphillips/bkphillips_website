"use client";

import dynamic from "next/dynamic";

// three.js is loaded only in the browser and only after the page's text is up.
const Terrain = dynamic(() => import("@/components/sculpture/terrain"), { ssr: false });

/** Full-width band for the landing page's 3D sculpture. Reserves its height while loading. */
export function TerrainBand() {
  return (
    <div className="mx-auto min-h-[calc(66.7vw+1.5rem)] w-full max-w-[1500px] sm:min-h-[calc(56.25vw+1.5rem)] lg:min-h-[min(calc(42.85vw+1.5rem),664px)]">
      <Terrain />
    </div>
  );
}
