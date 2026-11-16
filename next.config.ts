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
