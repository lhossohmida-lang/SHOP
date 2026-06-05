"use client";
import { useState } from "react";
import { formatCurrency } from "@/lib/utils/currency";
import { Tag, Percent } from "lucide-react";

interface Props {
  mode: "cash" | "credit";
  subtotal: number;
  total: number;
  discount: number;
  discountValue: number;
  discountPct: number;
  itemCount: number;
  onDiscountValue: (v: number) => void;
  onDiscountPct: (v: number) => void;
  onClear: () => void;
  onConfirm: () => void;
  loading: boolean;
  disabled: boolean;
}

export default function PosSummary({
  mode, subtotal, total, discount, discountValue, discountPct,
  itemCount, onDiscountValue, onDiscountPct, onClear, onConfirm, loading, disabled
}: Props) {
  const [paid, setPaid] = useState<number | "">(0);
  const remaining = typeof paid === "number" ? Math.max(0, total - paid) : total;
  const change = typeof paid === "number" ? Math.max(0, paid - total) : 0;

  const isCash = mode === "cash";

  return (
    <div
      className="w-full lg:w-[280px]"
      style={{
        flexShrink: 0, background: "white",
        borderRadius: "1rem", boxShadow: "0 4px 20px rgba(23,35,28,0.07)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "1rem 1.25rem",
        background: isCash
          ? "linear-gradient(135deg,#26683a,#49a35c)"
          : "linear-gradient(135deg,#92400e,#ca8a04)",
        color: "white",
      }}>
        <div style={{ fontSize: "0.78rem", opacity: 0.85, marginBottom: "0.25rem" }}>
          {isCash ? "💵 بيع نقدي (سعر الشراء)" : "📋 بيع كريدي (سعر البيع)"}
        </div>
        <div style={{ fontSize: "1.75rem", fontWeight: 800 }}>{formatCurrency(total)}</div>
        <div style={{ fontSize: "0.78rem", opacity: 0.75, marginTop: "0.2rem" }}>
          {itemCount} صنف
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
        {/* Rows */}
        {[
          { label: "المجموع الفرعي", value: formatCurrency(subtotal) },
          { label: "عدد المنتجات", value: `${itemCount} صنف` },
        ].map(r => (
          <div key={r.label} style={{
            display: "flex", justifyContent: "space-between",
            padding: "0.4rem 0", fontSize: "0.82rem",
            borderBottom: "1px dashed #f0f0f0", color: "#4b5563",
          }}>
            <span>{r.label}</span>
            <span style={{ fontWeight: 600 }}>{r.value}</span>
          </div>
        ))}

        {/* Discount by value */}
        <div style={{ marginTop: "0.75rem", marginBottom: "0.5rem" }}>
          <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <Tag size={12} /> خصم بالقيمة (د.ج)
          </div>
          <input
            type="number" min={0}
            value={discountValue || ""}
            onChange={e => { onDiscountValue(Number(e.target.value) || 0); onDiscountPct(0); }}
            placeholder="0"
            style={{
              width: "100%", border: "1px solid #e5e7eb", borderRadius: "0.5rem",
              padding: "0.4rem 0.6rem", fontSize: "0.85rem", direction: "ltr", textAlign: "left",
            }}
          />
        </div>

        {/* Discount by % */}
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <Percent size={12} /> خصم بالنسبة (%)
          </div>
          <input
            type="number" min={0} max={100}
            value={discountPct || ""}
            onChange={e => { onDiscountPct(Number(e.target.value) || 0); onDiscountValue(0); }}
            placeholder="0"
            style={{
              width: "100%", border: "1px solid #e5e7eb", borderRadius: "0.5rem",
              padding: "0.4rem 0.6rem", fontSize: "0.85rem", direction: "ltr", textAlign: "left",
            }}
          />
        </div>

        {discount > 0 && (
          <div style={{
            display: "flex", justifyContent: "space-between",
            padding: "0.4rem 0.6rem", background: "#fef2f2", borderRadius: "0.5rem",
            color: "#dc2626", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem",
          }}>
            <span>الخصم المطبق</span>
            <span>- {formatCurrency(discount)}</span>
          </div>
        )}

        {/* Amount paid (only for cash mode) */}
        {isCash && (
          <>
            <div style={{ marginBottom: "0.5rem" }}>
              <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.35rem" }}>المبلغ المدفوع</div>
              <input
                type="number" min={0}
                value={paid}
                onChange={e => setPaid(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder={String(total)}
                style={{
                  width: "100%", border: "1px solid #c5e5b8", borderRadius: "0.5rem",
                  padding: "0.4rem 0.6rem", fontSize: "0.9rem", fontWeight: 700,
                  direction: "ltr", textAlign: "left",
                }}
              />
            </div>
            {typeof paid === "number" && paid > 0 && (
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div style={{
                  flex: 1, padding: "0.4rem", borderRadius: "0.5rem", textAlign: "center",
                  background: remaining > 0 ? "#fef9c3" : "#f0fdf4",
                  color: remaining > 0 ? "#92400e" : "#166534", fontSize: "0.78rem"
                }}>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{formatCurrency(remaining)}</div>
                  <div>المتبقي</div>
                </div>
                {change > 0 && (
                  <div style={{
                    flex: 1, padding: "0.4rem", borderRadius: "0.5rem", textAlign: "center",
                    background: "#f0fdf4", color: "#166534", fontSize: "0.78rem"
                  }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{formatCurrency(change)}</div>
                    <div>الباقي</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "0.875rem", borderTop: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <button
          onClick={onConfirm}
          disabled={disabled || loading}
          style={{
            padding: "0.75rem", borderRadius: "0.625rem", border: "none",
            background: disabled ? "#e5e7eb" : isCash ? "#26683a" : "#ca8a04",
            color: disabled ? "#9ca3af" : "white",
            fontWeight: 700, fontSize: "0.9rem", cursor: disabled ? "not-allowed" : "pointer",
            transition: "opacity 0.15s",
          }}
        >
          {loading ? "جارٍ الحفظ..." : isCash ? "✅ تأكيد الدفع" : "✅ تأكيد الكريدي"}
        </button>
        <button
          onClick={onClear}
          disabled={disabled}
          style={{
            padding: "0.5rem", borderRadius: "0.5rem", border: "1px solid #fca5a5",
            background: "#fef2f2", color: "#dc2626", fontWeight: 500,
            fontSize: "0.82rem", cursor: "pointer",
          }}
        >
          🗑 مسح الفاتورة
        </button>
      </div>
    </div>
  );
}
