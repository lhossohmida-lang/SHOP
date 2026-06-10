"use client";
import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { usePurchases } from "@/hooks/usePurchases";
import { useUsbScanner } from "@/hooks/useUsbScanner";
import { addPurchase, deletePurchase } from "@/lib/firestore/purchases";
import { updateProduct } from "@/lib/firestore/products";
import { isOffline, offlineAwareAwait } from "@/lib/firestore/helpers";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import BarcodeScanner from "@/components/pos/BarcodeScanner";
import { Plus, X, Trash2, Search, TruckIcon, Camera } from "lucide-react";
import type { PurchaseItem } from "@/types/purchase";
import type { Product } from "@/types/product";

export default function PurchasesPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { activeProducts } = useProducts(storeId);
  const { purchases, loading } = usePurchases(storeId);

  const [showForm, setShowForm] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "credit" | "check">("cash");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<any>(null);

  const searchResults =
    productSearch.length > 1
      ? activeProducts
          .filter(
            (p) =>
              p.nameAr.includes(productSearch) ||
              p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
              p.barcode.includes(productSearch)
          )
          .slice(0, 6)
      : [];

  const addItem = useCallback((p: Product) => {
    setItems((prev) => {
      if (prev.find((i) => i.productId === p.id)) return prev;
      return [
        ...prev,
        {
          productId: p.id,
          productName: p.nameAr || p.name,
          quantity: 1,
          unitCost: p.purchasePrice,
          totalCost: p.purchasePrice,
        },
      ];
    });
    setProductSearch("");
  }, []);

  const handleBarcodeScanned = useCallback(
    (barcode: string) => {
      const product = activeProducts.find((p) => p.barcode === barcode);
      if (product) {
        addItem(product);
      } else {
        setProductSearch(barcode);
      }
      setShowCamera(false);
    },
    [activeProducts, addItem]
  );

  const handleUsbScan = useCallback(
    (barcode: string) => {
      const product = activeProducts.find((p) => p.barcode === barcode);
      if (product) {
        addItem(product);
      } else {
        setProductSearch(barcode);
      }
    },
    [activeProducts, addItem]
  );

  useUsbScanner(handleUsbScan, showForm && !showCamera);

  const updateItem = (productId: string, field: "quantity" | "unitCost", val: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.productId !== productId) return i;
        const updated = { ...i, [field]: val };
        updated.totalCost = updated.quantity * updated.unitCost;
        return updated;
      })
    );
  };

  const totalCost = items.reduce((s, i) => s + i.totalCost, 0);

  const handleDelete = async (purchase: any) => {
    if (!storeId) return;
    setPurchaseToDelete(purchase);
  };

  const confirmDelete = async () => {
    if (!storeId || !purchaseToDelete) return;
    try {
      await deletePurchase(storeId, purchaseToDelete.id);
      setPurchaseToDelete(null);
    } catch (e) {
      alert("خطأ أثناء حذف المشتريات: " + e);
    }
  };

  const handleSave = async () => {
    if (!storeId || !supplierName || items.length === 0) return;
    setSaving(true);
    try {
      await offlineAwareAwait(addPurchase(storeId, {
        supplierName,
        invoiceNumber: invoiceNumber.trim(),
        items,
        totalCost,
        paymentMethod,
        receivedBy: appUser!.uid,
        note: note.trim(),
        storeId,
      }));

      for (const item of items) {
        const p = activeProducts.find((p) => p.id === item.productId);
        if (p) {
          await offlineAwareAwait(updateProduct(storeId, item.productId, {
            stock: p.stock + item.quantity,
            purchasePrice: item.unitCost,
          }));
        }
      }

      if (isOffline()) {
        alert("تم حفظ الاستلام محلياً. سيتم المزامنة عند عودة الإنترنت.");
      }
    } catch (e) {
      if (!isOffline()) {
        alert("خطأ: " + e);
      }
    } finally {
      setShowForm(false);
      setItems([]);
      setSupplierName("");
      setInvoiceNumber("");
      setNote("");
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {showCamera && (
        <BarcodeScanner onScan={handleBarcodeScanned} onClose={() => setShowCamera(false)} />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>المشتريات</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>استلام وتسجيل البضاعة من الموردين</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={18} /> استلام بضاعة
        </button>
      </div>

      {/* Purchases History */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>المورد</th>
              <th>رقم الفاتورة</th>
              <th>التاريخ</th>
              <th>الأصناف</th>
              <th>الإجمالي</th>
              <th>طريقة الدفع</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>جارٍ التحميل...</td></tr>
            ) : purchases.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
                  <TruckIcon size={36} style={{ margin: "0 auto 0.75rem", opacity: 0.2 }} /><br />
                  لا توجد مشتريات مسجلة
                </td>
              </tr>
            ) : (
              purchases.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.supplierName}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#6b7280" }}>{p.invoiceNumber || "—"}</td>
                  <td style={{ color: "#6b7280", fontSize: "0.8rem" }}>{formatDateTime(p.createdAt)}</td>
                  <td><span className="badge-green">{p.items.length} صنف</span></td>
                  <td style={{ fontWeight: 700, color: "#26683a" }}>{formatCurrency(p.totalCost)}</td>
                  <td>
                    <span className={p.paymentMethod === "credit" ? "badge-yellow" : "badge-green"}>
                      {p.paymentMethod === "cash" ? "نقداً" : p.paymentMethod === "credit" ? "آجل" : "شيك"}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleDelete(p)}
                      className="btn-danger"
                      style={{ padding: "0.25rem 0.5rem" }}
                      title="حذف المشتريات"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div
            className="card animate-slide-up"
            style={{ width: "100%", maxWidth: "640px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h2 style={{ fontWeight: 700 }}>استلام بضاعة جديدة</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
              <div>
                <label className="label">اسم المورد *</label>
                <input className="input-field" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="اسم المورد" />
              </div>
              <div>
                <label className="label">رقم الفاتورة</label>
                <input className="input-field" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="اختياري" dir="ltr" style={{ textAlign: "left" }} />
              </div>
              <div>
                <label className="label">طريقة الدفع</label>
                <select className="input-field" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
                  <option value="cash">نقداً</option>
                  <option value="credit">آجل</option>
                  <option value="check">شيك</option>
                </select>
              </div>
              <div>
                <label className="label">ملاحظة</label>
                <input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" />
              </div>
            </div>

            {/* Product search with camera */}
            <div style={{ marginBottom: "1rem" }}>
              <label className="label">إضافة منتج</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <Search size={15} style={{ position: "absolute", right: "0.625rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                  <input
                    className="input-field"
                    style={{ paddingRight: "2rem" }}
                    placeholder="ابحث أو امسح الباركود..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const trimmed = productSearch.trim();
                        if (trimmed) {
                          const exactProduct = activeProducts.find((p) => p.barcode === trimmed);
                          if (exactProduct) {
                            addItem(exactProduct);
                            e.preventDefault();
                            return;
                          }
                        }
                        if (searchResults.length > 0) {
                          addItem(searchResults[0]);
                          e.preventDefault();
                        }
                      }
                    }}
                  />
                </div>
                <button
                  onClick={() => setShowCamera(true)}
                  style={{
                    padding: "0 0.75rem", borderRadius: "0.5rem",
                    border: "1px solid #c5e5b8", background: "#f1f8ee",
                    cursor: "pointer", color: "#49a35c",
                    display: "flex", alignItems: "center",
                  }}
                >
                  <Camera size={17} />
                </button>
              </div>
              {searchResults.length > 0 && (
                <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "0.5rem", marginTop: "4px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addItem(p)}
                      style={{
                        width: "100%", display: "flex", justifyContent: "space-between",
                        padding: "0.625rem 0.875rem", background: "none", border: "none",
                        cursor: "pointer", textAlign: "right", borderBottom: "1px solid #f3f4f6",
                        fontSize: "0.875rem",
                      }}
                    >
                      <span>{p.nameAr || p.name}</span>
                      <span style={{ color: "#6b7280", fontSize: "0.8rem" }}>{formatCurrency(p.purchasePrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Items list */}
            {items.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#17231c" }}>
                  المنتجات المستلمة ({items.length})
                </div>
                {items.map((item) => (
                  <div key={item.productId} style={{
                    display: "flex", gap: "0.5rem", alignItems: "center",
                    marginBottom: "0.5rem", padding: "0.625rem",
                    background: "#f8fdf5", borderRadius: "0.5rem",
                  }}>
                    <div style={{ flex: 1, fontSize: "0.85rem", fontWeight: 500 }}>{item.productName}</div>
                    <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                      <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>كمية:</span>
                      <input
                        type="number" min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.productId, "quantity", Number(e.target.value))}
                        style={{ width: "58px", border: "1px solid #c5e5b8", borderRadius: "4px", padding: "3px 6px", fontSize: "0.8rem", textAlign: "center" }}
                      />
                      <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>تكلفة:</span>
                      <input
                        type="number" min="0"
                        value={item.unitCost}
                        onChange={(e) => updateItem(item.productId, "unitCost", Number(e.target.value))}
                        style={{ width: "88px", border: "1px solid #c5e5b8", borderRadius: "4px", padding: "3px 6px", fontSize: "0.8rem" }}
                      />
                    </div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#26683a", minWidth: "80px", textAlign: "left" }}>
                      {formatCurrency(item.totalCost)}
                    </span>
                    <button
                      onClick={() => setItems((prev) => prev.filter((i) => i.productId !== item.productId))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626" }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "0.75rem", background: "#f1f8ee", borderRadius: "0.5rem", fontWeight: 700,
                }}>
                  <span>الإجمالي</span>
                  <span style={{ color: "#26683a" }}>{formatCurrency(totalCost)}</span>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setShowForm(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>
                إلغاء
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !supplierName || items.length === 0}
                className="btn-primary"
                style={{ flex: 2, justifyContent: "center" }}
              >
                {saving ? "جارٍ الحفظ..." : "✅ تأكيد الاستلام"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {purchaseToDelete && (
        <div className="modal-overlay" onClick={() => setPurchaseToDelete(null)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, marginBottom: "0.75rem", color: "#dc2626" }}>تأكيد حذف المشتريات</h3>
            <p style={{ color: "#4b5563", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              هل أنت متأكد من رغبتك في حذف مشتريات <strong>"{purchaseToDelete.supplierName}"</strong> نهائياً؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setPurchaseToDelete(null)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>
                إلغاء
              </button>
              <button
                onClick={confirmDelete}
                className="btn-danger"
                style={{ flex: 1, justifyContent: "center" }}
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
