"use client";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { updateProduct } from "@/lib/firestore/products";
import { getPosShortcuts, savePosShortcuts } from "@/lib/firestore/shortcuts";
import { offlineAwareAwait } from "@/lib/firestore/helpers";
import { formatCurrency } from "@/lib/utils/currency";
import { productMatchesBarcodeSearch, normalizeScannedDigits, normalizeBarcodeInput } from "@/lib/utils/barcode";
import { Search, AlertTriangle, Edit2, Zap, X, Check, Printer, Plus, Layers } from "lucide-react";
import QuickEditPanel from "@/components/products/QuickEditPanel";
import Toast from "@/components/ui/Toast";
import type { Product } from "@/types/product";

type StockModal = "out" | "low" | "expiry" | null;

// المنتجات تُعتبر "قريبة من انتهاء الصلاحية" إذا بقي على انتهائها 30 يوماً أو أقل (يشمل المنتهية).
const EXPIRY_SOON_DAYS = 30;

function daysUntilExpiry(dateStr?: string): number | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr);
  if (isNaN(exp.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - today.getTime()) / 86400000);
}

function expiryInfo(dateStr?: string): { label: string; color: string } {
  const d = daysUntilExpiry(dateStr);
  if (d === null) return { label: "—", color: "#6b7280" };
  if (d < 0) return { label: `منتهية منذ ${Math.abs(d)} يوم`, color: "#dc2626" };
  if (d === 0) return { label: "تنتهي اليوم", color: "#dc2626" };
  return { label: `${d} يوم متبقّي`, color: d <= 7 ? "#dc2626" : "#d97706" };
}

// حجم خط رقم البطاقة حسب طوله حتى لا يتجاوز حدود البطاقة (الأرقام الكبيرة تصغر).
function statFontSize(v: string | number): string {
  const len = String(v).length;
  if (len <= 6) return "1.5rem";
  if (len <= 9) return "1.3rem";
  if (len <= 13) return "1.1rem";
  if (len <= 17) return "0.95rem";
  return "0.82rem";
}

