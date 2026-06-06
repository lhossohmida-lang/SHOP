"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, X, Loader2 } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scannedRef = useRef(false);

  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  useEffect(() => {
    let active = true;

    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (devices.length === 0) {
          setError("لا توجد كاميرا متاحة");
          setLoading(false);
          return;
        }

        // Prefer back camera
        const backCamera =
          devices.find(
            (d) =>
              d.label.toLowerCase().includes("back") ||
              d.label.toLowerCase().includes("rear") ||
              d.label.toLowerCase().includes("environment")
          ) || devices[devices.length - 1];

        setLoading(false);

        await reader.decodeFromVideoDevice(
          backCamera.deviceId,
          videoRef.current!,
          (result, err) => {
            if (!active || scannedRef.current) return;
            if (result) {
              scannedRef.current = true;
              onScanRef.current(result.getText());
              onCloseRef.current();
            }
          }
        );
      } catch (e: unknown) {
        if (active) {
          const msg = e instanceof Error ? e.message : "خطأ في الكاميرا";
          setError(
            msg.includes("Permission") || msg.includes("NotAllowed")
              ? "لم يتم السماح بالوصول للكاميرا. يرجى السماح في إعدادات المتصفح."
              : "تعذر تشغيل الكاميرا: " + msg
          );
          setLoading(false);
        }
      }
    }

    startScanner();

    return () => {
      active = false;
      if (readerRef.current) {
        try {
          BrowserMultiFormatReader.releaseAllStreams();
        } catch {}
      }
    };
  }, []);

  return (
    <div className="modal-overlay" style={{ zIndex: 100 }} onClick={onClose}>
      <div
        className="card animate-slide-up"
        style={{ width: "100%", maxWidth: "400px", padding: "1.25rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h3
            style={{
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Camera size={20} color="#49a35c" />
            مسح الباركود
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#6b7280",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: "2rem",
              color: "#49a35c",
            }}
          >
            <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 0.5rem" }} />
            <p style={{ fontSize: "0.875rem" }}>جارٍ تشغيل الكاميرا...</p>
          </div>
        )}

        {error && (
          <div
            style={{
              background: "#fff5f5",
              border: "1px solid #fca5a5",
              borderRadius: "0.5rem",
              padding: "1rem",
              color: "#dc2626",
              fontSize: "0.875rem",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            position: "relative",
            borderRadius: "0.75rem",
            overflow: "hidden",
            background: "#000",
            display: loading || error ? "none" : "block",
          }}
        >
          <video
            ref={videoRef}
            style={{ width: "100%", display: "block", maxHeight: "300px", objectFit: "cover" }}
            autoPlay
            playsInline
            muted
          />
          {/* Scan line animation */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "10%",
              right: "10%",
              height: "2px",
              background: "rgba(73, 163, 92, 0.8)",
              boxShadow: "0 0 8px rgba(73, 163, 92, 0.6)",
              animation: "scanLine 2s ease-in-out infinite",
            }}
          />
          {/* Corner markers */}
          {[
            { top: "10%", right: "10%", borderTop: "3px solid #49a35c", borderRight: "3px solid #49a35c" },
            { top: "10%", left: "10%", borderTop: "3px solid #49a35c", borderLeft: "3px solid #49a35c" },
            { bottom: "10%", right: "10%", borderBottom: "3px solid #49a35c", borderRight: "3px solid #49a35c" },
            { bottom: "10%", left: "10%", borderBottom: "3px solid #49a35c", borderLeft: "3px solid #49a35c" },
          ].map((s, i) => (
            <div key={i} style={{ position: "absolute", width: "20px", height: "20px", ...s }} />
          ))}
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: "0.8rem",
            color: "#6b7280",
            marginTop: "0.75rem",
          }}
        >
          وجّه الكاميرا نحو الباركود أو رمز QR
        </p>
        <style>{`
          @keyframes scanLine {
            0%, 100% { transform: translateY(-40px); }
            50% { transform: translateY(40px); }
          }
        `}</style>
      </div>
    </div>
  );
}
