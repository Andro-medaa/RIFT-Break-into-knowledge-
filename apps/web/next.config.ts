import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* RIFT web app — interactive client-heavy SPA; cacheComponents disabled
     because dynamic routes (/chat/[docId]) use runtime data (params, router)
     and cannot be prerendered. */
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
