"use client";
import { useState, useCallback } from "react";
import { PRODUCT_CATEGORIES } from "@/types/product";
import type { ProductFormData, Product } from "@/types/product";
import { formatCurrency } from "@/lib/utils/currency";
import BarcodeScanner from "@/components/pos/BarcodeScanner";
import { Camera, X } from "lucide-react";

// IMPORTANT: defined at MODULE level — never inside a component function
// Defining components inside render functions causes React to remount them
// on every render, losing input focus after each keystroke.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

interface ProductFormProps {
  initial?: Product | null;
  onSave: (data: ProductFormData) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

export function ProductForm({ initial, onSave, onClose, saving }: ProductFormProps) {
  const [nameAr, setNameAr] = useState(initial?.nameAr ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [category, setCategory] = useState(initial?.category ?? "مواد غذائية");
  const [purchasePrice, setPurchasePrice] = useState<number | "">(initial?.purchasePrice ?? "");
  const [sellingPrice, setSellingPrice] = useState<number | "">(initial?.sellingPrice ?? "");
  const [stock, setStock] = useState<number | "">(initial?.stock ?? "");


  const pp = Number(purchasePrice) || 0;
  const sp = Number(sellingPrice) || 0;
  const margin = sp > 0 && pp > 0 ? (((sp - pp) / sp) * 100).toFixed(1) : null;

  return (
    <>
      {showCamera && (
        <BarcodeScanner onScan={handleBarcodeScanned} onClose={() => setShowCamera(false)} />
      )}

      <div className="modal-overlay" onClick={onClose}>
        <div
          className="card animate-slide-up"
          style={{ width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <h2 style={{ fontWeight: 700 }}>{initial ? "تعديل منتج" : "منتج جديد"}</h2>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <Field label="الاسم (عربي) *">
              <input
                className="input-field"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="اسم المنتج بالعربية"
                autoComplete="off"
              />
            </Field>

            <Field label="الاسم (فرنسي/إنجليزي)">
              <input
                className="input-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nom du produit"
                dir="ltr"
                style={{ textAlign: "left" }}
                autoComplete="off"
              />
            </Field>

            <Field label="الباركود / QR">
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  className="input-field"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="اكتب أو امسح..."
                  dir="ltr"
                  style={{ textAlign: "left", flex: 1 }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  title="مسح بالكاميرا"
                  style={{
                    padding: "0 0.75rem", borderRadius: "0.5rem",
                    border: "1px solid #c5e5b8", background: "#f1f8ee",
                    cursor: "pointer", color: "#49a35c",
                    display: "flex", alignItems: "center",
                  }}
                >
                  <Camera size={18} />
                </button>
              </div>
            </Field>

            <Field label="الفئة">
              <select
                className="input-field"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>

            <Field label="سعر الشراء (د.ج)">
              <input
                type="number" min="0" step="1"
                className="input-field"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="0"
                dir="ltr" style={{ textAlign: "left" }}
              />
            </Field>

            <Field label={`سعر البيع (د.ج)${margin ? ` — هامش ${margin}%` : ""}`}>
              <input
                type="number" min="0" step="1"
                className="input-field"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="0"
                dir="ltr" style={{ textAlign: "left" }}
              />
            </Field>

            <Field label="الكمية الحالية">
              <input
                type="number" min="0"
                className="input-field"
                value={stock}
                onChange={(e) => setStock(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="0"
                dir="ltr" style={{ textAlign: "left" }}
              />
            </Field>

            <Field label="حد التنبيه (نفاد)">
              <input
                type="number" min="0"
                className="input-field"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="5"
                dir="ltr" style={{ textAlign: "left" }}
              />
            </Field>

            <Field label="وحدة القياس">
              <select
                className="input-field"
                value={unit}
                onChange={(e) => setUnit(e.target.value as ProductFormData["unit"])}
              >
                {["pcs", "kg", "g", "l", "ml", "box"].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </Field>

            <Field label="الحالة">
              <select
                className="input-field"
                value={isActive ? "1" : "0"}
                onChange={(e) => setIsActive(e.target.value === "1")}
              >
                <option value="1">نشط</option>
                <option value="0">معطل</option>
              </select>
            </Field>
          </div>

          {margin && (
            <div style={{
              marginTop: "0.75rem", padding: "0.625rem 0.875rem",
              background: "#f8fdf5", borderRadius: "0.5rem",
              display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "#26683a",
            }}>
              <span>هامش الربح: <strong>{formatCurrency(sp - pp)}</strong></span>
              <span style={{ color: Number(margin) < 10 ? "#f97316" : "#26683a" }}>
                النسبة: <strong>{margin}%</strong>
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button onClick={onClose} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>
              إلغاء
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !nameAr.trim()}
              className="btn-primary"
              style={{ flex: 2, justifyContent: "center" }}
            >
              {saving ? "جارٍ الحفظ..." : initial ? "حفظ التعديلات" : "إضافة المنتج"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
