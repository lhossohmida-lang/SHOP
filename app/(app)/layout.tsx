"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/layout/Sidebar";
import BottomNav from "@/components/layout/BottomNav";
import TopBar from "@/components/layout/TopBar";
import { Loader2 } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { appUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !appUser) {
      router.replace("/login");
    }
  }, [appUser, loading, router]);

  // شبكة أمان: صنف ماسح الباركود يخفي التطبيق بالكامل (visibility:hidden) لإظهار
  // كاميرا أندرويد خلفه. إن بقي عالقاً يبدو التطبيق متجمّداً ولا يمكن الكتابة.
  // أزِله عند كل تنقّل، وعند عودة التطبيق للواجهة (تصغير ثم فتح) حتى يتعافى تلقائياً.
  // التقييد على "visible" يتجنّب إزالته أثناء مسح كاميرا نشط فعلاً.
  useEffect(() => {
    document.body.classList.remove("barcode-scanner-active");
    const onVis = () => {
      if (document.visibilityState === "visible") {
        document.body.classList.remove("barcode-scanner-active");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f1f8ee" }}>
        <div className="text-center">
          <Loader2 size={40} className="animate-spin mx-auto mb-3" style={{ color: "#49a35c" }} />
          <p style={{ color: "#49a35c" }}>جارٍ التحميل…</p>
        </div>
      </div>
    );
  }

  if (!appUser) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fdf5" }}>
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <TopBar />
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem",
            paddingBottom: "5rem", // space for mobile bottom nav
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
