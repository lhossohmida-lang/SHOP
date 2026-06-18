"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useUsbScanner } from "@/hooks/useUsbScanner";
import { addProduct, updateProduct, deleteProduct } from "@/lib/firestore/products";
import { isOffline, offlineAwareAwait, offlineAwareDelete } from "@/lib/firestore/helpers";
import { formatCurrency } from "@/lib/utils/currency";
import { normalizeDigits, normalizeScannedDigits, productHasBarcode, productMatchesBarcodeSearch } from "@/lib/utils/barcode";
import { printProductLabel, printProductLabelsBatch } from "@/lib/utils/print";
import { ProductForm } from "@/components/products/ProductForm";
import QuickEditPanel from "@/components/products/QuickEditPanel";
import type { ProductFormData, Product } from "@/types/product";
import { Plus, Search, Edit2, Trash2, Package, Printer, CheckSquare, Square, X, Layers, Check } from "lucide-react";

function getDuplicateProductError(
  products: Product[],
  data: ProductFormData,
  editingId?: string
): string | null {
  const nameAr = data.nameAr.trim().toLowerCase();
  const newBarcodes = (data.barcodes?.length ? data.barcodes : data.barcode ? [data.barcode] : [])
    .map((b) => normalizeDigits(b).trim())
    .filter(Boolean);

  for (const p of products) {
    if (editingId && p.id === editingId) continue;

    if (nameAr && p.nameAr.trim().toLowerCase() === nameAr) {
      return `المنتج "${data.nameAr.trim()}" موجود أصلاً ولا يمكن إضافته من جديد.`;
    }
    const clash = newBarcodes.find((bc) => productHasBarcode(p, bc));
    if (clash) {
      return `الباركود "${clash}" مستخدم لمنتج "${p.nameAr || p.name}" ولا يمكن إضافته من جديد.`;
    }
  }
  return null;
}

