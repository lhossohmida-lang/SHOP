"use client";
import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useCredits } from "@/hooks/useCredits";
import { addSale } from "@/lib/firestore/sales";
import { updateStock } from "@/lib/firestore/products";
import { addCreditTransaction, updateCreditCustomer } from "@/lib/firestore/credits";
import { formatCurrency } from "@/lib/utils/currency";
import { generateReceiptNumber } from "@/lib/utils/date";
import { printReceipt } from "@/lib/utils/print";
import { Search, Plus, Minus, Trash2, ShoppingCart, X, Printer, Tag } from "lucide-react";
import type { Product } from "@/types/product";
import type { Sale, SaleItem } from "@/types/sale";

interface CartItem extends SaleItem { }

export default function PosPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { activeProducts } = useProducts(storeId);
  const { activeCustomers } = useCredits(storeId);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("الكل");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "credit">("cash");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const categories = ["الكل", ...Array.from(new Set(activeProducts.map(p => p.category)))];

  const filtered = activeProducts.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.nameAr.includes(search) || p.barcode.includes(search);
    const matchCat = category === "الكل" || p.category === category;
    return matchSearch && matchCat && p.isActive;
  });

  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id
          ? { ...i, quantity: i.quantity + 1, totalPrice: (i.quantity + 1) * i.unitPrice }
          : i);
      }
      return [...prev, {
        productId: product.id,
        productName: product.nameAr || product.name,
        quantity: 1,
        unitPrice: product.sellingPrice,
        totalPrice: product.sellingPrice,
      }];
    });
  }, []);

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev
      .map(i => i.productId === productId
        ? { ...i, quantity: Math.max(0, i.quantity + delta), totalPrice: Math.max(0, i.quantity + delta) * i.unitPrice }
        : i)
      .filter(i => i.quantity > 0));
  };

  const removeItem = (productId: string) => setCart(prev => prev.filter(i => i.productId !== productId));

  const subtotal = cart.reduce((s, i) => s + i.totalPrice, 0);
  const total = Math.max(0, subtotal - discount);

  const handleSale = async () => {
    if (!storeId || cart.length === 0) return;
    setLoading(true);
    try {
      const receiptNumber = generateReceiptNumber();
      const customer = payMethod === "credit" ? activeCustomers.find(c => c.id === selectedCustomer) : undefined;

      const saleData: Omit<Sale, "id" | "createdAt"> = {
        type: "sale",
        items: cart,
        subtotal,
        discount,
        tax: 0,
        total,
        paymentMethod: payMethod,
        customerId: customer?.id,
        customerName: customer?.name,
        cashierId: appUser!.uid,
        cashierName: appUser!.displayName,
        note,
        receiptNumber,
        storeId,
      };

      const saleId = await addSale(storeId, saleData);

      // Update stock for each product
      for (const item of cart) {
        await updateStock(storeId, item.productId, -item.quantity);
      }

      // Handle credit
      if (payMethod === "credit" && customer) {
        const balanceBefore = customer.totalDebt;
        const balanceAfter = balanceBefore + total;
        await addCreditTransaction(storeId, {
          customerId: customer.id,
          customerName: customer.name,
          type: "purchase",
          amount: total,
          balanceBefore,
          balanceAfter,
          saleId,
          createdBy: appUser!.uid,
        });
        await updateCreditCustomer(storeId, customer.id, {
          totalDebt: balanceAfter,
          lastTransactionAt: new Date(),
        });
      }

      // Print receipt
      printReceipt({ ...saleData, id: saleId, createdAt: new Date() });

      setCart([]);
      setDiscount(0);
      setNote("");
      setShowSaleModal(false);
      setSuccessMsg(`✅ تم البيع بنجاح! ${receiptNumber}`);
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (e) {
      alert("حدث خطأ أثناء البيع: " + e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: "1rem", height: "calc(100vh - 100px)" }}>
      {/* Success toast */}
      {successMsg && (
        <div style={{
          position: "fixed", top: "1rem", left: "50%", transform: "translateX(-50%)",
          background: "#26683a", color: "white", padding: "0.75rem 1.5rem",
          borderRadius: "0.75rem", zIndex: 100, fontSize: "0.875rem", fontWeight: 600,
          boxShadow: "0 4px 20px rgba(38,104,58,0.4)",
        }}>
          {successMsg}
        </div>
      )}

      {/* LEFT: Products */}
      <div style={{ flex: "0 0 60%", display: "flex", flexDirection: "column", gap: "0.75rem", overflow: "hidden" }}>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input
            className="input-field"
            style={{ paddingRight: "2.5rem" }}
            placeholder="بحث بالاسم أو الباركود..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Category filter */}
        <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "4px" }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)} style={{
              padding: "0.375rem 0.875rem", borderRadius: "9999px", border: "none",
              cursor: "pointer", fontSize: "0.8rem", fontWeight: category === cat ? 600 : 400, whiteSpace: "nowrap",
              background: category === cat ? "#49a35c" : "#f1f8ee",
              color: category === cat ? "white" : "#26683a",
              transition: "all 0.15s",
            }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Products grid */}
        <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.75rem" }}>
          {filtered.map(product => {
            const inCart = cart.find(i => i.productId === product.id);
            return (
              <button key={product.id} onClick={() => addToCart(product)} style={{
                background: "white", border: inCart ? "2px solid #49a35c" : "2px solid #e5e7eb",
                borderRadius: "0.75rem", padding: "0.75rem", cursor: product.stock > 0 ? "pointer" : "not-allowed",
                textAlign: "right", transition: "all 0.15s", position: "relative",
                boxShadow: "0 2px 8px rgba(23,35,28,0.06)",
                opacity: product.stock === 0 ? 0.5 : 1,
              }} disabled={product.stock === 0}>
                {inCart && (
                  <div style={{ position: "absolute", top: "0.375rem", left: "0.375rem", background: "#49a35c", color: "white", borderRadius: "50%", width: "20px", height: "20px", fontSize: "0.7rem", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                    {inCart.quantity}
                  </div>
                )}
                <div style={{ fontSize: "1.5rem", marginBottom: "0.375rem" }}>🏷️</div>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#17231c", marginBottom: "0.25rem", lineHeight: 1.3 }}>
                  {product.nameAr || product.name}
                </div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#49a35c" }}>
                  {formatCurrency(product.sellingPrice)}
                </div>
                <div style={{ fontSize: "0.68rem", color: product.stock <= product.minStock ? "#dc2626" : "#9ca3af" }}>
                  متاح: {product.stock} {product.unit}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
              لا توجد منتجات
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Cart */}
      <div style={{ flex: "0 0 40%", display: "flex", flexDirection: "column", background: "white", borderRadius: "1rem", boxShadow: "0 8px 24px rgba(23,35,28,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "1rem", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ShoppingCart size={20} color="#49a35c" />
          <span style={{ fontWeight: 600, color: "#17231c" }}>السلة</span>
          {cart.length > 0 && <span className="badge-green">{cart.length}</span>}
        </div>

        {/* Cart items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem" }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>
              <ShoppingCart size={40} style={{ margin: "0 auto 0.5rem", opacity: 0.3 }} />
              <p>السلة فارغة</p>
            </div>
          ) : cart.map(item => (
            <div key={item.productId} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 500, color: "#17231c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.productName}</div>
                <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>{formatCurrency(item.unitPrice)} / وحدة</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <button onClick={() => updateQty(item.productId, -1)} style={{ width: "24px", height: "24px", borderRadius: "50%", border: "1px solid #e5e7eb", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Minus size={12} />
                </button>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, minWidth: "24px", textAlign: "center" }}>{item.quantity}</span>
                <button onClick={() => updateQty(item.productId, 1)} style={{ width: "24px", height: "24px", borderRadius: "50%", border: "1px solid #49a35c", background: "#f1f8ee", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#49a35c" }}>
                  <Plus size={12} />
                </button>
              </div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#26683a", minWidth: "70px", textAlign: "left" }}>
                {formatCurrency(item.totalPrice)}
              </div>
              <button onClick={() => removeItem(item.productId)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: "0.25rem" }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Totals */}
        {cart.length > 0 && (
          <div style={{ padding: "0.75rem", borderTop: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>المجموع الفرعي</span>
              <span style={{ fontSize: "0.875rem" }}>{formatCurrency(subtotal)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <Tag size={14} color="#6b7280" />
              <input
                type="number" min="0" value={discount || ""}
                onChange={e => setDiscount(Number(e.target.value))}
                placeholder="الخصم (اختياري)"
                className="input-field" style={{ flex: 1, fontSize: "0.8rem", padding: "0.375rem 0.5rem" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", padding: "0.75rem", background: "#f1f8ee", borderRadius: "0.5rem" }}>
              <span style={{ fontWeight: 700, color: "#17231c" }}>الإجمالي</span>
              <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "#26683a" }}>{formatCurrency(total)}</span>
            </div>

            {/* Payment buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <button onClick={() => { setPayMethod("cash"); setShowSaleModal(true); }} className="btn-primary" style={{ justifyContent: "center", width: "100%", padding: "0.75rem" }}>
                💵 بيع نقداً
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <button onClick={() => { setPayMethod("card"); setShowSaleModal(true); }} className="btn-secondary" style={{ justifyContent: "center", padding: "0.625rem" }}>
                  💳 بطاقة
                </button>
                <button onClick={() => { setPayMethod("credit"); setShowSaleModal(true); }} style={{ justifyContent: "center", padding: "0.625rem", background: "#fff4bc", color: "#a16207", border: "1px solid #eab308", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.875rem", fontWeight: 500 }}>
                  📋 على الحساب
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sale Confirmation Modal */}
      {showSaleModal && (
        <div className="modal-overlay" onClick={() => setShowSaleModal(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "420px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 style={{ fontWeight: 700, fontSize: "1.1rem" }}>تأكيد البيع</h2>
              <button onClick={() => setShowSaleModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ background: "#f8fdf5", borderRadius: "0.75rem", padding: "1rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ color: "#6b7280" }}>عدد الأصناف</span>
                <span style={{ fontWeight: 600 }}>{cart.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ color: "#6b7280" }}>الخصم</span>
                <span style={{ fontWeight: 600, color: "#dc2626" }}>-{formatCurrency(discount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: "1rem" }}>الإجمالي</span>
                <span style={{ fontWeight: 700, fontSize: "1.2rem", color: "#26683a" }}>{formatCurrency(total)}</span>
              </div>
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <span className="label">طريقة الدفع</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {(["cash", "card", "credit"] as const).map(m => (
                  <button key={m} onClick={() => setPayMethod(m)} style={{
                    flex: 1, padding: "0.5rem", borderRadius: "0.5rem", border: "2px solid",
                    borderColor: payMethod === m ? "#49a35c" : "#e5e7eb",
                    background: payMethod === m ? "#f1f8ee" : "white",
                    color: payMethod === m ? "#26683a" : "#6b7280",
                    cursor: "pointer", fontSize: "0.8rem", fontWeight: payMethod === m ? 600 : 400,
                  }}>
                    {m === "cash" ? "💵 نقداً" : m === "card" ? "💳 بطاقة" : "📋 آجل"}
                  </button>
                ))}
              </div>
            </div>

            {payMethod === "credit" && (
              <div style={{ marginBottom: "0.75rem" }}>
                <label className="label">العميل</label>
                <select className="input-field" value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}>
                  <option value="">-- اختر عميل --</option>
                  {activeCustomers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} — {formatCurrency(c.totalDebt)}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label className="label">ملاحظة (اختياري)</label>
              <input className="input-field" value={note} onChange={e => setNote(e.target.value)} placeholder="ملاحظة..." />
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setShowSaleModal(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>
                إلغاء
              </button>
              <button onClick={handleSale} disabled={loading || (payMethod === "credit" && !selectedCustomer)} className="btn-primary" style={{ flex: 2, justifyContent: "center" }}>
                <Printer size={16} />
                {loading ? "جارٍ الحفظ..." : "تأكيد وطباعة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
