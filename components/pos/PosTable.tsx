"use client";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import type { CartLine } from "@/hooks/usePosCart";

interface Props {
  lines: CartLine[];
  mode: "cash" | "credit";
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}

export default function PosTable({ lines, mode, onQty, onRemove }: Props) {
  const unitPrice = (l: CartLine) => l.sellingPrice;

  return (
    <div style={{ overflow: "auto", flex: 1 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ background: "linear-gradient(135deg,#f1f8ee,#e8f5e2)", textAlign: "right" }}>
            {["#", "المنتج", "الباركود", "السعر", "الكمية", "الإجمالي", ""].map((h, i) => (
              <th key={i} style={{
                padding: "0.6rem 0.75rem", fontWeight: 600, color: "#26683a",
                fontSize: "0.78rem", whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
                امسح باركود منتج أو ابحث عنه لإضافته
              </td>
            </tr>
          ) : lines.map((l, idx) => (
            <tr
              key={l.productId}
              style={{
                borderBottom: "1px solid #f0f9eb",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f8fdf5")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}
            >
              <td style={{ padding: "0.6rem 0.75rem", color: "#9ca3af", width: "32px" }}>{idx + 1}</td>
              <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600, color: "#17231c", maxWidth: "180px" }}>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {l.productName}
                </div>
              </td>
              <td style={{ padding: "0.6rem 0.75rem", fontFamily: "monospace", fontSize: "0.75rem", color: "#6b7280" }}>
                {l.barcode || "—"}
              </td>
              <td style={{ padding: "0.6rem 0.75rem", color: "#26683a", fontWeight: 600 }}>
                {formatCurrency(unitPrice(l))}
              </td>
              <td style={{ padding: "0.6rem 0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <button
                    onClick={() => onQty(l.productId, Math.max(0, Number((l.quantity - 1).toFixed(3))))}
                    style={btnStyle}
                  ><Minus size={11} /></button>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={l.quantity === 0 ? "" : l.quantity}
                    onChange={e => onQty(l.productId, Math.max(0, Number(e.target.value)))}
                    style={{
                      width: "60px", textAlign: "center", border: "1px solid #c5e5b8",
                      borderRadius: "0.375rem", padding: "0.2rem", fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  />
                  <button
                    onClick={() => onQty(l.productId, Number((l.quantity + 1).toFixed(3)))}
                    style={{ ...btnStyle, borderColor: "#49a35c", background: "#f1f8ee", color: "#49a35c" }}
                  ><Plus size={11} /></button>
                </div>
              </td>
              <td style={{ padding: "0.6rem 0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <input
                    type="number"
                    min={0}
                    value={Math.round(unitPrice(l) * l.quantity) || ""}
                    onChange={e => {
                      const val = Number(e.target.value) || 0;
                      const price = unitPrice(l);
                      if (price > 0) {
                        const calcQty = Number((val / price).toFixed(3));
                        onQty(l.productId, calcQty);
                      }
                    }}
                    placeholder="0"
                    style={{
                      width: "85px", border: "1px solid #c5e5b8",
                      borderRadius: "0.375rem", padding: "0.2rem 0.4rem", fontSize: "0.85rem",
                      fontWeight: 700, color: "#26683a", textAlign: "center"
                    }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>د.ج</span>
                </div>
              </td>
              <td style={{ padding: "0.6rem 0.5rem" }}>
                <button
                  onClick={() => onRemove(l.productId)}
                  title="حذف"
                  style={{
                    background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "0.375rem",
                    padding: "0.3rem 0.5rem", cursor: "pointer", color: "#dc2626",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => ((e.target as HTMLElement).style.background = "#dc2626", (e.target as HTMLElement).style.color = "white")}
                  onMouseLeave={e => ((e.target as HTMLElement).style.background = "#fef2f2", (e.target as HTMLElement).style.color = "#dc2626")}
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: "24px", height: "24px", borderRadius: "50%", border: "1px solid #e5e7eb",
  background: "white", cursor: "pointer", display: "flex",
  alignItems: "center", justifyContent: "center", flexShrink: 0,
};
