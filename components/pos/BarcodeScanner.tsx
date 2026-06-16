"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, Loader2, RefreshCw, Keyboard, ScanLine } from "lucide-react";
import {
  isMlKitSupported,
  startMlKitScan,
  scanWithMlKitDialog,
  type MlKitScanSession,
} from "@/lib/barcode/mlkitScanner";
import { startZxingScan, type ZxingScanSession } from "@/lib/barcode/zxingScanner";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

async function isNativeApp(): Promise<boolean> {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannedRef = useRef(false);
  const mlKitSessionRef = useRef<MlKitScanSession | null>(null);
  const zxingSessionRef = useRef<ZxingScanSession | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const autoLaunchDoneRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState<"camera" | "manual">("camera");
  const [useNativeCamera, setUseNativeCamera] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState("");

  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  // ضمان نهائي: عند إزالة الماسح من الشاشة أزِل صنف الإخفاء مهما حدث،
  // حتى لا يبقى التطبيق مخفياً/متجمّداً (لا يمكن الكتابة) إذا تعطّل مسار الإغلاق.
  useEffect(() => {
    return () => { document.body.classList.remove("barcode-scanner-active"); };
  }, []);

  const stopSession = useCallback(async () => {
    // كل خطوة في try مستقلة حتى لا يمنع فشل إحداها إغلاق الماسح أو إزالة صنف الإخفاء.
    try {
      if (mlKitSessionRef.current) {
        await mlKitSessionRef.current.stop();
        mlKitSessionRef.current = null;
      }
    } catch {}
    try {
      if (zxingSessionRef.current) {
        zxingSessionRef.current.stop();
        zxingSessionRef.current = null;
      }
    } catch {}
    document.body.classList.remove("barcode-scanner-active");
  }, []);

  const handleSuccess = useCallback(
    async (code: string) => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      await stopSession();
      onScanRef.current(code);
      onCloseRef.current();
    },
    [stopSession]
  );

  const startInlineScan = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    scannedRef.current = false;
    await stopSession();

    try {
      const native = await isNativeApp();

      if (native) {
        setUseNativeCamera(true);
        const supported = await isMlKitSupported();
        if (!supported) {
          setErrorMsg("ML Kit غير مدعوم.\nاستخدم الإدخال اليدوي.");
          setStatus("error");
          return;
        }

        const session = await startMlKitScan((code) => {
          void handleSuccess(code);
        });
        mlKitSessionRef.current = session;
        setStatus("ready");
        return;
      }

      setUseNativeCamera(false);
      await new Promise<void>((resolve) => {
        const waitForVideo = () => {
          if (videoRef.current) resolve();
          else requestAnimationFrame(waitForVideo);
        };
        waitForVideo();
      });

      const session = await startZxingScan(videoRef.current!, (code) => {
        void handleSuccess(code);
      });
      zxingSessionRef.current = session;
      setStatus("ready");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "CAMERA_PERMISSION_DENIED") {
        setErrorMsg("لم يُسمح بالوصول للكاميرا.");
      } else if (msg.includes("Permission") || msg.includes("NotAllowed")) {
        setErrorMsg("لم يُسمح بالوصول للكاميرا.\nاستخدم الإدخال اليدوي.");
      } else {
        setErrorMsg("تعذر تشغيل الكاميرا.\nاستخدم الإدخال اليدوي.");
      }
      setStatus("error");
    }
  }, [stopSession, handleSuccess]);

  const startAutoScan = useCallback(async () => {
    if (autoLaunchDoneRef.current) return;
    autoLaunchDoneRef.current = true;

    setStatus("loading");

    const native = await isNativeApp();
    if (native) {
      try {
        const supported = await isMlKitSupported();
        if (supported) {
          const code = await scanWithMlKitDialog();
          if (code) {
            await handleSuccess(code);
            return;
          }
        }
      } catch {
        // fall through to inline continuous scan
      }
    }

    await startInlineScan();
  }, [handleSuccess, startInlineScan]);

  useEffect(() => {
    autoLaunchDoneRef.current = false;

    if (tab === "camera") {
      void startAutoScan();
    } else {
      void stopSession();
      setTimeout(() => manualInputRef.current?.focus(), 100);
    }

    return () => {
      void stopSession();
    };
  }, [tab, startAutoScan, stopSession]);

  const handleClose = useCallback(() => {
    void stopSession();
    onCloseRef.current();
  }, [stopSession]);

  const submitManual = useCallback(() => {
    const code = manualCode.replace(/\s/g, "").trim();
    if (code.length === 0) {
      setManualError("أدخل رقم الباركود");
      return;
    }
    if (!/^\d+$/.test(code)) {
      setManualError("يجب أن يحتوي على أرقام فقط");
      return;
    }
    if (code.length < 8) {
      setManualError(`رقم قصير جداً (${code.length} أرقام)`);
      return;
    }
    setManualError("");
    onScanRef.current(code);
    onCloseRef.current();
  }, [manualCode]);

  useEffect(() => {
    const clean = manualCode.replace(/\s/g, "");
    if (/^\d{8}$/.test(clean) || /^\d{12}$/.test(clean) || /^\d{13}$/.test(clean)) {
      setManualError("");
      onScanRef.current(clean);
      onCloseRef.current();
    }
  }, [manualCode]);

  return (
    <div
      className={`modal-overlay barcode-scanner-modal ${useNativeCamera ? "scanner-overlay-bg" : ""}`}
      style={{ zIndex: 100, background: useNativeCamera && tab === "camera" ? "transparent" : undefined }}
      onClick={handleClose}
    >
      <div
        className="card animate-slide-up barcode-scanner-modal"
        style={{
          width: "100%",
          maxWidth: "440px",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
          background: useNativeCamera && tab === "camera" ? "rgba(255,255,255,0.92)" : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
            <Camera size={20} color="#49a35c" />
            مسح الباركود
          </h3>
          <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: "0.25rem" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: "flex", borderRadius: "0.5rem", overflow: "hidden", border: "1px solid #e5e7eb" }}>
          {(["camera", "manual"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "0.55rem", border: "none", cursor: "pointer",
                fontWeight: tab === t ? 700 : 400, fontSize: "0.82rem",
                background: tab === t ? "#26683a" : "white",
                color: tab === t ? "white" : "#6b7280",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem",
              }}
            >
              {t === "camera" ? <><Camera size={14} /> كاميرا</> : <><Keyboard size={14} /> إدخال يدوي</>}
            </button>
          ))}
        </div>

        {tab === "camera" && (
          <>
            <div
              className="barcode-scanner-modal"
              style={{
                position: "relative",
                borderRadius: "0.75rem",
                overflow: "hidden",
                background: useNativeCamera ? "transparent" : "#111",
                aspectRatio: "4/3",
                width: "100%",
              }}
            >
              <video
                ref={videoRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: useNativeCamera ? "none" : "block",
                }}
                autoPlay
                playsInline
                muted
              />

              {status === "ready" && (
                <>
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "30%", background: "rgba(0,0,0,0.45)" }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "30%", background: "rgba(0,0,0,0.45)" }} />
                    <div style={{ position: "absolute", top: "30%", bottom: "30%", left: 0, width: "6%", background: "rgba(0,0,0,0.45)" }} />
                    <div style={{ position: "absolute", top: "30%", bottom: "30%", right: 0, width: "6%", background: "rgba(0,0,0,0.45)" }} />
                  </div>
                  <div style={{ position: "absolute", top: "30%", bottom: "30%", left: "6%", right: "6%", border: "2px solid rgba(73,163,92,0.95)", borderRadius: "6px", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", left: "6%", right: "6%", height: "2px", background: "linear-gradient(90deg,transparent,#49a35c,transparent)", boxShadow: "0 0 10px rgba(73,163,92,0.8)", animation: "eanScan 1.8s ease-in-out infinite", pointerEvents: "none", top: "30%" }} />
                </>
              )}

              {status === "loading" && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#49a35c", gap: "0.75rem", borderRadius: "0.75rem" }}>
                  <Loader2 size={36} className="animate-spin" />
                  <p style={{ fontSize: "0.875rem", margin: 0, color: "#d1fae5" }}>جارٍ تشغيل الماسح التلقائي...</p>
                </div>
              )}

              {status === "error" && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem", gap: "0.75rem", textAlign: "center", borderRadius: "0.75rem" }}>
                  <div style={{ fontSize: "2rem" }}>📷</div>
                  <p style={{ color: "#fca5a5", fontSize: "0.82rem", margin: 0, whiteSpace: "pre-line", lineHeight: 1.7 }}>{errorMsg}</p>
                  <button onClick={() => { autoLaunchDoneRef.current = false; void startAutoScan(); }} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", background: "#26683a", color: "white", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem" }}>
                    <RefreshCw size={14} /> إعادة المحاولة
                  </button>
                </div>
              )}
            </div>

            {status === "ready" && (
              <p style={{ fontSize: "0.78rem", color: "#6b7280", margin: 0, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}>
                <ScanLine size={14} color="#49a35c" />
                القراءة تلقائية — وجّه الباركود داخل الإطار وسيُضاف المنتج فوراً
              </p>
            )}
          </>
        )}

        {tab === "manual" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "0.625rem", padding: "0.75rem 1rem", fontSize: "0.8rem", color: "#15803d", lineHeight: 1.7 }}>
              📦 أدخل الأرقام المطبوعة <strong>أسفل الباركود</strong> — يُضاف تلقائياً عند اكتمال الرقم
            </div>

            <div style={{ position: "relative" }}>
              <input
                ref={manualInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={14}
                placeholder="أدخل رقم الباركود..."
                value={manualCode}
                onChange={(e) => {
                  setManualCode(e.target.value.replace(/\D/g, ""));
                  setManualError("");
                }}
                onKeyDown={(e) => { if (e.key === "Enter") submitManual(); }}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "0.875rem 1rem",
                  fontSize: "1.5rem", fontFamily: "monospace", fontWeight: 700,
                  letterSpacing: "0.15em", textAlign: "center",
                  border: `2px solid ${manualError ? "#fca5a5" : manualCode.length >= 8 ? "#49a35c" : "#e5e7eb"}`,
                  borderRadius: "0.625rem", outline: "none",
                  background: manualCode.length >= 8 ? "#f0fdf4" : "white",
                  color: "#17231c",
                }}
                autoFocus
              />
            </div>

            {manualError && (
              <p style={{ color: "#dc2626", fontSize: "0.8rem", margin: 0, textAlign: "center" }}>⚠️ {manualError}</p>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes eanScan {
          0%   { top: calc(30% + 4px); opacity: 0.6; }
          50%  { top: calc(70% - 6px); opacity: 1; }
          100% { top: calc(30% + 4px); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
