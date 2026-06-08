/**
 * Generates app icons for Electron (EXE) and Android (APK) from public/logo.png
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const logoPath = path.join(root, "public", "logo.png");
const iconPath = path.join(root, "public", "icon.png");

if (!fs.existsSync(logoPath)) {
  console.error("Missing public/logo.png — add the store logo first.");
  process.exit(1);
}

fs.copyFileSync(logoPath, iconPath);
console.log("✓ public/icon.png");

const androidRes = path.join(root, "android", "app", "src", "main", "res");
const drawableDir = path.join(androidRes, "drawable");
fs.mkdirSync(drawableDir, { recursive: true });
fs.copyFileSync(logoPath, path.join(drawableDir, "app_logo.png"));
console.log("✓ android drawable/app_logo.png");

const mipmapSizes = ["mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"];
for (const folder of mipmapSizes) {
  const dir = path.join(androidRes, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(logoPath, path.join(dir, "ic_launcher.png"));
  fs.copyFileSync(logoPath, path.join(dir, "ic_launcher_foreground.png"));
  fs.copyFileSync(logoPath, path.join(dir, "ic_launcher_round.png"));
  console.log(`✓ android ${folder}/`);
}

const launcherXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/app_logo"/>
</adaptive-icon>
`;

const anydpiDir = path.join(androidRes, "mipmap-anydpi-v26");
fs.mkdirSync(anydpiDir, { recursive: true });
fs.writeFileSync(path.join(anydpiDir, "ic_launcher.xml"), launcherXml);
fs.writeFileSync(path.join(anydpiDir, "ic_launcher_round.xml"), launcherXml);
console.log("✓ android adaptive icon XML");

const bgColorPath = path.join(androidRes, "values", "ic_launcher_background.xml");
if (fs.existsSync(bgColorPath)) {
  fs.writeFileSync(
    bgColorPath,
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
`
  );
  console.log("✓ ic_launcher_background white");
}

console.log("\nIcons ready. Rebuild APK/EXE to apply.");
