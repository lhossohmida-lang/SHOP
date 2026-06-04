import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.blgasm.pos",
  appName: "Blgasm POS",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#f8fdf5",
  },
  plugins: {
    Camera: {
      permissions: ["camera"],
    },
  },
};

export default config;
