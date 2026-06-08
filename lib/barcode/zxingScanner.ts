import { isValidGroceryBarcode, normalizeBarcode } from "./groceryFormats";

export type ZxingScanSession = {
  stop: () => void;
};

function captureScanRegion(video: HTMLVideoElement): HTMLCanvasElement | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const sx = Math.floor(vw * 0.06);
  const sy = Math.floor(vh * 0.3);
  const sw = Math.floor(vw * 0.88);
  const sh = Math.floor(vh * 0.4);

  const canvas = document.createElement("canvas");
  canvas.width = Math.min(sw * 2, 1280);
  canvas.height = Math.min(sh * 2, 480);

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function startZxingScan(
  videoEl: HTMLVideoElement,
  onDetected: (barcode: string) => void
): Promise<ZxingScanSession> {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);

  const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 50 });
  let stopped = false;
  let rafId = 0;
  let decoding = false;
  let lastAttempt = 0;

  const tryDetect = (raw: string) => {
    if (stopped) return;
    const code = normalizeBarcode(raw);
    if (code && isValidGroceryBarcode(code)) {
      stopped = true;
      onDetected(code);
    }
  };

  const constraints: MediaStreamConstraints = {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920, min: 640 },
      height: { ideal: 1080, min: 480 },
    },
  };

  const controls = await reader.decodeFromConstraints(constraints, videoEl, (result) => {
    if (result) tryDetect(result.getText());
  });

  const tick = async (now: number) => {
    if (stopped) return;
    if (now - lastAttempt >= 60 && !decoding && videoEl.videoWidth > 0) {
      lastAttempt = now;
      const canvas = captureScanRegion(videoEl);
      if (canvas) {
        decoding = true;
        try {
          const result = await reader.decodeFromCanvas(canvas);
          if (result) tryDetect(result.getText());
        } catch {
          // keep scanning
        } finally {
          decoding = false;
        }
      }
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      try {
        controls.stop();
      } catch {}
      try {
        BrowserMultiFormatReader.releaseAllStreams();
      } catch {}
    },
  };
}
