import path from "node:path";

/** @type {import('next').NextConfig} */
const isAndroidBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig = {
  reactStrictMode: true,
  output: isAndroidBuild ? "export" : "standalone",
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  // turbopack only for standalone (desktop/web) builds
  ...(isAndroidBuild
    ? {}
    : {
        turbopack: {
          root: path.resolve("."),
        },
      }),
};

export default nextConfig;
