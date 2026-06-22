"use client";
import { useAuth } from "@/hooks/useAuth";
import { useNetworkMode } from "@/hooks/useNetworkMode";
import { Wifi, WifiOff, Menu } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const pageTitles: Record<string, string> = {
  "/dashboard": "لوحة التحكم",
  "/pos": "نقطة البيع",
  "/products": "المنتجات",
  "/products/new": "منتج جديد",
  "/inventory": "المخزون",
  "/purchases": "المشتريات",
  "/credits": "خانة الكريديتات والمصاريف",
  "/reports": "التقارير",
  "/ai": "المساعد الذكي",
};

export default function TopBar() {
  const { appUser } = useAuth();
  const { effectiveOnline, manualOffline, weak, latency, toggle } = useNetworkMode();
  const [menuOpen, setMenuOpen] = useState(false);

  // نص توضيحي لحالة الاتصال
  const statusLabel = effectiveOnline
    ? "متصل"
    : weak
      ? "ضعيف — غير متصل"
      : "غير متصل";
  const statusTitle = weak
    ? `الاتصال ضعيف${latency != null ? ` (${latency}ms)` : ""} — تم التحويل التلقائي لعدم الاتصال (الحدّ 300ms)`
    : effectiveOnline
      ? `متصل${latency != null ? ` (${latency}ms)` : ""} — اضغط للتحويل لعدم الاتصال`
      : "وضع عدم الاتصال اليدوي — اضغط للاتصال";

  return (
    <header
      style={{
        height: "60px",
        background: "white",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 1.5rem",
        boxShadow: "0 2px 8px rgba(23,35,28,0.04)",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Right side: hamburger (mobile) + greeting */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button
          className="md:hidden"
          onClick={() => setMenuOpen((o) => !o)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}
        >
          <Menu size={22} />
        </button>
        <div>
          <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>مرحباً،</div>
          <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#17231c" }}>
            {appUser?.displayName || "مستخدم"}
          </div>
        </div>
      </div>

      {/* Left side: status + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {/* زر تبديل الاتصال يدوياً (متصل / غير متصل) */}
        <button
          onClick={toggle}
          title={statusTitle}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            padding: "0.3rem 0.75rem",
            borderRadius: "9999px",
            border: "none",
            cursor: "pointer",
            background: effectiveOnline ? "#dff0d6" : weak ? "#fef3c7" : "#fee2e2",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: effectiveOnline ? "#26683a" : weak ? "#92400e" : "#dc2626",
            transition: "all 0.15s",
          }}
        >
          {effectiveOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="hidden sm:inline">{statusLabel}</span>
        </button>

        {/* POS shortcut */}
        <Link
          href="/pos"
          style={{
            background: "linear-gradient(135deg, #49a35c, #26683a)",
            color: "white",
            padding: "0.375rem 1rem",
            borderRadius: "0.5rem",
            textDecoration: "none",
            fontSize: "0.8rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
        >
          🛒 <span className="hidden sm:inline">بيع جديد</span>
        </Link>
      </div>
    </header>
  );
}
