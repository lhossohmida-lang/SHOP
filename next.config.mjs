import path from "node:path";
import fs from "node:fs";

/** @type {import('next').NextConfig} */
const isAndroidBuild = process.env.CAPACITOR_BUILD === "1";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const firstEquals = trimmed.indexOf("=");
    if (firstEquals === -1) continue;
    const key = trimmed.slice(0, firstEquals).trim();
    const value = trimmed.slice(firstEquals + 1).trim();
    const cleanValue = value.replace(/^['"]|['"]$/g, "");
    env[key] = cleanValue;
  }
  return env;
}

const envProduction = loadEnvFile(path.resolve(".env.production"));
const envLocal = loadEnvFile(path.resolve(".env.local"));
const mergedEnv = { ...envProduction, ...envLocal };

const clientEnv = {};
for (const [key, val] of Object.entries(mergedEnv)) {
  if (key.startsWith("NEXT_PUBLIC_") || key === "OPENROUTER_API_KEY") {
    clientEnv[key] = val;
  }
}

const nextConfig = {
  reactStrictMode: true,
  output: isAndroidBuild ? "export" : "standalone",
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  env: clientEnv,
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
