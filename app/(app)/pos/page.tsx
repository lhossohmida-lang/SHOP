"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useCredits } from "@/hooks/useCredits";
import { useUsbScanner } from "@/hooks/useUsbScanner";
import { usePosCart } from "@/hooks/usePosCart";
import { addSale } from "@/lib/firestore/sales";
import { updateStock } from "@/lib/firestore/products";
import { addCreditTransaction, updateCreditCustomer } from "@/lib/firestore/credits";
import { generateReceiptNumber } from "@/lib/utils/date";
import { printReceipt } from "@/lib/utils/print";
import BarcodeScanner from "@/components/pos/BarcodeScanner";
import PosTable from "@/components/pos/PosTable";
import PosSummary from "@/components/pos/PosSummary";
import { Search, Camera, ScanLine, X, UserCheck, Trash2 } from "lucide-react";
import type { Sale } from "@/types/sale";
import type { Product } from "@/types/product";

export default function PosPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { activeProducts } = useProducts(storeId);
  const { activeCustomers } = useCredits(storeId);

  const cart = usePosCart();
  const [mode, setMode] = useState<"cash" | "credit">("cash");
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  // Credit customer selection
  const [showCreditPanel, setShowCreditPanel] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; totalDebt: number; creditLimit: number } | null>(null);
  const [custSearch, setCustSearch] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // Listen for sidebar shortcut addition
  useEffect(() => {
    const handleShortcutAdd = (e: Event) => {
      const p = (e as CustomEvent).detail as Product;
      if (p) {
        cart.addProduct(p);
      }
    };
    window.addEventListener("add-shortcut-product", handleShortcutAdd);
    return () => window.removeEventListener("add-shortcut-product", handleShortcutAdd);
  }, [cart]);

  // F1 → open new POS window
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        window.open(window.location.href, "_blank", "width=1200,height=800,menubar=no,toolbar=no,status=no");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const suggestions = search.trim().length > 0
    ? activeProducts.filter(p =>
        p.nameAr.includes(search) ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode && p.barcode.includes(search))
      ).slice(0, 8)
    : [];

  const handleBarcode = useCallback((code: string) => {
    const p = activeProducts.find(p => p.barcode === code.trim());
    if (p) { cart.addProduct(p); setSearch(""); setShowDropdown(false); }
    else { setSearch(code); setShowDropdown(true); }
    setShowCamera(false);
  }, [activeProducts, cart]);

  useUsbScanner(handleBarcode, !showCamera && !showCreditPanel);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const processLines = (useSellingPrice: boolean) =>
    cart.lines
      .filter(l => l.quantity > 0)
      .map(l => ({
        productId: l.productId,
        productName: l.productName,
        quantity: l.quantity,
        unitPrice: useSellingPrice ? l.sellingPrice : l.purchasePrice,
        totalPrice: (useSellingPrice ? l.sellingPrice : l.purchasePrice) * l.quantity,
      }));

  const handleConfirm = async () => {
    if (!storeId || cart.lines.length === 0) return;
    if (mode === "credit" && !selectedCustomer) {
      setShowCreditPanel(true);
      return;
    }
    setLoading(true);
    try {
      const isCash = mode === "cash";
      const items = processLines(!isCash);
      
      if (items.length === 0) {
        showMsg("❌ خطأ: لا توجد منتجات صالحة للبيع بالسلّة");
        setLoading(false);
        return;
      }

      const subtotal = isCash ? cart.buySubtotal : cart.sellSubtotal;
      const total = isCash ? cart.buyTotal : cart.sellTotal;
      const receiptNumber = generateReceiptNumber();

      const saleData: Omit<Sale, "id" | "createdAt"> = {
        type: "sale", items, subtotal,
        discount: cart.effectiveDiscount, tax: 0, total,
        paymentMethod: isCash ? "cash" : "credit",
        customerId: selectedCustomer?.id || "",
        customerName: selectedCustomer?.name || "",
        cashierId: appUser!.uid,
        cashierName: appUser!.displayName,
        receiptNumber, storeId,
      };

      const saleId = await addSale(storeId, saleData);

      for (const l of cart.lines.filter(l => l.quantity > 0)) {
        await updateStock(storeId, l.productId, -l.quantity);
      }

      if (mode === "credit" && selectedCustomer) {
        const balanceBefore = selectedCustomer.totalDebt;
        const balanceAfter = balanceBefore + total;
        await addCreditTransaction(storeId, {
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          type: "purchase",
          amount: total, balanceBefore, balanceAfter,
          saleId, createdBy: appUser!.uid,
        });
        await updateCreditCustomer(storeId, selectedCustomer.id, {
          totalDebt: balanceAfter, lastTransactionAt: new Date(),
        });
      }

      printReceipt({ ...saleData, id: saleId, createdAt: new Date() });
      cart.clearCart();
      setSelectedCustomer(null);
      showMsg(`✅ تم البيع — ${receiptNumber}`);
    } catch (e) {
      showMsg("❌ خطأ: " + e);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = activeCustomers.filter(c =>
    !custSearch || c.name.includes(custSearch) || c.phone.includes(custSearch)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", gap: "0.75rem" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "1rem", left: "50%", transform: "translateX(-50%)",
          padding: "0.75rem 1.5rem", borderRadius: "0.75rem", zIndex: 200,
          background: toast.startsWith("❌") ? "#dc2626" : "#26683a",
          color: "white", fontWeight: 600, fontSize: "0.875rem",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}>{toast}</div>
      )}

      {showCamera && (
        <BarcodeScanner onScan={handleBarcode} onClose={() => setShowCamera(false)} />
      )}

      {/* Top: Search bar + mode tabs */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        {/* Mode tabs */}
        <div style={{ display: "flex", borderRadius: "0.625rem", overflow: "hidden", border: "1px solid #e5e7eb", flexShrink: 0 }}>
          {(["cash", "credit"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "0.6rem 1.1rem", border: "none", cursor: "pointer",
                fontWeight: mode === m ? 700 : 400, fontSize: "0.85rem",
                background: mode === m
                  ? m === "cash" ? "#26683a" : "#ca8a04"
                  : "white",
                color: mode === m ? "white" : "#6b7280",
                transition: "all 0.15s",
              }}
            >
              {m === "cash" ? "💵 بيع نقدي" : "📋 بيع كريدي"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={17} style={{
            position: "absolute", right: "0.75rem", top: "50%",
            transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none"
          }} />
          <input
            ref={searchRef}
            className="input-field"
            style={{ paddingRight: "2.25rem", paddingLeft: "0.875rem" }}
            placeholder="ابحث بالاسم أو الباركود، أو امسح مباشرة..."
            value={search}
            autoComplete="off"
            onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={e => {
              if (e.key === "Enter" && suggestions.length > 0) {
                cart.addProduct(suggestions[0]);
                setSearch(""); setShowDropdown(false);
              }
              if (e.key === "Escape") { setSearch(""); setShowDropdown(false); }
            }}
          />
          {search && (
            <button onClick={() => { setSearch(""); setShowDropdown(false); }}
              style={{ position: "absolute", left: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
              <X size={15} />
            </button>
          )}
          {/* Dropdown suggestions */}
          {showDropdown && suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", right: 0, left: 0, zIndex: 50,
              background: "white", border: "1px solid #e5e7eb", borderRadius: "0.625rem",
              boxShadow: "0 8px 24px rgba(0,0,0,0.1)", marginTop: "4px", maxHeight: "220px", overflowY: "auto"
            }}>
              {suggestions.map(p => (
                <button key={p.id} onMouseDown={() => { cart.addProduct(p); setSearch(""); setShowDropdown(false); }}
                  style={{
                    width: "100%", padding: "0.6rem 0.875rem", background: "none", border: "none",
                    textAlign: "right", cursor: "pointer", display: "flex", justifyContent: "space-between",
                    alignItems: "center", borderBottom: "1px solid #f3f4f6", fontSize: "0.875rem",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f8fdf5")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "#17231c" }}>{p.nameAr || p.name}</div>
                    {p.barcode && <div style={{ fontSize: "0.7rem", color: "#9ca3af", fontFamily: "monospace" }}>{p.barcode}</div>}
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 700, color: "#26683a" }}>{p.sellingPrice} د.ج</div>
                    <div style={{ fontSize: "0.7rem", color: p.stock <= p.minStock ? "#dc2626" : "#9ca3af" }}>{p.stock} {p.unit}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Camera + USB */}
        <button onClick={() => setShowCamera(true)}
          style={{ padding: "0.6rem 0.875rem", borderRadius: "0.5rem", border: "1px solid #c5e5b8", background: "#f1f8ee", color: "#26683a", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.82rem", fontWeight: 500, whiteSpace: "nowrap" }}>
          <Camera size={17} /> كاميرا
        </button>
        <button onClick={() => searchRef.current?.focus()}
          style={{ padding: "0.6rem 0.875rem", borderRadius: "0.5rem", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
          <ScanLine size={17} /> USB
        </button>
        {cart.lines.length > 0 && (
          <button onClick={cart.clearCart}
            style={{ padding: "0.6rem 0.875rem", borderRadius: "0.5rem", border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
            <Trash2 size={15} /> مسح الكل
          </button>
        )}
      </div>

      {/* Credit customer bar (when credit mode) */}
      {mode === "credit" && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "0.625rem 1rem", background: "#fef9c3",
          borderRadius: "0.625rem", border: "1px solid #fde68a",
        }}>
          <UserCheck size={18} color="#92400e" />
          <span style={{ fontSize: "0.85rem", color: "#78350f", fontWeight: 500 }}>
            {selectedCustomer ? `العميل: ${selectedCustomer.name} — دين حالي: ${selectedCustomer.totalDebt} د.ج` : "لم يتم اختيار عميل بعد"}
          </span>
          <button onClick={() => setShowCreditPanel(true)}
            style={{ marginRight: "auto", padding: "0.35rem 0.75rem", borderRadius: "0.375rem", border: "1px solid #fbbf24", background: "white", color: "#92400e", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>
            {selectedCustomer ? "تغيير العميل" : "اختر عميل"}
          </button>
        </div>
      )}

      {/* Main area: table + summary */}
      <div style={{ display: "flex", gap: "0.75rem", flex: 1, overflow: "hidden" }}>

        {/* Left: table */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem", overflow: "hidden" }}>

          {/* Products table */}
          <div style={{
            flex: 1, background: "white", borderRadius: "1rem",
            boxShadow: "0 4px 16px rgba(23,35,28,0.06)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{ padding: "0.875rem 1rem", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontWeight: 700, color: "#17231c" }}>الفاتورة</span>
              {cart.lines.length > 0 && (
                <span className="badge-green">{cart.lines.length} صنف</span>
              )}
              <span style={{ marginRight: "auto", fontSize: "0.72rem", color: "#9ca3af", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                اضغط <kbd style={{ padding: "1px 4px", borderRadius: "3px", border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: "0.7rem", fontFamily: "monospace" }}>F1</kbd> لفتح نافذة بيع جديدة
              </span>
            </div>
            <PosTable
              lines={cart.lines}
              mode={mode}
              onQty={cart.updateQty}
              onRemove={cart.removeLine}
            />
          </div>
        </div>

        {/* Summary panel */}
        <PosSummary
          mode={mode}
          subtotal={mode === "cash" ? cart.buySubtotal : cart.sellSubtotal}
          total={mode === "cash" ? cart.buyTotal : cart.sellTotal}
          discount={cart.effectiveDiscount}
          discountValue={cart.discountValue}
          discountPct={cart.discountPct}
          itemCount={cart.itemCount}
          onDiscountValue={cart.setDiscountValue}
          onDiscountPct={cart.setDiscountPct}
          onClear={cart.clearCart}
          onConfirm={handleConfirm}
          loading={loading}
          disabled={cart.lines.length === 0}
        />
      </div>

      {/* Credit Customer Selection Panel */}
      {showCreditPanel && (
        <div className="modal-overlay" onClick={() => setShowCreditPanel(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "440px", maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h2 style={{ fontWeight: 700 }}>اختيار العميل للكريدي</h2>
              <button onClick={() => setShowCreditPanel(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <input
              className="input-field"
              placeholder="ابحث باسم العميل أو هاتفه..."
              value={custSearch}
              onChange={e => setCustSearch(e.target.value)}
              style={{ marginBottom: "0.75rem" }}
              autoFocus
            />
            <div style={{ flex: 1, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "0.625rem" }}>
              {filteredCustomers.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>لا يوجد عميل مطابق</div>
              ) : filteredCustomers.map(c => {
                const sel = selectedCustomer?.id === c.id;
                return (
                  <button key={c.id} onClick={() => { setSelectedCustomer({ id: c.id, name: c.name, totalDebt: c.totalDebt, creditLimit: c.creditLimit }); setShowCreditPanel(false); setCustSearch(""); }}
                    style={{
                      width: "100%", padding: "0.75rem 1rem", background: sel ? "#fef9c3" : "none",
                      border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                      display: "flex", justifyContent: "space-between", textAlign: "right",
                    }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "#17231c", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        {sel && <UserCheck size={15} color="#ca8a04" />} {c.name}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>📞 {c.phone || "—"}</div>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: 700, color: c.totalDebt > 0 ? "#dc2626" : "#26683a", fontSize: "0.85rem" }}>
                        {c.totalDebt} د.ج
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "#9ca3af" }}>حد: {c.creditLimit} د.ج</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
