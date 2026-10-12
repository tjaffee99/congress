import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // STATIC_EXPORT=1 writes plain static files to dist/client, for GitHub Pages.
  output: process.env.STATIC_EXPORT ? "export" : undefined,
};

export default nextConfig;