export default function ProductsPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { products, loading } = useProducts(storeId);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [toast, setToast] = useState("");
  // لوحة "منتجات محدّدة للتعديل": معرّفات المنتجات المضافة.
  const [editIds, setEditIds] = useState<string[]>([]);
  // لوحة البحث المتعدد (تفتح/تغلق بالزر)
  const [showMultiSearch, setShowMultiSearch] = useState(false);
  const [multiSearchQuery, setMultiSearchQuery] = useState("");

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  // أعد التركيز على خانة البحث عند إغلاق أي نافذة، وإلا يلتقط قارئ USB الكتابة فلا
  // يمكن الكتابة في خانة البحث (بعد إضافة/حذف منتج أو رسالة "المنتج موجود أصلاً").
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!showForm && !productToDelete && !showBulkDeleteConfirm) {
      searchRef.current?.focus();
    }
  }, [showForm, productToDelete, showBulkDeleteConfirm]);

  // مخرج طوارئ: مفتاح Escape يغلق أي نافذة عالقة فيعود قارئ الباركود والكتابة للعمل فوراً.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowForm(false);
        setEditingProduct(null);
        setProductToDelete(null);
        setShowBulkDeleteConfirm(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // المنتجات المحدَّدة للتعديل (بترتيب الإضافة) + إضافة/إزالة + حفظ سريع للسعر والمخزون.
  const editProducts = useMemo(
    () => editIds.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p),
    [editIds, products]
  );
  const toggleEdit = (id: string) =>
    setEditIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const handleQuickSave = async (id: string, data: { sellingPrice: number; purchasePrice?: number; stock: number }) => {
    if (!storeId) return;
    await offlineAwareAwait(updateProduct(storeId, id, data));
  };

  // امسح خانة البحث بعد التعرّف على الباركود حتى يمكن تسجيل باركود جديد
  // (نفس سلوك خانة البيع). يبقى المبلغ المكتوب إذا لم يُعثر على المنتج للبحث اليدوي.
  const announceScannedProduct = useCallback((code: string, silentIfMissing = false) => {
    const normalized = normalizeScannedDigits(code.trim());
    if (!normalized) return;
    const p = products.find((prod) => productHasBarcode(prod, normalized));
    if (p) {
      showMsg(`✅ ${p.nameAr || p.name} — ${formatCurrency(p.sellingPrice)} — المخزون: ${p.stock} ${p.unit}`);
      setSearch("");
    } else if (!silentIfMissing) {
      showMsg(`⚠️ لا يوجد منتج بهذا الباركود: ${normalized}`);
    }
  }, [products]);

  // قارئ USB عندما لا تكون أي خانة في وضع التركيز
  useUsbScanner(announceScannedProduct, !showForm && !productToDelete && !showBulkDeleteConfirm);

  const filtered = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.nameAr.includes(search) ||
      productMatchesBarcodeSearch(p, search)
  );

  const selectedProducts = useMemo(
    () => products.filter((p) => selectedIds.has(p.id)),
    [products, selectedIds]
  );

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));

  const openNew = () => { setEditingProduct(null); setShowForm(true); };
  const openEdit = (p: Product) => { setEditingProduct(p); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingProduct(null); };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelectionMode = () => {
    if (selectionMode) exitSelectionMode();
    else setSelectionMode(true);
  };

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.add(p.id));
        return next;
      });
    }
  };

  const handleSave = async (data: ProductFormData) => {
    if (!storeId) { showMsg("⚠️ تعذّر الحفظ — أعد تسجيل الدخول"); return; }

    const duplicateError = getDuplicateProductError(products, data, editingProduct?.id);
    if (duplicateError) {
      // رسالة غير معطِّلة (alert يوقف الواجهة ويسرق التركيز) — والنموذج يبقى مفتوحاً للتصحيح.
      showMsg("⚠️ " + duplicateError);
      return;
    }

    setSaving(true);
    const editing = editingProduct;
    const saveOp = editing
      ? updateProduct(storeId, editing.id, data)
      : addProduct(storeId, data);

    closeForm();
    setSaving(false);

    saveOp
      .then(() => showMsg(editing ? "✅ تم حفظ التعديلات" : "✅ تمت إضافة المنتج"))
      .catch((e) => {
        console.error("Error saving product:", e);
        showMsg("⚠️ خطأ في حفظ المنتج");
      });
  };

  const handleDelete = (p: Product) => {
    setProductToDelete(p);
  };

  const handlePrintLabel = (p: Product) => {
    printProductLabel(p.nameAr || p.name, p.sellingPrice, p.barcode);
  };

  const handleBulkPrint = () => {
    if (selectedProducts.length === 0) return;
    printProductLabelsBatch(
      selectedProducts.map((p) => ({
        name: p.nameAr || p.name,
        sellingPrice: p.sellingPrice,
        barcode: p.barcode,
      }))
    );
  };

  const handleBulkDelete = async () => {
    if (!storeId || selectedProducts.length === 0) { setShowBulkDeleteConfirm(false); return; }
    setBulkDeleting(true);
    try {
      for (const p of selectedProducts) {
        try {
          await offlineAwareAwait(deleteProduct(storeId, p.id));
        } catch (e) {
          if (!isOffline()) {
            console.error(`Failed to delete product ${p.id}:`, e);
          }
        }
      }
      setShowBulkDeleteConfirm(false);
      exitSelectionMode();
      showMsg(isOffline() ? "✅ تم حذف المنتجات محلياً (ستتزامن لاحقاً)" : "✅ تم حذف المنتجات بنجاح");
    } catch (e) {
      console.error("bulk delete error:", e);
      showMsg("⚠️ خطأ أثناء الحذف");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {toast && (
        <div style={{
          position: "fixed", top: "1rem", left: "50%", transform: "translateX(-50%)",
          padding: "0.75rem 1.5rem", borderRadius: "0.75rem", zIndex: 200,
          background: toast.startsWith("⚠️") ? "#dc2626" : "#26683a",
          color: "white", fontWeight: 600, fontSize: "0.875rem",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)", maxWidth: "90vw", textAlign: "center",
        }}>{toast}</div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>المنتجات</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>{products.length} منتج إجمالاً</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={() => { setShowMultiSearch((v) => !v); setMultiSearchQuery(""); }}
            className="btn-secondary"
            style={showMultiSearch ? { background: "#f0fdf4", borderColor: "#49a35c", color: "#26683a" } : undefined}
          >
            <Layers size={18} /> البحث المتعدد
          </button>
          <button
            onClick={toggleSelectionMode}
            className={selectionMode ? "btn-secondary" : "btn-secondary"}
            style={selectionMode ? { background: "#f0fdf4", borderColor: "#49a35c", color: "#26683a" } : undefined}
          >
            {selectionMode ? <X size={18} /> : <CheckSquare size={18} />}
            {selectionMode ? "إلغاء التحديد" : "تحديد مجموعة"}
          </button>
          <button onClick={openNew} className="btn-primary">
            <Plus size={18} /> منتج جديد
          </button>
        </div>
      </div>

      {selectionMode && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem",
          background: "#f0fdf4", border: "1px solid #c5e5b8", borderRadius: "0.75rem",
          padding: "0.75rem 1rem", marginBottom: "1rem",
        }}>
          <div style={{ fontSize: "0.875rem", color: "#26683a", fontWeight: 600 }}>
            {selectedIds.size > 0 ? `${selectedIds.size} منتج محدد` : "حدّد المنتجات من الجدول"}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button onClick={toggleSelectAllFiltered} className="btn-secondary" style={{ fontSize: "0.8rem" }}>
              {allFilteredSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
            </button>
            <button
              onClick={handleBulkPrint}
              disabled={selectedIds.size === 0}
              className="btn-secondary"
              style={{ fontSize: "0.8rem" }}
            >
              <Printer size={14} /> طباعة المحدد
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              disabled={selectedIds.size === 0}
              className="btn-danger"
              style={{ fontSize: "0.8rem" }}
            >
              <Trash2 size={14} /> حذف المحدد
            </button>
          </div>
        </div>
      )}

      {showMultiSearch && (() => {
        const q = multiSearchQuery.toLowerCase().trim();
        const multiResults = products.filter((p) =>
          !q ||
          p.nameAr.includes(multiSearchQuery.trim()) ||
          p.name.toLowerCase().includes(q) ||
          productMatchesBarcodeSearch(p, multiSearchQuery.trim())
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
                <Layers size={15} /> البحث المتعدد — ابحث وأضف منتجات للتعديل السريع
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
                  onChange={(e) => setMultiSearchQuery(e.target.value)}
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
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexShrink: 0 }}>
                          <span style={{ color: "#26683a", fontWeight: 700, fontSize: "0.82rem" }}>{p.sellingPrice} د.ج</span>
                          <span style={{ color: "#6b7280", fontSize: "0.78rem" }}>مخزون: {p.stock}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {multiSearchQuery.trim() && multiResults.length === 0 && (
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
                  <Check size={16} /> تأكيد — تعديل {editIds.length} منتج
                </button>
              )}
            </div>
          </div>
        );
      })()}

      <div style={{ position: "relative", marginBottom: "1rem" }}>
        <Search
          size={18}
          style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}
        />
        <input
          ref={searchRef}
          className="input-field"
          style={{ paddingRight: "2.5rem" }}
          placeholder="بحث بالاسم أو الباركود، أو امسح مباشرة..."
          value={search}
          autoFocus
          autoComplete="off"
          onChange={(e) => { setSearch(normalizeDigits(e.target.value)); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // حوّل رموز لوحة المفاتيح الفرنسية/العربية إلى أرقام لاكتشاف الباركود الممسوح
              const normalized = normalizeScannedDigits(search.trim());
              // باركود (أرقام فقط) → أعلن المنتج وامسح الخانة؛ البحث بالاسم لا يتأثر
              if (/^\d+$/.test(normalized)) {
                announceScannedProduct(normalized, true);
                e.preventDefault();
              }
            }
          }}
        />

      </div>

      <QuickEditPanel
        products={editProducts}
        onRemove={(id) => setEditIds((prev) => prev.filter((x) => x !== id))}
        onClear={() => setEditIds([])}
        onSave={handleQuickSave}
        mode="full"
      />

      <div className="table-container">
        <table>
          <thead>
            <tr>
              {selectionMode && <th style={{ width: "40px" }}></th>}
              <th>المنتج</th>
              <th>الفئة</th>
              <th>سعر الشراء</th>
              <th>سعر البيع</th>
              <th>هامش الربح</th>
              <th>المخزون</th>
              <th>الحالة</th>
              {!selectionMode && <th>إجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={selectionMode ? 8 : 8} style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>
                  جارٍ التحميل...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={selectionMode ? 8 : 8} style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
                  <Package size={40} style={{ margin: "0 auto 0.75rem", opacity: 0.2 }} />
                  <br />
                  {search ? "لا توجد نتائج" : "لا توجد منتجات. أضف منتجاً جديداً!"}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const margin =
                  p.sellingPrice > 0 && p.purchasePrice > 0
                    ? (((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100).toFixed(1)
                    : null;
                const expiry = p.expiryDate ? (() => {
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  const exp = new Date(p.expiryDate);
                  exp.setHours(0, 0, 0, 0);
                  const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  if (diff <= 0) return { label: "منتهي الصلاحية", color: "#dc2626", bg: "#fef2f2" };
                  if (diff <= 30) return { label: `ينتهي خلال ${diff} يوم`, color: "#d97706", bg: "#fffbeb" };
                  return { label: p.expiryDate, color: "#4b5563", bg: "#f3f4f6" };
                })() : null;
                const isSelected = selectedIds.has(p.id);

                return (
                  <tr
                    key={p.id}
                    onClick={selectionMode ? () => toggleProduct(p.id) : undefined}
                    style={{
                      cursor: selectionMode ? "pointer" : undefined,
                      background: isSelected ? "#f0fdf4" : undefined,
                    }}
                  >
                    {selectionMode && (
                      <td>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleProduct(p.id); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: isSelected ? "#26683a" : "#9ca3af", padding: 0, display: "flex" }}
                        >
                          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                      </td>
                    )}
                    <td>
                      <div style={{ fontWeight: 600, color: "#17231c" }}>{p.nameAr || p.name}</div>
                      {p.nameAr && <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{p.name}</div>}
                      <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", marginTop: "0.25rem", flexWrap: "wrap" }}>
                        {p.barcode && (
                          <span style={{ fontSize: "0.7rem", color: "#9ca3af", fontFamily: "monospace", background: "#f9fafb", padding: "1px 4px", borderRadius: "3px" }}>
                            📊 {p.barcode}
                          </span>
                        )}
                        {expiry && (
                          <span style={{ fontSize: "0.7rem", color: expiry.color, background: expiry.bg, padding: "1px 6px", borderRadius: "3px", fontWeight: 600 }}>
                            📅 {expiry.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td><span className="badge-green">{p.category}</span></td>
                    <td style={{ color: "#6b7280" }}>{formatCurrency(p.purchasePrice)}</td>
                    <td style={{ fontWeight: 600, color: "#26683a" }}>{formatCurrency(p.sellingPrice)}</td>
                    <td>
                      {margin ? (
                        <span className={Number(margin) < 10 ? "badge-orange" : "badge-green"}>
                          {margin}%
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      <span className={p.stock === 0 ? "badge-red" : p.stock <= p.minStock ? "badge-orange" : "badge-green"}>
                        {p.stock} {p.unit}
                      </span>
                    </td>
                    <td>
                      <span className={p.isActive ? "badge-green" : "badge-red"}>
                        {p.isActive ? "نشط" : "معطل"}
                      </span>
                    </td>
                    {!selectionMode && (
                      <td>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            onClick={() => handlePrintLabel(p)}
                            className="btn-secondary"
                            style={{ padding: "0.25rem 0.5rem" }}
                            title="طباعة بطاقة السعر"
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            onClick={() => openEdit(p)}
                            className="btn-secondary"
                            style={{ padding: "0.25rem 0.5rem" }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            className="btn-danger"
                            style={{ padding: "0.25rem 0.5rem" }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ProductForm
          initial={editingProduct}
          onSave={handleSave}
          onClose={closeForm}
          saving={saving}
        />
      )}

      {productToDelete && (
        <div className="modal-overlay" onClick={() => setProductToDelete(null)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, marginBottom: "0.75rem", color: "#dc2626" }}>تأكيد حذف المنتج</h3>
            <p style={{ color: "#4b5563", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              هل أنت متأكد من رغبتك في حذف المنتج <strong>"{productToDelete.nameAr || productToDelete.name}"</strong> نهائياً؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setProductToDelete(null)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>
                إلغاء
              </button>
              <button
                onClick={async () => {
                  const p = productToDelete;
                  setProductToDelete(null); // أغلق النافذة دائماً أولاً حتى لا تَعلق
                  if (!storeId || !p) return;
                  try {
                    await offlineAwareAwait(deleteProduct(storeId, p.id));
                    showMsg(isOffline() ? "✅ تم حذف المنتج محلياً (سيتزامن لاحقاً)" : "✅ تم حذف المنتج");
                  } catch (e) {
                    console.error("delete error:", e);
                    if (!isOffline()) showMsg("⚠️ خطأ أثناء حذف المنتج");
                  }
                }}
                className="btn-danger"
                style={{ flex: 1, justifyContent: "center" }}
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowBulkDeleteConfirm(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, marginBottom: "0.75rem", color: "#dc2626" }}>حذف {selectedIds.size} منتج</h3>
            <p style={{ color: "#4b5563", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              هل أنت متأكد من حذف المنتجات المحددة ({selectedIds.size}) نهائياً؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setShowBulkDeleteConfirm(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>
                إلغاء
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="btn-danger"
                style={{ flex: 1, justifyContent: "center" }}
              >
                {bulkDeleting ? "جارٍ الحذف..." : "تأكيد الحذف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
