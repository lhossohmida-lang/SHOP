"use client";

// رسالة عائمة غير معطِّلة — بديل آمن عن alert() الذي يوقف الواجهة وقد يُجمّد WebView.
// ابدأ الرسالة بـ "⚠️" لعرضها بلون أحمر (خطأ)، وإلا تظهر خضراء (نجاح).
export default function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      style={{
        position: "fixed", top: "1rem", left: "50%", transform: "translateX(-50%)",
        padding: "0.75rem 1.5rem", borderRadius: "0.75rem", zIndex: 300,
        background: message.startsWith("⚠️") ? "#dc2626" : "#26683a",
        color: "white", fontWeight: 600, fontSize: "0.875rem",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)", maxWidth: "90vw", textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}