export default function InventoryPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { products, loading } = useProducts(storeId);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("الكل");
  const [stockFilter, setStockFilter] = useState("الكل");
  const [editingStock, setEditingStock] = useState<string | null>(null);
  const [newStock, setNewStock] = useState<number>(0);
  // لوحة "منتجات محدّدة للتعديل"
  const [editIds, setEditIds] = useState<string[]>([]);
  const [showEditDropdown, setShowEditDropdown] = useState(false);
  // لوحة البحث المتعدد
  const [showMultiSearch, setShowMultiSearch] = useState(false);
  const [multiSearchQuery, setMultiSearchQuery] = useState("");
  const [msg, setMsg] = useState("");
  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  // Stock modal (out / low)
  const [stockModal, setStockModal] = useState<StockModal>(null);
  const [modalEditingId, setModalEditingId] = useState<string | null>(null);
  const [modalNewStock, setModalNewStock] = useState<number>(0);

  // Shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [slots, setSlots] = useState<(string | null)[]>(Array(18).fill(null));
  const [savingShortcuts, setSavingShortcuts] = useState(false);
  const [shortcutSearch, setShortcutSearch] = useState("");
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  const categories = ["الكل", ...Array.from(new Set(products.map(p => p.category)))];

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.nameAr.includes(search) || productMatchesBarcodeSearch(p, search);
    const matchCat = category === "الكل" || p.category === category;
    const matchStock = stockFilter === "الكل" || (stockFilter === "نفد" && p.stock === 0) || (stockFilter === "قليل" && p.stock > 0 && p.stock <= p.minStock) || (stockFilter === "متوفر" && p.stock > p.minStock);
    return matchSearch && matchCat && matchStock;
  });

  // لوحة التعديل السريع: المنتجات المحدَّدة + إضافة/إزالة + حفظ السعر والمخزون.
  const editProducts = useMemo(
    () => editIds.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p),
    [editIds, products]
  );
  const toggleEdit = (id: string) =>
    setEditIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const handleQuickSave = async (id: string, data: { sellingPrice: number; purchasePrice?: number; stock: number }) => {
    if (!storeId) return;
    // في المخزون نحفظ المخزون فقط
    await offlineAwareAwait(updateProduct(storeId, id, { stock: data.stock }));
  };

  const totalValue = products.reduce((s, p) => s + p.stock * p.purchasePrice, 0);
  const outOfStock = products.filter(p => p.stock === 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= p.minStock);
  const nearExpiry = products
    .filter(p => {
      const d = daysUntilExpiry(p.expiryDate);
      return d !== null && d <= EXPIRY_SOON_DAYS;
    })
    .sort((a, b) => daysUntilExpiry(a.expiryDate)! - daysUntilExpiry(b.expiryDate)!);

  const saveStock = async (p: Product) => {
    if (!storeId) return;
    await offlineAwareAwait(updateProduct(storeId, p.id, { stock: newStock }));
    setEditingStock(null);
  };

  const saveModalStock = async (p: Product) => {
    if (!storeId) return;
    await offlineAwareAwait(updateProduct(storeId, p.id, { stock: modalNewStock }));
    setModalEditingId(null);
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
      showMsg("⚠️ حدث خطأ أثناء حفظ الاختصارات");
    } finally {
      setSavingShortcuts(false);
    }
  };

  const shortcutFilteredProducts = products.filter(p => {
    if (!shortcutSearch.trim()) return true;
    return p.nameAr.includes(shortcutSearch) || p.name.toLowerCase().includes(shortcutSearch.toLowerCase());
  }).slice(0, 30);

  // Print stock list
  const handlePrintStockList = (type: StockModal) => {
    const list = type === "out" ? outOfStock : type === "low" ? lowStock : type === "expiry" ? nearExpiry : [];
    const title = type === "out" ? "قائمة المنتجات النافدة من المخزون"
      : type === "low" ? "قائمة المنتجات ذات المخزون القليل"
      : "قائمة المنتجات قريبة انتهاء الصلاحية";
    const isExpiry = type === "expiry";
    const fifthHeader = isExpiry ? "تاريخ الانتهاء" : "الحد الأدنى";
    const rows = list.map(p => `
      <tr>
        <td>${p.nameAr || p.name}</td>
        <td>${p.barcode || "—"}</td>
        <td>${p.category}</td>
        <td>${p.stock} ${p.unit}</td>
        <td>${isExpiry ? `${p.expiryDate || "—"} (${expiryInfo(p.expiryDate).label})` : `${p.minStock} ${p.unit}`}</td>
        <td>${formatCurrency(p.purchasePrice)}</td>
      </tr>
    `).join("");
    const html = `
      <html dir="rtl"><head><meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; padding: 20px; }
        h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
        p.sub { text-align: center; color: #666; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f1f8ee; padding: 8px; text-align: right; border: 1px solid #c5e5b8; font-size: 12px; }
        td { padding: 7px 8px; border: 1px solid #e5e7eb; font-size: 12px; }
        tr:nth-child(even) { background: #f9fafb; }
        #print-back-btn {
          position: fixed; top: 10px; left: 10px; z-index: 9999;
          padding: 8px 18px; background: #26683a; color: white;
          border: none; border-radius: 8px; font-size: 14px;
          font-family: Arial, sans-serif; cursor: pointer; font-weight: bold;
        }
        @media print { body { padding: 0; } #print-back-btn { display: none !important; } }
      </style>
      </head><body>
      <button id="print-back-btn" onclick="try{window.close();}catch(e){history.back();}">&#x2190; رجوع</button>
      <h1>${title}</h1>
      <p class="sub">تاريخ الطباعة: ${new Date().toLocaleDateString("ar-DZ")} — الإجمالي: ${list.length} منتج</p>
      <table>
        <thead><tr><th>المنتج</th><th>الباركود</th><th>الفئة</th><th>المخزون الحالي</th><th>${fifthHeader}</th><th>سعر الشراء</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>
        window.onload = function() {
          window.focus();
          window.onafterprint = function() { try { window.close(); } catch(e) {} };
          setTimeout(function() {
            window.print();
            setTimeout(function() { try { window.close(); } catch(e) {} }, 2000);
          }, 200);
        };
      </script>
      </body></html>
    `;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  };

  const modalProducts = stockModal === "out" ? outOfStock : stockModal === "low" ? lowStock : stockModal === "expiry" ? nearExpiry : [];
  const modalTitle = stockModal === "out" ? "🔴 المنتجات النافدة من المخزون" : stockModal === "low" ? "🟠 المنتجات ذات المخزون القليل" : "🔵 منتجات قريبة من انتهاء الصلاحية";
  const modalColor = stockModal === "out" ? "#dc2626" : stockModal === "low" ? "#f97316" : "#3b82f6";
  const modalBg = stockModal === "out" ? "#fff5f5" : stockModal === "low" ? "#fff7ed" : "#eff6ff";

  return (
    <div className="animate-fade-in">
      <Toast message={msg} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>إدارة المخزون</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>مراقبة وتحديث مستويات المخزون</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => { setShowMultiSearch((v) => !v); setMultiSearchQuery(""); }}
            style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.6rem 1.1rem", borderRadius: "0.625rem",
              background: showMultiSearch ? "#f0fdf4" : "white",
              color: showMultiSearch ? "#26683a" : "#374151",
              border: showMultiSearch ? "1.5px solid #49a35c" : "1.5px solid #e5e7eb",
              cursor: "pointer", fontWeight: 700, fontSize: "0.875rem",
              transition: "all 0.15s",
            }}
          >
            <Layers size={17} /> البحث المتعدد
          </button>
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
      </div>

      {/* Stats — out & low cards are clickable */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {/* Total value */}
        <div className="card-sm" style={{ border: "1px solid #f1f8ee", background: "#f1f8ee" }}>
          <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.25rem" }}>قيمة المخزون</div>
          <div style={{ fontSize: statFontSize(formatCurrency(totalValue)), fontWeight: 700, color: "#49a35c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatCurrency(totalValue)}</div>
        </div>
        {/* Total products */}
        <div className="card-sm" style={{ border: "1px solid #eff6ff", background: "#eff6ff" }}>
          <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.25rem" }}>إجمالي المنتجات</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#3b82f6" }}>{products.length}</div>
        </div>
        {/* Out of stock — CLICKABLE */}
        <button
          onClick={() => setStockModal("out")}
          className="card-sm"
          style={{
            border: "1px solid #fca5a5", background: "#fff5f5", cursor: "pointer",
            textAlign: "right", transition: "all 0.15s", outline: "none",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(220,38,38,0.2)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
          title="انقر لعرض تفاصيل المنتجات النافدة"
        >
          <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span>نفدت من المخزون</span>
            <span style={{ fontSize: "0.65rem", color: "#dc2626", fontWeight: 600 }}>↗ عرض</span>
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#dc2626" }}>{outOfStock.length}</div>
        </button>
        {/* Low stock — CLICKABLE */}
        <button
          onClick={() => setStockModal("low")}
          className="card-sm"
          style={{
            border: "1px solid #fdba74", background: "#fff7ed", cursor: "pointer",
            textAlign: "right", transition: "all 0.15s", outline: "none",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(249,115,22,0.2)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
          title="انقر لعرض تفاصيل المنتجات ذات المخزون القليل"
        >
          <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span>مخزون قليل</span>
            <span style={{ fontSize: "0.65rem", color: "#f97316", fontWeight: 600 }}>↗ عرض</span>
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f97316" }}>{lowStock.length}</div>
        </button>
        {/* Near expiry — CLICKABLE (blue) */}
        <button
          onClick={() => setStockModal("expiry")}
          className="card-sm"
          style={{
            border: "1px solid #93c5fd", background: "#eff6ff", cursor: "pointer",
            textAlign: "right", transition: "all 0.15s", outline: "none",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(59,130,246,0.2)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
          title="انقر لعرض المنتجات قريبة انتهاء الصلاحية"
        >
          <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span>قرب انتهاء الصلاحية</span>
            <span style={{ fontSize: "0.65rem", color: "#3b82f6", fontWeight: 600 }}>↗ عرض</span>
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#3b82f6" }}>{nearExpiry.length}</div>
        </button>
      </div>

      {showMultiSearch && (() => {
        const q = multiSearchQuery.trim();
        const multiResults = products.filter((p) =>
          !q ||
          p.nameAr.includes(q) ||
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          productMatchesBarcodeSearch(p, q)
        ).slice(0, 15);
        return (
          <div style={{
            border: "1px solid #c5e5b8", borderRadius: "0.75rem", background: "white",
            marginBottom: "1rem", overflow: "hidden", boxShadow: "0 4px 16px rgba(38,104,58,0.12)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.6rem 0.85rem", background: "#f1f8ee", borderBottom: "1px solid #e5efe0",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#26683a", fontWeight: 700, fontSize: "0.85rem" }}>
                <Layers size={15} /> البحث المتعدد — ابحث وأضف منتجات لتعديل كميتها
              </div>
              <button
                onClick={() => { setShowMultiSearch(false); setMultiSearchQuery(""); }}
                style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", display: "flex", alignItems: "center" }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "0.75rem" }}>
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                <input
                  autoFocus
                  className="input-field"
                  style={{ paddingRight: "2.25rem" }}
                  placeholder="ابحث عن منتج بالاسم أو الباركود..."
                  value={multiSearchQuery}
                  onChange={(e) => setMultiSearchQuery(normalizeBarcodeInput(e.target.value))}
                  autoComplete="off"
                />
              </div>
              {multiResults.length > 0 && (
                <div style={{ marginTop: "0.5rem", maxHeight: "280px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "0.5rem" }}>
                  {multiResults.map((p) => {
                    const added = editIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleEdit(p.id)}
                        style={{
                          width: "100%", padding: "0.55rem 0.875rem", background: added ? "#f1f8ee" : "white",
                          border: "none", borderBottom: "1px solid #f3f4f6", textAlign: "right", cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                          <span style={{
                            width: "20px", height: "20px", borderRadius: "5px", flexShrink: 0,
                            border: added ? "none" : "1px solid #c5e5b8", background: added ? "#26683a" : "white",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {added ? <Check size={13} color="white" /> : <Plus size={13} color="#49a35c" />}
                          </span>
                          <span style={{ fontWeight: 600, color: "#17231c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {p.nameAr || p.name}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "#9ca3af", flexShrink: 0 }}>{p.category}</span>
                        </div>
                        <span style={{ color: "#26683a", fontWeight: 700, whiteSpace: "nowrap" }}>
                          مخزون: {p.stock} {p.unit}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {q && multiResults.length === 0 && (
                <div style={{ textAlign: "center", padding: "1rem", color: "#9ca3af", fontSize: "0.85rem" }}>لا توجد نتائج</div>
              )}
              {editIds.length > 0 && (
                <button
                  onClick={() => { setShowMultiSearch(false); setMultiSearchQuery(""); }}
                  style={{
                    marginTop: "0.65rem", width: "100%",
                    padding: "0.6rem 1rem", borderRadius: "0.625rem", border: "none",
                    background: "#26683a", color: "white", cursor: "pointer",
                    fontWeight: 700, fontSize: "0.9rem", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: "0.4rem",
                  }}
                >
                  <Check size={16} /> تأكيد — تعديل كمية {editIds.length} منتج
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <Search size={16} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input
            className="input-field" style={{ paddingRight: "2.25rem" }} placeholder="بحث، ثم انقر منتجاً لإضافته للوحة التعديل..."
            value={search}
            onFocus={() => setShowEditDropdown(true)}
            onBlur={() => setTimeout(() => setShowEditDropdown(false), 150)}
            onChange={e => { setSearch(normalizeBarcodeInput(e.target.value)); setShowEditDropdown(true); }}
          />
          {search.trim() && showEditDropdown && filtered.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", right: 0, left: 0, zIndex: 50,
              background: "white", border: "1px solid #e5e7eb", borderRadius: "0.625rem",
              boxShadow: "0 8px 24px rgba(0,0,0,0.1)", marginTop: "4px", maxHeight: "260px", overflowY: "auto",
            }}>
              {filtered.slice(0, 10).map((p) => {
                const added = editIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onMouseDown={(e) => { e.preventDefault(); toggleEdit(p.id); }}
                    style={{
                      width: "100%", padding: "0.55rem 0.875rem", background: added ? "#f1f8ee" : "none",
                      border: "none", borderBottom: "1px solid #f3f4f6", textAlign: "right", cursor: "pointer",
                      display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                      <span style={{
                        width: "20px", height: "20px", borderRadius: "5px", flexShrink: 0,
                        border: added ? "none" : "1px solid #c5e5b8", background: added ? "#26683a" : "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{added ? <Check size={13} color="white" /> : <Plus size={13} color="#49a35c" />}</span>
                      <span style={{ fontWeight: 600, color: "#17231c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nameAr || p.name}</span>
                    </div>
                    <span style={{ color: "#26683a", fontWeight: 700, whiteSpace: "nowrap" }}>{p.stock} {p.unit}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <select className="input-field" style={{ flex: "0 0 160px" }} value={category} onChange={e => setCategory(e.target.value)}>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="input-field" style={{ flex: "0 0 140px" }} value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
          {["الكل", "متوفر", "قليل", "نفد"].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <QuickEditPanel
        products={editProducts}
        onRemove={(id) => setEditIds((prev) => prev.filter((x) => x !== id))}
        onClear={() => setEditIds([])}
        onSave={handleQuickSave}
        mode="stock"
      />

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

      {/* ─── Stock Detail Modal (out / low) ─── */}
      {stockModal && (
        <div className="modal-overlay" onClick={() => { setStockModal(null); setModalEditingId(null); }}>
          <div
            className="card animate-slide-up"
            style={{ width: "100%", maxWidth: "780px", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexShrink: 0 }}>
              <div>
                <h2 style={{ fontWeight: 700, fontSize: "1.1rem", color: modalColor }}>{modalTitle}</h2>
                <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.25rem" }}>
                  الإجمالي: <strong>{modalProducts.length}</strong> منتج
                  {stockModal === "low" && " — المخزون أقل من أو يساوي الحد الأدنى"}
                  {stockModal === "expiry" && ` — تنتهي صلاحيتها خلال ${EXPIRY_SOON_DAYS} يوماً أو أقل`}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => handlePrintStockList(stockModal)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.4rem",
                    padding: "0.45rem 0.9rem", borderRadius: "0.5rem",
                    background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                    color: "white", border: "none", cursor: "pointer",
                    fontWeight: 600, fontSize: "0.8rem",
                  }}
                >
                  <Printer size={15} /> طباعة القائمة
                </button>
                <button onClick={() => { setStockModal(null); setModalEditingId(null); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Products list */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {modalProducts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
                  {stockModal === "out" ? "🎉 لا توجد منتجات نافدة!" : "🎉 لا توجد منتجات بمخزون قليل!"}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: modalBg, position: "sticky", top: 0 }}>
                      <th style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontWeight: 600, color: modalColor, fontSize: "0.78rem" }}>المنتج</th>
                      <th style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontWeight: 600, color: modalColor, fontSize: "0.78rem" }}>الفئة</th>
                      <th style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontWeight: 600, color: modalColor, fontSize: "0.78rem" }}>المخزون</th>
                      <th style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontWeight: 600, color: modalColor, fontSize: "0.78rem" }}>{stockModal === "expiry" ? "تاريخ الانتهاء" : "الحد الأدنى"}</th>
                      <th style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontWeight: 600, color: modalColor, fontSize: "0.78rem" }}>سعر الشراء</th>
                      <th style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontWeight: 600, color: modalColor, fontSize: "0.78rem" }}>تعديل المخزون</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalProducts.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}>
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          <div style={{ fontWeight: 600, color: "#17231c" }}>{p.nameAr || p.name}</div>
                          {p.nameAr && <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>{p.name}</div>}
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem" }}><span className="badge-green">{p.category}</span></td>
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          <span className={p.stock === 0 ? "badge-red" : "badge-orange"}>
                            {p.stock} {p.unit}
                          </span>
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#6b7280" }}>
                          {stockModal === "expiry" ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span style={{ fontWeight: 600, color: expiryInfo(p.expiryDate).color }}>{expiryInfo(p.expiryDate).label}</span>
                              <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>{p.expiryDate || "—"}</span>
                            </div>
                          ) : (
                            `${p.minStock} ${p.unit}`
                          )}
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#6b7280" }}>{formatCurrency(p.purchasePrice)}</td>
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          {modalEditingId === p.id ? (
                            <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                              <input
                                type="number" min="0"
                                value={modalNewStock}
                                onChange={e => setModalNewStock(Number(e.target.value))}
                                autoFocus
                                style={{ width: "75px", border: "1px solid #49a35c", borderRadius: "4px", padding: "3px 6px", fontSize: "0.875rem" }}
                              />
                              <button onClick={() => saveModalStock(p)}
                                style={{ background: "#49a35c", color: "white", border: "none", borderRadius: "4px", padding: "3px 10px", cursor: "pointer", fontSize: "0.8rem" }}>✓</button>
                              <button onClick={() => setModalEditingId(null)}
                                style={{ background: "#e5e7eb", border: "none", borderRadius: "4px", padding: "3px 8px", cursor: "pointer", fontSize: "0.8rem" }}>✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setModalEditingId(p.id); setModalNewStock(p.stock); }}
                              style={{
                                display: "flex", alignItems: "center", gap: "0.3rem",
                                padding: "0.3rem 0.6rem", borderRadius: "0.375rem",
                                border: "1px solid #c5e5b8", background: "#f1f8ee",
                                cursor: "pointer", fontSize: "0.78rem", color: "#26683a", fontWeight: 600,
                              }}
                            >
                              <Edit2 size={12} /> تعديل
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div style={{ paddingTop: "0.75rem", borderTop: "1px solid #f3f4f6", textAlign: "left", flexShrink: 0, marginTop: "0.5rem" }}>
              <button onClick={() => { setStockModal(null); setModalEditingId(null); }} className="btn-secondary">إغلاق</button>
            </div>
          </div>
        </div>
      )}

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
                  <Zap size={20} color="#f59e0b" /> الاختصارات السريعة (3×6)
                </h2>
                <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.25rem" }}>
                  اضغط على خانة لتحديد المنتج المرتبط بها. ستظهر الاختصارات في نقطة البيع.
                </p>
              </div>
              <button onClick={() => setShowShortcuts(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={22} />
              </button>
            </div>

            {/* 3x6 Grid */}
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
                            {formatCurrency(product.sellingPrice)}
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
                      <span style={{ color: "#6b7280", fontWeight: 400 }}>({formatCurrency(p.sellingPrice)})</span>
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
