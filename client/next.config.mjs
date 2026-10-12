import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // the repo root has its own lockfile
  outputFileTracingRoot: here,
  // the dev badge covers the apply button
  devIndicators: false,
  // send /api to express
  async rewrites() {
    const api = process.env.EDITOR_API_URL || "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
