"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LOGO_PATH, STORE_NAME, STORE_TAGLINE } from "@/lib/constants/branding";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { getPosShortcuts } from "@/lib/firestore/shortcuts";
import type { Product } from "@/types/product";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  TruckIcon,
  CreditCard,
  BarChart3,
  Sparkles,
  LogOut,
  Zap,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/pos", label: "بيع", icon: ShoppingCart },
  { href: "/products", label: "المنتجات", icon: Package },
  { href: "/inventory", label: "المخزون", icon: Boxes },
  { href: "/purchases", label: "المشتريات", icon: TruckIcon },
  { href: "/credits", label: "خانة الكريديتات والمصاريف", icon: CreditCard },
  { href: "/reports", label: "التقارير", icon: BarChart3 },
  { href: "/ai", label: "المساعد الذكي", icon: Sparkles },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { appUser, logOut } = useAuth();
  const storeId = appUser?.storeId;
  const { activeProducts } = useProducts(storeId);
  const [shortcuts, setShortcuts] = useState<(Product | null)[]>(Array(9).fill(null));

  useEffect(() => {
    if (!storeId || activeProducts.length === 0 || pathname !== "/pos") return;
    getPosShortcuts(storeId).then((data) => {
      const resolved = data.slots.map((id) =>
        id ? activeProducts.find((p) => p.id === id) ?? null : null
      );
      setShortcuts(resolved);
    });
  }, [storeId, activeProducts, pathname]);

  return (
    <aside
      style={{
        width: "240px",
        height: "100vh",
        background: "white",
        borderLeft: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        boxShadow: "4px 0 20px rgba(23,35,28,0.05)",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "1.5rem 1.25rem",
          borderBottom: "1px solid #f3f4f6",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <Image
          src={LOGO_PATH}
          alt={STORE_NAME}
          width={40}
          height={40}
          style={{ borderRadius: "10px", flexShrink: 0, objectFit: "cover" }}
        />
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#17231c" }}>
            {STORE_NAME}
          </div>
          <div style={{ fontSize: "0.7rem", color: "#49a35c" }}>{STORE_TAGLINE}</div>
        </div>
      </div>

      {/* Nav Links */}
      <nav style={{ flex: 1, padding: "0.75rem 0.75rem", overflowY: "auto" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.625rem 0.875rem",
                    borderRadius: "0.625rem",
                    textDecoration: "none",
                    fontSize: "0.875rem",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#26683a" : "#4b5563",
                    background: isActive ? "linear-gradient(135deg, #f1f8ee, #dff0d6)" : "transparent",
                    borderRight: isActive ? "3px solid #49a35c" : "3px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* POS Shortcuts Grid */}
      {pathname === "/pos" && (
        <div style={{
          padding: "0.75rem 1rem",
          borderTop: "1px solid #f3f4f6",
          background: "#fafafa",
        }}>
          <div style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "#4b5563",
            marginBottom: "0.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}>
            <Zap size={13} color="#f59e0b" fill="#f59e0b" /> الاختصارات السريعة
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "0.35rem",
          }}>
            {shortcuts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (p) {
                    const event = new CustomEvent("add-shortcut-product", { detail: p });
                    window.dispatchEvent(event);
                  }
                }}
                disabled={!p}
                title={p ? `${p.nameAr || p.name} — ${p.sellingPrice} د.ج` : "فارغ"}
                style={{
                  height: "56px",
                  borderRadius: "0.5rem",
                  border: p ? "1px solid #c5e5b8" : "1px dashed #e5e7eb",
                  background: p ? (p.stock === 0 ? "#fff5f5" : "#f1f8ee") : "#fafafa",
                  cursor: p ? "pointer" : "default",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  color: p ? (p.stock === 0 ? "#dc2626" : "#17231c") : "#d1d5db",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.25rem",
                  textAlign: "center",
                  lineHeight: "1.1",
                  transition: "all 0.1s",
                  boxShadow: p ? "0 1px 3px rgba(0,0,0,0.02)" : "none",
                }}
              >
                {p ? (
                  <>
                    <span style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}>
                      {p.nameAr || p.name}
                    </span>
                    <span style={{ fontSize: "0.58rem", color: "#26683a", marginTop: "2px" }}>
                      {p.sellingPrice}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* User + Logout */}
      <div
        style={{
          padding: "1rem 1.25rem",
          borderTop: "1px solid #f3f4f6",
        }}
      >
        {appUser && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.75rem",
              padding: "0.5rem",
              borderRadius: "0.5rem",
              background: "#f8fdf5",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #49a35c, #26683a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "0.75rem",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {appUser.displayName?.charAt(0) || "م"}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#17231c",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {appUser.displayName}
              </div>
              <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>
                {appUser.role === "admin" ? "مدير" : appUser.role === "employee" ? "موظف" : "محاسب"}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={logOut}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #fee2e2",
            background: "#fff5f5",
            color: "#dc2626",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: 500,
            transition: "background 0.15s",
          }}
        >
          <LogOut size={16} />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
