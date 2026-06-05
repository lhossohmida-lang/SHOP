import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  swcMinify: false, // Use standard minification instead of SWC to prevent Rust out-of-memory error
};

export default nextConfig;
