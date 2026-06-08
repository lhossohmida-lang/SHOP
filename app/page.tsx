"use client";
import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LOGO_PATH, STORE_NAME } from "@/lib/constants/branding";

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
        <Image
          src={LOGO_PATH}
          alt={STORE_NAME}
          width={80}
          height={80}
          className="mx-auto mb-4"
          style={{ borderRadius: "1rem" }}
        />
        <h1 className="text-2xl font-bold" style={{ color: "#26683a" }}>
          {STORE_NAME}
        </h1>
        <p className="text-sm mt-1" style={{ color: "#49a35c" }}>جارٍ التحميل…</p>
      </div>
    </div>
  );
}
