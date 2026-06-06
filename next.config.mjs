import path from "node:path";

/** @type {import('next').NextConfig} */
const isAndroidBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig = {
  reactStrictMode: true,
  output: isAndroidBuild ? "export" : "standalone",
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },

  // turbopack only works for standalone (desktop/web) builds
  ...(isAndroidBuild
    ? {
        // During Android/static export: use webpack and stub out server-only API routes
        webpack(config) {
          config.resolve.alias["@/app/api/print/route"] = false;
          return config;
        },
      }
    : {
        turbopack: {
          root: path.resolve("."),
        },
      }),
};

export default nextConfig;
