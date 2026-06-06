#!/usr/bin/env node
/**
 * build-android-web.cjs
 * Temporarily removes the app/api directory (which contains server-only routes
 * incompatible with Next.js static export), runs "next build --webpack",
 * then restores the directory.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "app", "api");
const apiDirBak = path.join(root, "app", "_api_bak");

let moved = false;

function restore() {
  if (moved && fs.existsSync(apiDirBak)) {
    fs.renameSync(apiDirBak, apiDir);
    console.log("✅ Restored app/api directory.");
  }
}

// Ensure restore runs even on error
process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(1); });
process.on("uncaughtException", (err) => { restore(); throw err; });

try {
  if (fs.existsSync(apiDir)) {
    fs.renameSync(apiDir, apiDirBak);
    moved = true;
    console.log("📦 Temporarily moved app/api → app/_api_bak for static export...");
  }

  console.log("🔨 Running: next build --webpack (CAPACITOR_BUILD=1)");
  execSync("cross-env CAPACITOR_BUILD=1 next build --webpack", {
    cwd: root,
    stdio: "inherit",
  });

  console.log("✅ Android web build complete.");
} finally {
  restore();
}
