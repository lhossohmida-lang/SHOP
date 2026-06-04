"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#f1f8ee" }}>
      <div className="text-center">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "linear-gradient(135deg, #49a35c, #26683a)" }}
        >
          <span className="text-3xl">🛒</span>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: "#26683a" }}>
          Blgasm POS
        </h1>
        <p className="text-sm mt-1" style={{ color: "#49a35c" }}>جارٍ التحميل…</p>
      </div>
    </div>
  );
}
