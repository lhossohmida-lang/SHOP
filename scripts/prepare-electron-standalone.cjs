const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

function copyDir(src, dst) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source: ${src}`);
  }

  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

if (!fs.existsSync(path.join(standaloneDir, "server.js"))) {
  throw new Error("Next standalone server.js was not found. Run next build first.");
}

copyDir(path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static"));
copyDir(path.join(root, "public"), path.join(standaloneDir, "public"));

console.log("Prepared Electron standalone assets.");
