"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, X, Loader2, RefreshCw, ZoomIn } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<any>(null);
  const scannedRef = useRef(false);
  const activeRef = useRef(true);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const stopScanner = useCallback(() => {
    if (controlsRef.current) {
      try { controlsRef.current.stop(); } catch {}
      controlsRef.current = null;
    }
    try { BrowserMultiFormatReader.releaseAllStreams(); } catch {}
  }, []);

  const startScanner = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    scannedRef.current = false;
    stopScanner();

    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");

      // EAN-13 and EAN-8 only — optimized for retail grocery products
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints, 200);
      readerRef.current = reader;

      const callback = (result: any) => {
        if (!activeRef.current || scannedRef.current) return;
        if (result) {
          scannedRef.current = true;
          const code = result.getText();
          // Normalize: strip leading zeros if needed, return clean EAN code
          onScanRef.current(code);
          onCloseRef.current();
        }
      };

      // Use constraints for high-resolution back camera
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width:  { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        },
      };

      setStatus("ready");

      const controls = await reader.decodeFromConstraints(
        constraints,
        videoRef.current!,
        callback
      );
      controlsRef.current = controls;

    } catch (e: unknown) {
      if (!activeRef.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("NotFound")) {
        setErrorMsg("لم يتم السماح بالوصول للكاميرا.\nيرجى السماح في إعدادات التطبيق ثم أعد المحاولة.");
      } else {
        setErrorMsg("تعذر تشغيل الكاميرا:\n" + msg);
      }
      setStatus("error");
    }
  }, [stopScanner]);

  useEffect(() => {
    activeRef.current = true;
    startScanner();
    return () => {
      activeRef.current = false;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 100 }}
      onClick={onClose}
    >
      <div
        className="card animate-slide-up"
        style={{
          width: "100%",
          maxWidth: "440px",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
            <Camera size={20} color="#49a35c" />
            مسح باركود EAN
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: "0.25rem" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Camera viewport */}
        <div
          style={{
            position: "relative",
            borderRadius: "0.75rem",
            overflow: "hidden",
            background: "#111",
            aspectRatio: "4/3",
            width: "100%",
          }}
        >
          {/* Always-mounted video element — must stay in DOM for ZXing to attach */}
          <video
            ref={videoRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
            autoPlay
            playsInline
            muted
          />

          {/* Scan window overlay — horizontal rectangle matching EAN-13 shape */}
          {status === "ready" && (
            <>
              {/* Dark masks top/bottom */}
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "28%", background: "rgba(0,0,0,0.55)" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "28%", background: "rgba(0,0,0,0.55)" }} />
                <div style={{ position: "absolute", top: "28%", bottom: "28%", left: 0, width: "8%", background: "rgba(0,0,0,0.55)" }} />
                <div style={{ position: "absolute", top: "28%", bottom: "28%", right: 0, width: "8%", background: "rgba(0,0,0,0.55)" }} />
              </div>

              {/* Scan window border */}
              <div style={{
                position: "absolute",
                top: "28%", bottom: "28%",
                left: "8%", right: "8%",
                border: "2px solid rgba(73,163,92,0.9)",
                borderRadius: "6px",
                pointerEvents: "none",
              }} />

              {/* Animated scan line inside window */}
              <div style={{
                position: "absolute",
                left: "8%",
                right: "8%",
                height: "2px",
                background: "linear-gradient(90deg, transparent, #49a35c, transparent)",
                boxShadow: "0 0 10px rgba(73,163,92,0.8)",
                animation: "eanScan 1.8s ease-in-out infinite",
                pointerEvents: "none",
                top: "28%",
              }} />

              {/* Corner accents */}
              {[
                { top: "calc(28% - 1px)", left: "calc(8% - 1px)", borderTop: "3px solid #49a35c", borderLeft: "3px solid #49a35c", borderRadius: "4px 0 0 0" },
                { top: "calc(28% - 1px)", right: "calc(8% - 1px)", borderTop: "3px solid #49a35c", borderRight: "3px solid #49a35c", borderRadius: "0 4px 0 0" },
                { bottom: "calc(28% - 1px)", left: "calc(8% - 1px)", borderBottom: "3px solid #49a35c", borderLeft: "3px solid #49a35c", borderRadius: "0 0 0 4px" },
                { bottom: "calc(28% - 1px)", right: "calc(8% - 1px)", borderBottom: "3px solid #49a35c", borderRight: "3px solid #49a35c", borderRadius: "0 0 4px 0" },
              ].map((s, i) => (
                <div key={i} style={{ position: "absolute", width: "22px", height: "22px", pointerEvents: "none", ...s }} />
              ))}
            </>
          )}

          {/* Loading overlay */}
          {status === "loading" && (
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(0,0,0,0.85)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              color: "#49a35c", gap: "0.75rem",
            }}>
              <Loader2 size={36} className="animate-spin" />
              <p style={{ fontSize: "0.875rem", margin: 0, color: "#d1fae5" }}>جارٍ تشغيل الكاميرا...</p>
            </div>
          )}

          {/* Error overlay */}
          {status === "error" && (
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(0,0,0,0.9)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "1.5rem", gap: "1rem", textAlign: "center",
            }}>
              <div style={{ fontSize: "2rem" }}>📷</div>
              <p style={{ color: "#fca5a5", fontSize: "0.85rem", margin: 0, whiteSpace: "pre-line", lineHeight: 1.7 }}>
                {errorMsg}
              </p>
              <button
                onClick={startScanner}
                style={{
                  display: "flex", alignItems: "center", gap: "0.4rem",
                  padding: "0.6rem 1.25rem", borderRadius: "0.5rem",
                  background: "#26683a", color: "white", border: "none",
                  cursor: "pointer", fontWeight: 600, fontSize: "0.875rem",
                }}
              >
                <RefreshCw size={15} />
                إعادة المحاولة
              </button>
            </div>
          )}
        </div>

        {/* Hint text */}
        {status === "ready" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "0.78rem", color: "#6b7280", margin: 0, lineHeight: 1.6 }}>
              <ZoomIn size={12} style={{ display: "inline", marginLeft: "0.25rem", verticalAlign: "middle" }} />
              وجّه الكاميرا نحو الباركود واجعله داخل الإطار الأخضر
            </p>
            <p style={{ fontSize: "0.7rem", color: "#9ca3af", margin: "0.25rem 0 0", fontFamily: "monospace" }}>
              EAN-13 · EAN-8
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes eanScan {
          0%   { top: calc(28% + 4px);  opacity: 0.6; }
          50%  { top: calc(72% - 6px);  opacity: 1; }
          100% { top: calc(28% + 4px);  opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
