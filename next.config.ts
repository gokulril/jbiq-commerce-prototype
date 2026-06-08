import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // Static export for Cloudflare Pages. Local `next dev` is unaffected.
  // API routes are handled by Cloudflare Pages Functions (functions/api/).
  output: "export",
};

export default nextConfig;
