"use client";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AppError]", error);
    // أزِل أي صنف عالق قد يخفي التطبيق (ماسح الباركود) حتى لا تبقى الشاشة متجمّدة.
    document.body.classList.remove("barcode-scanner-active");
  }, [error]);

  return (
    <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div className="card" style={{ maxWidth: "560px", width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>⚠️</div>
        <h2 style={{ fontWeight: 700, color: "#dc2626", marginBottom: "0.5rem" }}>حدث خطأ غير متوقّع</h2>
        <p style={{ color: "#4b5563", fontSize: "0.875rem", marginBottom: "1rem" }}>
          توقّفت الواجهة. اضغط "إعادة المحاولة" للمتابعة دون فقدان بياناتك.
        </p>

        <div style={{
          background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "0.5rem",
          padding: "0.75rem", textAlign: "left", direction: "ltr",
          fontFamily: "monospace", fontSize: "0.72rem", color: "#991b1b",
          maxHeight: "180px", overflow: "auto", marginBottom: "1.25rem", whiteSpace: "pre-wrap",
        }}>
          {error?.message || "Unknown error"}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button onClick={() => reset()} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center" }}>
            <RefreshCw size={16} /> إعادة المحاولة
          </button>
          <button onClick={() => { window.location.href = "/pos"; }} className="btn-secondary" style={{ justifyContent: "center" }}>
            العودة لنقطة البيع
          </button>
        </div>
      </div>
    </div>
  );
}
