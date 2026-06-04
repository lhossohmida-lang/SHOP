"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  CreditCard,
  BarChart3,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/pos", label: "البيع", icon: ShoppingCart },
  { href: "/inventory", label: "المخزون", icon: Boxes },
  { href: "/credits", label: "الديون", icon: CreditCard },
  { href: "/reports", label: "التقارير", icon: BarChart3 },
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
        height: "64px",
        background: "white",
        borderTop: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        boxShadow: "0 -4px 20px rgba(23,35,28,0.08)",
        zIndex: 40,
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
              gap: "2px",
              padding: "0.375rem 0.75rem",
              borderRadius: "0.5rem",
              textDecoration: "none",
              color: isActive ? "#49a35c" : "#9ca3af",
              transition: "color 0.15s",
            }}
          >
            <Icon size={22} />
            <span style={{ fontSize: "0.65rem", fontWeight: isActive ? 600 : 400 }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
