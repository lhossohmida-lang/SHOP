"use client";
import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { LOGO_PATH, STORE_NAME } from "@/lib/constants/branding";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطأ في تسجيل الدخول";
      if (msg.includes("invalid-credential") || msg.includes("wrong-password")) {
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
      } else if (msg.includes("user-not-found")) {
        setError("المستخدم غير موجود");
      } else {
        setError(`حدث خطأ. تحقق من اتصالك بالإنترنت. (${msg})`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #f1f8ee 0%, #dff0d6 50%, #c5e5b8 100%)",
      }}
    >
      {/* Background circles */}
      <div
        className="fixed top-0 right-0 w-96 h-96 rounded-full opacity-20 pointer-events-none"
        style={{ background: "#49a35c", transform: "translate(30%, -30%)", filter: "blur(60px)" }}
      />
      <div
        className="fixed bottom-0 left-0 w-80 h-80 rounded-full opacity-20 pointer-events-none"
        style={{ background: "#26683a", transform: "translate(-30%, 30%)", filter: "blur(60px)" }}
      />

      <div
        className="w-full max-w-md animate-fade-in"
        style={{
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(20px)",
          borderRadius: "1.5rem",
          boxShadow: "0 20px 60px rgba(23,35,28,0.15)",
          padding: "2.5rem",
          border: "1px solid rgba(197,229,184,0.5)",
        }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src={LOGO_PATH}
            alt={STORE_NAME}
            width={80}
            height={80}
            className="mx-auto mb-4"
            style={{ borderRadius: "1rem", boxShadow: "0 8px 24px rgba(73,163,92,0.35)" }}
          />
          <h1 className="text-3xl font-bold" style={{ color: "#17231c" }}>
            {STORE_NAME}
          </h1>
          <p className="text-sm mt-1" style={{ color: "#49a35c" }}>
            نظام نقطة البيع الذكي
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div>
            <label className="label">البريد الإلكتروني</label>
            <input
              id="email"
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@blgasm.com"
              required
              autoComplete="email"
              dir="ltr"
              style={{ textAlign: "left" }}
            />
          </div>

          {/* Password */}
          <div>
            <label className="label">كلمة المرور</label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                dir="ltr"
                style={{ textAlign: "left", paddingLeft: "2.5rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#6b7280",
                  padding: 0,
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: "0.5rem",
                padding: "0.75rem",
                color: "#dc2626",
                fontSize: "0.875rem",
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            id="login-btn"
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "0.75rem", fontSize: "1rem" }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                جارٍ تسجيل الدخول…
              </>
            ) : (
              "تسجيل الدخول"
            )}
          </button>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: "#9ca3af" }}>
          {STORE_NAME} v1.0 • جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
