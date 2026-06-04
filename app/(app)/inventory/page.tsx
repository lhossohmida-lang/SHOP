"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { updateProduct } from "@/lib/firestore/products";
import { formatCurrency } from "@/lib/utils/currency";
import { Search, AlertTriangle, Filter, Edit2 } from "lucide-react";
import type { Product } from "@/types/product";

export default function InventoryPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { products, loading } = useProducts(storeId);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("الكل");
  const [stockFilter, setStockFilter] = useState("الكل");
  const [editingStock, setEditingStock] = useState<string | null>(null);
  const [newStock, setNewStock] = useState<number>(0);

  const categories = ["الكل", ...Array.from(new Set(products.map(p => p.category)))];

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.nameAr.includes(search) || p.barcode.includes(search);
    const matchCat = category === "الكل" || p.category === category;
    const matchStock = stockFilter === "الكل" || (stockFilter === "نفد" && p.stock === 0) || (stockFilter === "قليل" && p.stock > 0 && p.stock <= p.minStock) || (stockFilter === "متوفر" && p.stock > p.minStock);
    return matchSearch && matchCat && matchStock;
  });

  const totalValue = products.reduce((s, p) => s + p.stock * p.purchasePrice, 0);
  const outOfStock = products.filter(p => p.stock === 0).length;
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= p.minStock).length;

  const saveStock = async (p: Product) => {
    if (!storeId) return;
    await updateProduct(storeId, p.id, { stock: newStock });
    setEditingStock(null);
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>إدارة المخزون</h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>مراقبة وتحديث مستويات المخزون</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { label: "قيمة المخزون", value: formatCurrency(totalValue), color: "#49a35c", bg: "#f1f8ee" },
          { label: "إجمالي المنتجات", value: String(products.length), color: "#3b82f6", bg: "#eff6ff" },
          { label: "نفدت من المخزون", value: String(outOfStock), color: "#dc2626", bg: "#fff5f5" },
          { label: "مخزون قليل", value: String(lowStock), color: "#f97316", bg: "#fff7ed" },
        ].map((s, i) => (
          <div key={i} className="card-sm" style={{ border: `1px solid ${s.bg}`, background: s.bg }}>
            <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.25rem" }}>{s.label}</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <Search size={16} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input className="input-field" style={{ paddingRight: "2.25rem" }} placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-field" style={{ flex: "0 0 160px" }} value={category} onChange={e => setCategory(e.target.value)}>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="input-field" style={{ flex: "0 0 140px" }} value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
          {["الكل", "متوفر", "قليل", "نفد"].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>المنتج</th><th>الباركود</th><th>الفئة</th><th>سعر الشراء</th><th>سعر البيع</th><th>المخزون</th><th>الحد الأدنى</th><th>القيمة</th><th>تعديل</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>جارٍ التحميل...</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} style={{ background: p.stock === 0 ? "#fff5f5" : p.stock <= p.minStock ? "#fffbeb" : "white" }}>
                <td>
                  <div style={{ fontWeight: 600 }}>{p.nameAr || p.name}</div>
                  {p.nameAr && <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>{p.name}</div>}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#6b7280" }}>{p.barcode || "—"}</td>
                <td><span className="badge-green">{p.category}</span></td>
                <td style={{ color: "#6b7280" }}>{formatCurrency(p.purchasePrice)}</td>
                <td style={{ fontWeight: 600, color: "#26683a" }}>{formatCurrency(p.sellingPrice)}</td>
                <td>
                  {editingStock === p.id ? (
                    <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                      <input type="number" min="0" value={newStock} onChange={e => setNewStock(Number(e.target.value))}
                        style={{ width: "70px", border: "1px solid #49a35c", borderRadius: "4px", padding: "2px 6px", fontSize: "0.875rem" }} />
                      <button onClick={() => saveStock(p)} style={{ background: "#49a35c", color: "white", border: "none", borderRadius: "4px", padding: "2px 8px", cursor: "pointer", fontSize: "0.8rem" }}>✓</button>
                      <button onClick={() => setEditingStock(null)} style={{ background: "#e5e7eb", border: "none", borderRadius: "4px", padding: "2px 8px", cursor: "pointer", fontSize: "0.8rem" }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      {p.stock === 0 && <AlertTriangle size={14} color="#dc2626" />}
                      <span className={p.stock === 0 ? "badge-red" : p.stock <= p.minStock ? "badge-orange" : "badge-green"}>
                        {p.stock} {p.unit}
                      </span>
                    </div>
                  )}
                </td>
                <td style={{ color: "#6b7280" }}>{p.minStock} {p.unit}</td>
                <td style={{ fontWeight: 600 }}>{formatCurrency(p.stock * p.purchasePrice)}</td>
                <td>
                  <button onClick={() => { setEditingStock(p.id); setNewStock(p.stock); }}
                    className="btn-secondary" style={{ padding: "0.25rem 0.5rem" }}>
                    <Edit2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
