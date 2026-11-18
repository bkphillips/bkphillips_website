import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The org data file is read from disk at request time, so make sure hosts
  // that bundle server functions (Vercel) ship it with those routes.
  outputFileTracingIncludes: {
    "/api/org/data": ["./src/data/org.json"],
    "/api/org/chat": ["./src/data/org.json"],
  },
  // The project page used to live at /work/org-health; keep old links working.
  redirects() {
    return [
      {
        source: "/work/org-health",
        destination: "/work/org-explorer",
        permanent: true,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
