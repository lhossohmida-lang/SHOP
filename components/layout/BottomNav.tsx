"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Package,
  ClipboardList,
  CreditCard,
  BarChart3,
  Sparkles,
  Wallet,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/pos", label: "بيع", icon: ShoppingCart },
  { href: "/inventory", label: "المخزون", icon: Boxes },
  { href: "/products", label: "المنتجات", icon: Package },
  { href: "/purchases", label: "المشتريات", icon: ClipboardList },
  { href: "/credits", label: "كريديتات", icon: CreditCard },
  { href: "/reports", label: "التقارير", icon: BarChart3 },
  { href: "/ai", label: "الذكاء", icon: Sparkles },
  { href: "/cashbox", label: "الصندوق", icon: Wallet },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "66px",
        background: "white",
        borderTop: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "0.25rem",
        overflowX: "auto",
        overflowY: "hidden",
        padding: "0 0.5rem",
        boxShadow: "0 -4px 20px rgba(23,35,28,0.08)",
        zIndex: 40,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "2px",
              flex: "0 0 72px",
              minWidth: "72px",
              height: "56px",
              padding: "0.25rem",
              borderRadius: "0.5rem",
              textDecoration: "none",
              color: isActive ? "#49a35c" : "#9ca3af",
              background: isActive ? "#f1f8ee" : "transparent",
              transition: "color 0.15s, background 0.15s",
            }}
          >
            <Icon size={20} />
            <span style={{ fontSize: "0.65rem", fontWeight: isActive ? 700 : 500, whiteSpace: "nowrap" }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
