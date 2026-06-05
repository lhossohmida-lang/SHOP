"use client";
import { useState, useEffect } from "react";
import { Lock, Eye, EyeOff, ShieldAlert } from "lucide-react";

interface PasswordGateProps {
  children: React.ReactNode;
}

export default function PasswordGate({ children }: PasswordGateProps) {
  const [isUnlocked, setIsUnlocked] = useState(
    process.env.NEXT_PUBLIC_AUTO_UNLOCK === "1"
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "111234") {
      setIsUnlocked(true);
      setError(false);
    } else {
      setError(true);
      setPassword("");
    }
  };

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "65vh",
      padding: "2rem",
    }}>
      <div style={{
        background: "white",
        borderRadius: "1.25rem",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
        border: "1px solid #e5e7eb",
        padding: "2.5rem 2rem",
        width: "100%",
        maxWidth: "400px",
        textAlign: "center",
        animation: "fadeIn 0.3s ease",
      }}>
        <div style={{
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          background: error ? "#fff5f5" : "#f1f8ee",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 1.5rem",
          color: error ? "#dc2626" : "#49a35c",
          transition: "all 0.2s"
        }}>
          {error ? <ShieldAlert size={28} /> : <Lock size={28} />}
        </div>

        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111827", marginBottom: "0.5rem" }}>
          منطقة محمية بكلمة مرور
        </h2>
        <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1.75rem" }}>
          يرجى إدخال رمز المرور للوصول إلى لوحة التحكم والتقارير
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                if (error) setError(false);
              }}
              placeholder="••••••"
              autoFocus
              style={{
                width: "100%",
                padding: "0.75rem 1rem 0.75rem 2.5rem",
                borderRadius: "0.5rem",
                border: error ? "1px solid #dc2626" : "1px solid #d1d5db",
                outline: "none",
                fontSize: "1.1rem",
                textAlign: "center",
                letterSpacing: password ? "0.25em" : "normal",
                transition: "border-color 0.15s",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "#9ca3af",
                cursor: "pointer",
                padding: "0.25rem",
                display: "flex",
                alignItems: "center",
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <div style={{ fontSize: "0.8rem", color: "#dc2626", fontWeight: 600 }}>
              رمز المرور غير صحيح، يرجى المحاولة مرة أخرى!
            </div>
          )}

          <button
            type="submit"
            style={{
              background: "linear-gradient(135deg, #49a35c, #26683a)",
              color: "white",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              border: "none",
              fontWeight: 700,
              fontSize: "0.95rem",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(73, 163, 92, 0.2)",
              transition: "transform 0.1s, opacity 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = "0.95";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            تأكيد الدخول
          </button>
        </form>
      </div>
    </div>
  );
}
