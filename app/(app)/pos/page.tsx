"use client";
import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useCredits } from "@/hooks/useCredits";
import { useUsbScanner } from "@/hooks/useUsbScanner";
import { addSale } from "@/lib/firestore/sales";
import { updateStock } from "@/lib/firestore/products";
import { addCreditTransaction, updateCreditCustomer } from "@/lib/firestore/credits";
import { formatCurrency } from "@/lib/utils/currency";
import { generateReceiptNumber } from "@/lib/utils/date";
import { printReceipt } from "@/lib/utils/print";
import BarcodeScanner from "@/components/pos/BarcodeScanner";
import {
  Search, Plus, Minus, Trash2, ShoppingCart,
  X, Printer, Camera, ScanLine, CreditCard, Banknote, UserCheck
} from "lucide-react";
import type { Product } from "@/types/product";
import type { Sale } from "@/types/sale";

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number; // dynamically becomes sellingPrice or purchasePrice
  totalPrice: number;
  purchasePrice: number;
  sellingPrice: number;
}

export default function PosPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { activeProducts } = useProducts(storeId);
  const { activeCustomers } = useCredits(storeId);

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [showCameraScanner, setShowCameraScanner] = useState(false);

  // Flow State
  const [showCashModal, setShowCashModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Calculations
  const cashSubtotal = cart.reduce((s, i) => s + (i.purchasePrice * i.quantity), 0);
  const cashTotal = Math.max(0, cashSubtotal - discount);

  const creditSubtotal = cart.reduce((s, i) => s + (i.sellingPrice * i.quantity), 0);
  const creditTotal = Math.max(0, creditSubtotal - discount);

  const addToCart = useCallback((product: Product) => {
    if (product.stock === 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? {
                ...i,
                quantity: i.quantity + 1,
                totalPrice: (i.quantity + 1) * i.sellingPrice,
              }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.nameAr || product.name,
          quantity: 1,
          unitPrice: product.sellingPrice,
          totalPrice: product.sellingPrice,
          purchasePrice: product.purchasePrice,
          sellingPrice: product.sellingPrice,
        },
      ];
    });
  }, []);

  const handleBarcodeScanned = useCallback(
    (barcode: string) => {
      const product = activeProducts.find(
        (p) => p.barcode === barcode || p.barcode === barcode.trim()
      );
      if (product) {
        addToCart(product);
        setSearch("");
      } else {
        setSearch(barcode);
        searchRef.current?.focus();
      }
      setShowCameraScanner(false);
    },
    [activeProducts, addToCart]
  );

  useUsbScanner(handleBarcodeScanned, !showCashModal && !showCreditModal && !showCameraScanner);

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.productId === productId
            ? {
                ...i,
                quantity: Math.max(0, i.quantity + delta),
                totalPrice: Math.max(0, i.quantity + delta) * i.sellingPrice,
              }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const removeItem = (productId: string) =>
    setCart((prev) => prev.filter((i) => i.productId !== productId));

  // Process the Cash Sale using the purchasePrice
  const handleCashSale = async () => {
    if (!storeId || cart.length === 0) return;
    setLoading(true);
    try {
      const receiptNumber = generateReceiptNumber();

      // Transform items to use purchasePrice
      const finalizedItems = cart.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.purchasePrice,
        totalPrice: item.purchasePrice * item.quantity,
      }));

      const saleData: Omit<Sale, "id" | "createdAt"> = {
        type: "sale",
        items: finalizedItems,
        subtotal: cashSubtotal,
        discount,
        tax: 0,
        total: cashTotal,
        paymentMethod: "cash",
        cashierId: appUser!.uid,
        cashierName: appUser!.displayName,
        note: note || "دفع نقداً (سعر الشراء)",
        receiptNumber,
        storeId,
      };

      const saleId = await addSale(storeId, saleData);

      for (const item of cart) {
        await updateStock(storeId, item.productId, -item.quantity);
      }

      printReceipt({ ...saleData, id: saleId, createdAt: new Date() });

      setCart([]);
      setDiscount(0);
      setNote("");
      setShowCashModal(false);
      setSuccessMsg(`✅ تم البيع نقداً: ${receiptNumber}`);
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch (e) {
      alert("خطأ أثناء البيع نقداً: " + e);
    } finally {
      setLoading(false);
    }
  };

  // Process the Credit Sale using the sellingPrice
  const handleCreditSale = async () => {
    if (!storeId || cart.length === 0 || !selectedCustomer) return;
    setLoading(true);
    try {
      const customer = activeCustomers.find(c => c.id === selectedCustomer);
      if (!customer) throw new Error("لم يتم العثور على العميل");

      const receiptNumber = generateReceiptNumber();

      // Transform items to use sellingPrice
      const finalizedItems = cart.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.sellingPrice,
        totalPrice: item.sellingPrice * item.quantity,
      }));

      const saleData: Omit<Sale, "id" | "createdAt"> = {
        type: "sale",
        items: finalizedItems,
        subtotal: creditSubtotal,
        discount,
        tax: 0,
        total: creditTotal,
        paymentMethod: "credit",
        customerId: customer.id,
        customerName: customer.name,
        cashierId: appUser!.uid,
        cashierName: appUser!.displayName,
        note: note || "بيع بالآجل (كريدي)",
        receiptNumber,
        storeId,
      };

      const saleId = await addSale(storeId, saleData);

      for (const item of cart) {
        await updateStock(storeId, item.productId, -item.quantity);
      }

      const balanceBefore = customer.totalDebt;
      const balanceAfter = balanceBefore + creditTotal;
      await addCreditTransaction(storeId, {
        customerId: customer.id,
        customerName: customer.name,
        type: "purchase",
        amount: creditTotal,
        balanceBefore,
        balanceAfter,
        saleId,
        createdBy: appUser!.uid,
      });

      await updateCreditCustomer(storeId, customer.id, {
        totalDebt: balanceAfter,
        lastTransactionAt: new Date(),
      });

      printReceipt({ ...saleData, id: saleId, createdAt: new Date() });

      setCart([]);
      setDiscount(0);
      setNote("");
      setSelectedCustomer("");
      setShowCreditModal(false);
      setSuccessMsg(`✅ تم البيع كريدي: ${receiptNumber}`);
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch (e) {
      alert("خطأ أثناء البيع كريدي: " + e);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = activeCustomers.filter(c =>
    !customerSearch || c.name.includes(customerSearch) || c.phone.includes(customerSearch)
  );

  return (
    <div style={{ display: "flex", gap: "1rem", height: "calc(100vh - 100px)" }}>
      {/* Camera scanner */}
      {showCameraScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScanned}
          onClose={() => setShowCameraScanner(false)}
        />
      )}

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

      {/* LEFT AREA: Control boxes & Search */}
      <div style={{ flex: "0 0 60%", display: "flex", flexDirection: "column", gap: "1rem", overflow: "hidden" }}>
        
        {/* Search bar */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={16} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
            <input
              ref={searchRef}
              className="input-field"
              style={{ paddingRight: "2.25rem" }}
              placeholder="ابحث باسم المنتج أو الباركود لإضافته مباشرة..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                // Auto-add product if barcode matches exactly
                const found = activeProducts.find(p => p.barcode === e.target.value.trim());
                if (found) {
                  addToCart(found);
                  setSearch("");
                }
              }}
            />
          </div>
          <button
            onClick={() => setShowCameraScanner(true)}
            style={{
              padding: "0 0.875rem", borderRadius: "0.5rem",
              border: "1px solid #c5e5b8", background: "#f1f8ee",
              cursor: "pointer", color: "#49a35c",
              display: "flex", alignItems: "center", gap: "0.375rem",
              fontSize: "0.8rem", fontWeight: 500,
            }}
          >
            <Camera size={18} /> كاميرا
          </button>
          <button
            onClick={() => searchRef.current?.focus()}
            style={{
              padding: "0 0.875rem", borderRadius: "0.5rem",
              border: "1px solid #e5e7eb", background: "#f9fafb",
              cursor: "pointer", color: "#6b7280",
              display: "flex", alignItems: "center", gap: "0.375rem",
              fontSize: "0.8rem",
            }}
          >
            <ScanLine size={18} /> USB
          </button>
        </div>

        {/* Suggestion list if typing search */}
        {search.trim().length > 1 && (
          <div style={{
            background: "white", border: "1px solid #e5e7eb", borderRadius: "0.75rem",
            maxHeight: "150px", overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
          }}>
            {activeProducts
              .filter(p => p.nameAr.includes(search) || p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search))
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => { addToCart(p); setSearch(""); }}
                  style={{
                    width: "100%", padding: "0.625rem 1rem", background: "none", border: "none",
                    textAlign: "right", borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                    display: "flex", justifyContent: "space-between", fontSize: "0.875rem"
                  }}
                >
                  <span>{p.nameAr || p.name}</span>
                  <span style={{ color: "#49a35c", fontWeight: 600 }}>{formatCurrency(p.sellingPrice)}</span>
                </button>
              ))}
          </div>
        )}

        {/* Big Action Squares */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", flex: 1, padding: "1rem 0" }}>
          
          {/* Box 1: Cash Payment (سعر الشراء فقط) */}
          <button
            onClick={() => {
              if (cart.length > 0) {
                setShowCashModal(true);
              }
            }}
            disabled={cart.length === 0}
            style={{
              background: cart.length > 0 ? "linear-gradient(135deg, #49a35c, #2c6f3d)" : "#f3f4f6",
              color: cart.length > 0 ? "white" : "#9ca3af",
              borderRadius: "1.5rem", border: "none",
              cursor: cart.length > 0 ? "pointer" : "not-allowed",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "1rem",
              boxShadow: cart.length > 0 ? "0 10px 25px rgba(73, 163, 92, 0.25)" : "none",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            className="pos-action-btn"
          >
            <Banknote size={56} style={{ opacity: cart.length > 0 ? 1 : 0.4 }} />
            <span style={{ fontSize: "1.75rem", fontWeight: 700 }}>دفع نقداً</span>
            {cart.length > 0 && (
              <div style={{ background: "rgba(255,255,255,0.15)", padding: "0.5rem 1rem", borderRadius: "1rem", marginTop: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", opacity: 0.9, display: "block" }}>سعر الشراء الإجمالي</span>
                <span style={{ fontSize: "1.35rem", fontWeight: 800 }}>{formatCurrency(cashTotal)}</span>
              </div>
            )}
          </button>

          {/* Box 2: Credit Payment */}
          <button
            onClick={() => {
              if (cart.length > 0) {
                setShowCreditModal(true);
              }
            }}
            disabled={cart.length === 0}
            style={{
              background: cart.length > 0 ? "linear-gradient(135deg, #eab308, #ca8a04)" : "#f3f4f6",
              color: cart.length > 0 ? "white" : "#9ca3af",
              borderRadius: "1.5rem", border: "none",
              cursor: cart.length > 0 ? "pointer" : "not-allowed",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "1rem",
              boxShadow: cart.length > 0 ? "0 10px 25px rgba(234, 179, 8, 0.25)" : "none",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            className="pos-action-btn"
          >
            <CreditCard size={56} style={{ opacity: cart.length > 0 ? 1 : 0.4 }} />
            <span style={{ fontSize: "1.75rem", fontWeight: 700 }}>كريدي</span>
            {cart.length > 0 && (
              <div style={{ background: "rgba(255,255,255,0.15)", padding: "0.5rem 1rem", borderRadius: "1rem", marginTop: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", opacity: 0.9, display: "block" }}>سعر البيع الإجمالي</span>
                <span style={{ fontSize: "1.35rem", fontWeight: 800 }}>{formatCurrency(creditTotal)}</span>
              </div>
            )}
          </button>

        </div>
      </div>

      {/* RIGHT AREA: Cart Detail */}
      <div style={{
        flex: "0 0 40%", display: "flex", flexDirection: "column",
        background: "white", borderRadius: "1.25rem",
        boxShadow: "0 8px 24px rgba(23,35,28,0.06)", overflow: "hidden",
      }}>
        <div style={{
          padding: "1rem", borderBottom: "1px solid #f3f4f6",
          display: "flex", alignItems: "center", gap: "0.5rem",
        }}>
          <ShoppingCart size={20} color="#49a35c" />
          <span style={{ fontWeight: 600, color: "#17231c" }}>قائمة المبيعات السريعة</span>
          {cart.length > 0 && <span className="badge-green">{cart.length}</span>}
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              style={{ marginRight: "auto", background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "0.78rem" }}
            >
              إلغاء السلة
            </button>
          )}
        </div>

        {/* Cart items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem" }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: "center", padding: "4rem 2rem", color: "#9ca3af" }}>
              <ShoppingCart size={48} style={{ margin: "0 auto 1rem", opacity: 0.15 }} />
              <p style={{ fontSize: "0.9rem", fontWeight: 500 }}>السلة فارغة حالياً</p>
              <p style={{ fontSize: "0.78rem", marginTop: "0.25rem", color: "#cbd5e1" }}>يرجى مسح باركود المنتج أو كتابة اسمه أعلاه</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.625rem 0", borderBottom: "1px solid #f3f4f6",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#17231c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.productName}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#6b7280", display: "flex", gap: "0.5rem" }}>
                    <span>البيع: {formatCurrency(item.sellingPrice)}</span>
                    <span style={{ color: "#49a35c" }}>الشراء: {formatCurrency(item.purchasePrice)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <button
                    onClick={() => updateQty(item.productId, -1)}
                    style={{ width: "24px", height: "24px", borderRadius: "50%", border: "1px solid #e5e7eb", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Minus size={12} />
                  </button>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, minWidth: "24px", textAlign: "center" }}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQty(item.productId, 1)}
                    style={{ width: "24px", height: "24px", borderRadius: "50%", border: "1px solid #49a35c", background: "#f1f8ee", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#49a35c" }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#26683a", minWidth: "75px", textAlign: "left" }}>
                  {formatCurrency(item.sellingPrice * item.quantity)}
                </div>
                <button onClick={() => removeItem(item.productId)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: "0.25rem" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Discount handler */}
        {cart.length > 0 && (
          <div style={{ padding: "0.75rem", borderTop: "1px solid #f3f4f6", background: "#f9fafb" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.8rem", color: "#4b5563", fontWeight: 600 }}>إدخال خصم (د.ج):</span>
              <input
                type="number"
                min="0"
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value))}
                placeholder="0"
                style={{
                  flex: 1, border: "1px solid #e5e7eb", borderRadius: "0.375rem",
                  padding: "0.25rem 0.5rem", fontSize: "0.8rem", direction: "ltr", textAlign: "left",
                  background: "white"
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Cash Sale Modal (سعر الشراء) */}
      {showCashModal && (
        <div className="modal-overlay" onClick={() => setShowCashModal(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h2 style={{ fontWeight: 700, color: "#26683a" }}>تأكيد الدفع نقداً (سعر الشراء)</h2>
              <button onClick={() => setShowCashModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>

            <div style={{ background: "#f0fdf4", borderRadius: "0.75rem", padding: "1rem", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ color: "#4b5563" }}>عدد المواد</span>
                <span style={{ fontWeight: 700 }}>{cart.reduce((sum, i) => sum + i.quantity, 0)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ color: "#4b5563" }}>سعر الشراء الأصلي</span>
                <span>{formatCurrency(cashSubtotal)}</span>
              </div>
              {discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ color: "#dc2626" }}>الخصم المطبق</span>
                  <span style={{ color: "#dc2626", fontWeight: 600 }}>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: "0.75rem", paddingTop: "0.75rem", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 800, fontSize: "1.05rem" }}>المبلغ المطلوب (نقداً)</span>
                <span style={{ fontWeight: 800, fontSize: "1.35rem", color: "#166534" }}>{formatCurrency(cashTotal)}</span>
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label className="label">ملاحظات الفاتورة</label>
              <input
                className="input-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثال: بيع بسعر الشراء للأقارب..."
              />
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setShowCashModal(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>إلغاء</button>
              <button
                onClick={handleCashSale}
                disabled={loading}
                className="btn-primary"
                style={{ flex: 2, justifyContent: "center" }}
              >
                <Printer size={16} /> {loading ? "تسجيل..." : "تأكيد وطباعة الفاتورة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Sale Modal (كريدي - تظهر حسابات الناس) */}
      {showCreditModal && (
        <div className="modal-overlay" onClick={() => setShowCreditModal(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "460px", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontWeight: 700, color: "#854d0e" }}>البيع بالكريدي للعملاء</h2>
              <button onClick={() => setShowCreditModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>

            <div style={{ background: "#fef9c3", borderRadius: "0.75rem", padding: "0.875rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>مبلغ الكريدي الإجمالي (سعر البيع):</span>
                <span style={{ color: "#854d0e", fontSize: "1.1rem" }}>{formatCurrency(creditTotal)}</span>
              </div>
            </div>

            {/* Customer Search inside credit dialog */}
            <div style={{ marginBottom: "0.75rem" }}>
              <label className="label">ابحث عن حساب العميل:</label>
              <input
                className="input-field"
                placeholder="اكتب اسم العميل لتصفيته..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </div>

            {/* Customer List Select */}
            <div style={{
              border: "1px solid #e5e7eb", borderRadius: "0.75rem",
              maxHeight: "220px", overflowY: "auto", marginBottom: "1rem"
            }}>
              {filteredCustomers.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "#9ca3af", fontSize: "0.85rem" }}>
                  لا يوجد عميل بهذا الاسم
                </div>
              ) : (
                filteredCustomers.map((c) => {
                  const isSelected = selectedCustomer === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCustomer(c.id)}
                      style={{
                        width: "100%", padding: "0.75rem 1rem", border: "none",
                        background: isSelected ? "#fef9c3" : "none",
                        borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        textAlign: "right", transition: "background 0.1s"
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: "#17231c", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          {isSelected && <UserCheck size={16} color="#ca8a04" />}
                          {c.name}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>هاتف: {c.phone || "—"}</div>
                      </div>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.85rem", color: c.totalDebt > 0 ? "#dc2626" : "#4b5563" }}>
                          الدين الحالي: {formatCurrency(c.totalDebt)}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "#9ca3af" }}>الحد: {formatCurrency(c.creditLimit)}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label className="label">ملاحظات</label>
              <input
                className="input-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ملاحظات اختيارية..."
              />
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setShowCreditModal(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>إلغاء</button>
              <button
                onClick={handleCreditSale}
                disabled={loading || !selectedCustomer}
                className="btn-primary"
                style={{
                  flex: 2, justifyContent: "center",
                  background: selectedCustomer ? "#ca8a04" : "#e5e7eb",
                  borderColor: selectedCustomer ? "#ca8a04" : "#e5e7eb"
                }}
              >
                <Printer size={16} /> {loading ? "تسجيل..." : "تأكيد وطباعة الكريدي"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
