"use client";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Wifi, WifiOff, Bell, Menu } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const pageTitles: Record<string, string> = {
  "/dashboard": "لوحة التحكم",
  "/pos": "نقطة البيع",
  "/products": "المنتجات",
  "/products/new": "منتج جديد",
  "/inventory": "المخزون",
  "/purchases": "المشتريات",
  "/credits": "الكريديتيات",
  "/reports": "التقارير",
  "/ai": "المساعد الذكي",
};

export default function TopBar() {
  const { appUser } = useAuth();
  const isOnline = useOnlineStatus();
  const [menuOpen, setMenuOpen] = useState(false);

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
        {/* Online status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            padding: "0.25rem 0.75rem",
            borderRadius: "9999px",
            background: isOnline ? "#dff0d6" : "#fee2e2",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: isOnline ? "#26683a" : "#dc2626",
          }}
        >
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="hidden sm:inline">{isOnline ? "متصل" : "غير متصل"}</span>
        </div>

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
