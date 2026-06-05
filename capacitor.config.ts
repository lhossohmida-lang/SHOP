import { CapacitorConfig } from "@capacitor/cli";

// ─────────────────────────────────────────────────────────────────────────────
// Blgasm POS – Capacitor Configuration
//
// Strategy: point the WebView at the live web app URL instead of bundling a
// static export.  This means:
//  • No static-export build needed (avoids Turbopack CSS-timeout issues)
//  • The Android APK always shows the latest version of the web app
//  • All platforms share the same Firebase Firestore → real-time sync works
//
// For production change `url` to your deployed web app URL (Vercel / custom).
// For local testing you can use your PC's LAN IP, e.g. http://192.168.x.x:3000
// ─────────────────────────────────────────────────────────────────────────────

const config: CapacitorConfig = {
  appId: "com.blgasm.pos",
  appName: "Blgasm POS",
  webDir: "out",                // fallback if live URL is removed
  server: {
    url: "http://192.168.1.10:3000",  // ← your PC's LAN IP
    cleartext: true,                 // allow HTTP on Android
    androidScheme: "http",
  },
  android: {
    backgroundColor: "#f8fdf5",
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Camera: {
      permissions: ["camera"],
    },
  },
};

export default config;
