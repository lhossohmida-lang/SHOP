import path from "node:path";

/** @type {import('next').NextConfig} */
const isAndroidBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig = {
  reactStrictMode: true,
  output: isAndroidBuild ? "export" : "standalone",
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  // turbopack config only applies for non-Android (standalone) builds
  ...(isAndroidBuild
    ? {}
    : {
        turbopack: {
          root: path.resolve("."),
        },
      }),
};

export default nextConfig;
