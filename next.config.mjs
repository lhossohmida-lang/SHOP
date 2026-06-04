/** @type {import('next').NextConfig} */
const isAndroidBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig = {
  reactStrictMode: true,
  output: isAndroidBuild ? "export" : "standalone",
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
