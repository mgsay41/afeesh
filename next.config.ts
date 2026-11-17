import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Posters for the link / before-after / chain games come from TMDB.
  images: { remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" }] },
  cacheComponents: true,
  partialPrefetching: true,
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
