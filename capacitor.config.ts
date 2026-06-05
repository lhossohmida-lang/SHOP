import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.blgasm.pos",
  appName: "Blgasm POS",
  webDir: "out",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
          androidScheme: serverUrl.startsWith("http://") ? "http" : "https",
        },
      }
    : {}),
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
