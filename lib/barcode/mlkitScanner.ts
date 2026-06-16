import type { PluginListenerHandle } from "@capacitor/core";
import { GROCERY_BARCODE_FORMATS, isValidGroceryBarcode, normalizeBarcode } from "./groceryFormats";

let polyfillLoaded = false;

async function ensurePolyfill(): Promise<void> {
  if (polyfillLoaded || typeof window === "undefined") return;
  await import("barcode-detector/polyfill");
  polyfillLoaded = true;
}

export async function isMlKitSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    await ensurePolyfill();
    const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
    const { supported } = await BarcodeScanner.isSupported();
    return supported;
  } catch {
    return false;
  }
}

export async function requestMlKitCameraPermission(): Promise<boolean> {
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
  const current = await BarcodeScanner.checkPermissions();
  if (current.camera === "granted" || current.camera === "limited") return true;

  const result = await BarcodeScanner.requestPermissions();
  return result.camera === "granted" || result.camera === "limited";
}

export async function ensureAndroidScannerModule(): Promise<void> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.getPlatform() !== "android") return;

  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    try {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
    } catch {
      // startScan still works with camera-based ML Kit
    }
  }
}

export type MlKitScanSession = {
  stop: () => Promise<void>;
};

export async function startMlKitScan(onDetected: (barcode: string) => void): Promise<MlKitScanSession> {
  await ensurePolyfill();
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");

  await ensureAndroidScannerModule();

  const granted = await requestMlKitCameraPermission();
  if (!granted) {
    throw new Error("CAMERA_PERMISSION_DENIED");
  }

  document.body.classList.add("barcode-scanner-active");

  let listener: PluginListenerHandle | null = null;

  // إن فشل بدء المسح، أزِل صنف الإخفاء فوراً وإلا يبقى التطبيق مخفياً/غير قابل للتفاعل.
  try {
    listener = await BarcodeScanner.addListener("barcodesScanned", (event) => {
      const raw = event.barcodes[0]?.rawValue ?? event.barcodes[0]?.displayValue ?? "";
      const code = normalizeBarcode(raw);
      if (code && isValidGroceryBarcode(code)) {
        onDetected(code);
      }
    });

    await BarcodeScanner.startScan({
      formats: GROCERY_BARCODE_FORMATS,
    });
  } catch (e) {
    document.body.classList.remove("barcode-scanner-active");
    try { await listener?.remove(); } catch {}
    try { await BarcodeScanner.removeAllListeners(); } catch {}
    try { await BarcodeScanner.stopScan(); } catch {}
    throw e;
  }

  return {
    stop: async () => {
      document.body.classList.remove("barcode-scanner-active");
      try {
        await listener?.remove();
      } catch {}
      try {
        await BarcodeScanner.removeAllListeners();
      } catch {}
      try {
        await BarcodeScanner.stopScan();
      } catch {}
    },
  };
}

/** Native full-screen Google scanner — fast fallback on Android */
export async function scanWithMlKitDialog(): Promise<string | null> {
  await ensurePolyfill();
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");

  await ensureAndroidScannerModule();

  const granted = await requestMlKitCameraPermission();
  if (!granted) throw new Error("CAMERA_PERMISSION_DENIED");

  const { barcodes } = await BarcodeScanner.scan({
    formats: GROCERY_BARCODE_FORMATS,
  });

  const raw = barcodes[0]?.rawValue ?? barcodes[0]?.displayValue ?? "";
  const code = normalizeBarcode(raw);
  return code && isValidGroceryBarcode(code) ? code : null;
}
