"use client";
import { useState } from "react";
import { X, Check, Pencil } from "lucide-react";
import type { Product } from "@/types/product";

interface Props {
  products: Product[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onSave: (id: string, data: { sellingPrice: number; purchasePrice?: number; stock: number }) => Promise<void> | void;
  // "full" = منتجات (سعر بيع + سعر شراء + مخزون)، "stock" = مخزون فقط (المخزون)
  mode?: "full" | "stock";
}

function EditRow({
  p,
  onRemove,
  onSave,
  mode,
}: {
  p: Product;
  onRemove: (id: string) => void;
  onSave: Props["onSave"];
  mode: "full" | "stock";
}) {
  const [price, setPrice] = useState(String(p.sellingPrice));
  const [purchasePrice, setPurchasePrice] = useState(String(p.purchasePrice));
  const [stock, setStock] = useState(String(p.stock));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty =
    (mode === "full"
      ? (Number(price) || 0) !== p.sellingPrice || (Number(purchasePrice) || 0) !== p.purchasePrice
      : false) ||
    (Number(stock) || 0) !== p.stock;

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(p.id, {
        sellingPrice: Number(price) || 0,
        purchasePrice: mode === "full" ? Number(purchasePrice) || 0 : undefined,
        stock: Number(stock) || 0,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", border: "1px solid #c5e5b8", borderRadius: "0.5rem",
    padding: "0.35rem 0.5rem", fontSize: "0.85rem", direction: "ltr", textAlign: "center",
  };

  const cols = mode === "full" ? "1fr 105px 105px 90px auto auto" : "1fr 120px auto auto";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: cols, gap: "0.5rem",
      alignItems: "center", padding: "0.6rem 0.75rem", borderBottom: "1px solid #f3f4f6",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "#17231c", fontSize: "0.85rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {p.nameAr || p.name}
        </div>
        <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>{p.category}</div>
      </div>

      {mode === "full" && (
        <div>
          <label style={{ fontSize: "0.62rem", color: "#6b7280", display: "block", marginBottom: "1px" }}>سعر الشراء</label>
          <input
            type="text" inputMode="decimal" value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            style={inputStyle}
          />
        </div>
      )}

      {mode === "full" && (
        <div>
          <label style={{ fontSize: "0.62rem", color: "#6b7280", display: "block", marginBottom: "1px" }}>سعر البيع</label>
          <input
            type="text" inputMode="decimal" value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            style={inputStyle}
          />
        </div>
      )}

      <div>
        <label style={{ fontSize: "0.62rem", color: "#6b7280", display: "block", marginBottom: "1px" }}>المخزون</label>
        <input
          type="text" inputMode="decimal" value={stock}
          onChange={(e) => setStock(e.target.value.replace(/[^\d.]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          style={inputStyle}
        />
      </div>

      <button
        onClick={save}
        disabled={!dirty || saving}
        title="حفظ التعديل"
        style={{
          padding: "0.4rem 0.7rem", borderRadius: "0.5rem", border: "none",
          background: saved ? "#16a34a" : dirty ? "#26683a" : "#e5e7eb",
          color: saved || dirty ? "white" : "#9ca3af",
          cursor: dirty && !saving ? "pointer" : "default", fontWeight: 600, fontSize: "0.78rem",
          display: "flex", alignItems: "center", gap: "0.25rem", whiteSpace: "nowrap",
        }}
      >
        <Check size={14} /> {saving ? "..." : saved ? "حُفظ" : "حفظ"}
      </button>

      <button
        onClick={() => onRemove(p.id)}
        title="إزالة من اللوحة"
        style={{
          padding: "0.4rem", borderRadius: "0.5rem", border: "1px solid #fca5a5",
          background: "#fef2f2", color: "#dc2626", cursor: "pointer",
          display: "flex", alignItems: "center",
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}

export default function QuickEditPanel({ products, onRemove, onClear, onSave, mode = "full" }: Props) {
  if (products.length === 0) return null;

  return (
    <div style={{
      border: "1px solid #c5e5b8", borderRadius: "0.75rem", background: "white",
      marginBottom: "1rem", overflow: "hidden", boxShadow: "0 2px 10px rgba(38,104,58,0.08)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.6rem 0.85rem", background: "#f1f8ee", borderBottom: "1px solid #e5efe0",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#26683a", fontWeight: 700, fontSize: "0.85rem" }}>
          <Pencil size={15} /> منتجات محدّدة للتعديل ({products.length})
        </div>
        <button
          onClick={onClear}
          style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
        >
          مسح الكل
        </button>
      </div>
      <div>
        {products.map((p) => (
          <EditRow key={p.id} p={p} onRemove={onRemove} onSave={onSave} mode={mode} />
        ))}
      </div>
    </div>
  );
}
