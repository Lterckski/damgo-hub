import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdfjs-dist under the hood) sets up a worker via a dynamic
  // import of pdf.worker.mjs at a path resolved from node_modules — bundling
  // it rewrites that path to a nonexistent Turbopack chunk and the worker
  // setup throws. Opting both out of Server Component bundling keeps them on
  // native Node `require`, where that resolution works as shipped.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
