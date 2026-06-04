"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { updateProduct } from "@/lib/firestore/products";
import { getPosShortcuts, savePosShortcuts } from "@/lib/firestore/shortcuts";
import { formatCurrency } from "@/lib/utils/currency";
import { Search, AlertTriangle, Edit2, Zap, X, Check } from "lucide-react";
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

  // Shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [slots, setSlots] = useState<(string | null)[]>(Array(9).fill(null));
  const [savingShortcuts, setSavingShortcuts] = useState(false);
  const [shortcutSearch, setShortcutSearch] = useState("");
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

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

  // Load shortcuts
  useEffect(() => {
    if (!storeId) return;
    getPosShortcuts(storeId).then(d => setSlots(d.slots));
  }, [storeId]);

  const openShortcuts = () => { setShowShortcuts(true); setActiveSlot(null); setShortcutSearch(""); };

  const handleSlotClick = (idx: number) => {
    setActiveSlot(activeSlot === idx ? null : idx);
    setShortcutSearch("");
  };

  const assignProductToSlot = (productId: string) => {
    if (activeSlot === null) return;
    const next = [...slots];
    next[activeSlot] = productId;
    setSlots(next);
    setActiveSlot(null);
    setShortcutSearch("");
  };

  const clearSlot = (idx: number) => {
    const next = [...slots];
    next[idx] = null;
    setSlots(next);
    if (activeSlot === idx) setActiveSlot(null);
  };

  const handleSaveShortcuts = async () => {
    if (!storeId) return;
    setSavingShortcuts(true);
    try {
      await savePosShortcuts(storeId, slots);
      setShowShortcuts(false);
    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء حفظ الاختصارات: " + e);
    } finally {
      setSavingShortcuts(false);
    }
  };

  const shortcutFilteredProducts = products.filter(p => {
    if (!shortcutSearch.trim()) return true;
    return p.nameAr.includes(shortcutSearch) || p.name.toLowerCase().includes(shortcutSearch.toLowerCase());
  }).slice(0, 30);

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>إدارة المخزون</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>مراقبة وتحديث مستويات المخزون</p>
        </div>
        <button
          onClick={openShortcuts}
          style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            padding: "0.6rem 1.1rem", borderRadius: "0.625rem",
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            color: "white", border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: "0.875rem",
            boxShadow: "0 2px 8px rgba(245,158,11,0.3)",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)")}
          onMouseLeave={e => (e.currentTarget.style.transform = "")}
        >
          <Zap size={17} /> ⚡ الاختصارات
        </button>
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

      {/* Shortcuts Modal */}
      {showShortcuts && (
        <div className="modal-overlay" onClick={() => setShowShortcuts(false)}>
          <div
            className="card animate-slide-up"
            style={{ width: "100%", maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h2 style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Zap size={20} color="#f59e0b" /> الاختصارات السريعة (3×3)
                </h2>
                <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.25rem" }}>
                  اضغط على خانة لتحديد المنتج المرتبط بها. ستظهر الاختصارات في نقطة البيع.
                </p>
              </div>
              <button onClick={() => setShowShortcuts(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={22} />
              </button>
            </div>

            {/* 3x3 Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {slots.map((id, idx) => {
                const product = id ? products.find(p => p.id === id) : null;
                const isActive = activeSlot === idx;
                return (
                  <div key={idx} style={{ position: "relative" }}>
                    <button
                      onClick={() => handleSlotClick(idx)}
                      style={{
                        width: "100%",
                        padding: "1rem 0.75rem",
                        borderRadius: "0.75rem",
                        border: isActive
                          ? "2px solid #f59e0b"
                          : product
                          ? "2px solid #c5e5b8"
                          : "2px dashed #d1d5db",
                        background: isActive ? "#fffbeb" : product ? "#f1f8ee" : "#fafafa",
                        cursor: "pointer",
                        textAlign: "center",
                        transition: "all 0.15s",
                        minHeight: "80px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.25rem",
                      }}
                    >
                      {product ? (
                        <>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#17231c" }}>
                            {product.nameAr || product.name}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "#26683a" }}>
                            {formatCurrency(product.purchasePrice)}
                          </div>
                          <div style={{ fontSize: "0.68rem", color: product.stock === 0 ? "#dc2626" : "#9ca3af" }}>
                            مخزون: {product.stock} {product.unit}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                          {isActive ? "🔍 اختر منتجاً..." : "فارغ"}
                        </div>
                      )}
                    </button>
                    {product && (
                      <button
                        onClick={(e) => { e.stopPropagation(); clearSlot(idx); }}
                        style={{
                          position: "absolute", top: "4px", left: "4px",
                          background: "#dc2626", border: "none", borderRadius: "50%",
                          width: "20px", height: "20px", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", color: "white",
                          fontSize: "0.65rem",
                        }}
                        title="مسح الخانة"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Product picker (appears when a slot is selected) */}
            {activeSlot !== null && (
              <div style={{ border: "1px solid #fde68a", borderRadius: "0.75rem", padding: "1rem", background: "#fffbeb", marginBottom: "1rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#92400e", marginBottom: "0.625rem" }}>
                  اختر منتجاً للخانة رقم {activeSlot + 1}
                </div>
                <div style={{ position: "relative", marginBottom: "0.75rem" }}>
                  <Search size={15} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                  <input
                    className="input-field"
                    style={{ paddingRight: "2.25rem" }}
                    placeholder="ابحث عن منتج..."
                    value={shortcutSearch}
                    onChange={e => setShortcutSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", maxHeight: "180px", overflowY: "auto" }}>
                  {shortcutFilteredProducts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => assignProductToSlot(p.id)}
                      style={{
                        padding: "0.35rem 0.75rem",
                        borderRadius: "0.5rem",
                        border: slots[activeSlot] === p.id ? "2px solid #f59e0b" : "1px solid #c5e5b8",
                        background: slots[activeSlot] === p.id ? "#fef9c3" : "#f1f8ee",
                        cursor: "pointer",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: "#17231c",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      {slots[activeSlot] === p.id && <Check size={12} color="#f59e0b" />}
                      {p.nameAr || p.name}
                      <span style={{ color: "#6b7280", fontWeight: 400 }}>({formatCurrency(p.purchasePrice)})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setShowShortcuts(false)} className="btn-secondary">إلغاء</button>
              <button
                onClick={handleSaveShortcuts}
                disabled={savingShortcuts}
                className="btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Check size={16} />
                {savingShortcuts ? "جارٍ الحفظ..." : "حفظ الاختصارات"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

