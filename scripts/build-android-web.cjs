#!/usr/bin/env node
/**
 * build-android-web.cjs
 * Temporarily moves the app/api directory (server-only routes incompatible
 * with Next.js "output: export") out of the way, runs the static build,
 * then restores it. Uses copy+delete instead of rename (Windows-safe).
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "app", "api");
const apiDirBak = path.join(root, "app", "_api_bak");

let backed = false;

function restore() {
  try {
    if (backed && fs.existsSync(apiDirBak)) {
      if (!fs.existsSync(apiDir)) {
        fs.cpSync(apiDirBak, apiDir, { recursive: true });
      }
      fs.rmSync(apiDirBak, { recursive: true, force: true });
      console.log("✅ Restored app/api directory.");
    }
  } catch (e) {
    console.error("⚠ Could not restore app/api:", e.message);
  }
}

process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(1); });

try {
  if (fs.existsSync(apiDir)) {
    // Copy api → _api_bak
    fs.cpSync(apiDir, apiDirBak, { recursive: true });
    // Delete original
    fs.rmSync(apiDir, { recursive: true, force: true });
    backed = true;
    console.log("📦 Temporarily hid app/api for static export build...");
  }

  console.log("🔨 Building Android web (CAPACITOR_BUILD=1, --webpack)...");
  execSync("cross-env CAPACITOR_BUILD=1 next build --webpack", {
    cwd: root,
    stdio: "inherit",
  });

  console.log("✅ Android web build complete.");
} catch (err) {
  console.error("❌ Build failed:", err.message);
  restore();
  backed = false;
  process.exit(1);
}
