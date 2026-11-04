import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Self-contained server in .next/standalone for the Docker image (see Dockerfile).
  output: "standalone",
  // lib/db.ts names data/myinvest.db, so the tracer would copy the owner's database into the build.
  outputFileTracingExcludes: { "*": ["./data/**/*"] },
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: path.resolve("."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
