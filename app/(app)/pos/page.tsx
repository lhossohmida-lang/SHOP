"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useCredits } from "@/hooks/useCredits";
import { useUsbScanner } from "@/hooks/useUsbScanner";
import { usePosCart, lineTotal } from "@/hooks/usePosCart";
import { addSale } from "@/lib/firestore/sales";
import { updateStock } from "@/lib/firestore/products";
import { addCreditTransaction, updateCreditCustomer } from "@/lib/firestore/credits";
import { offlineAwareAwait } from "@/lib/firestore/helpers";
import { generateReceiptNumber } from "@/lib/utils/date";
import { normalizeDigits, normalizeScannedDigits, productHasBarcode, productMatchesBarcodeSearch } from "@/lib/utils/barcode";
import { printReceipt } from "@/lib/utils/print";
import BarcodeScanner from "@/components/pos/BarcodeScanner";
import PosTable from "@/components/pos/PosTable";
import PosSummary from "@/components/pos/PosSummary";
import { Search, Camera, ScanLine, X, UserCheck, Trash2, PackagePlus, Lock } from "lucide-react";
import type { Sale } from "@/types/sale";
import type { Product } from "@/types/product";

const STOCK_PIN = "0000";

export default function PosPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { activeProducts } = useProducts(storeId);
  const { activeCustomers } = useCredits(storeId);

  const cart = usePosCart();
  const { addProduct } = cart;
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
  const [activeMobileTab, setActiveMobileTab] = useState<"cart" | "checkout">("cart");

  // Zero-stock modal
  const [outOfStockProduct, setOutOfStockProduct] = useState<Product | null>(null);
  const [stockPin, setStockPin] = useState("");
  const [stockQty, setStockQty] = useState("1");
  const [stockPinError, setStockPinError] = useState("");
  const [stockLoading, setStockLoading] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  // عند الطباعة على سطح المكتب تفقد النافذة التركيز؛ نعيده لخانة البحث عند عودة التركيز.
  const wantSearchFocusRef = useRef(false);

  // المنتج الذي يجب تركيز حقله بعد الإضافة (nonce يتغيّر مع كل إضافة لإعادة التركيز).
  const [amountFocus, setAmountFocus] = useState<{ id: string; nonce: number }>({ id: "", nonce: 0 });
  // الاقتراح المحدَّد في قائمة البحث (للتنقّل بأسهم لوحة المفاتيح).
  const [selIdx, setSelIdx] = useState(0);

  // الوجهة الدائمة بعد أي عملية: خانة البحث (لقراءة باركود/اسم جديد).
  const focusSearch = useCallback(() => {
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  // إعادة التركيز لخانة البحث عند عودة تركيز النافذة بعد نافذة الطباعة (سطح المكتب).
  useEffect(() => {
    const onWinFocus = () => {
      if (wantSearchFocusRef.current) {
        wantSearchFocusRef.current = false;
        setTimeout(() => searchRef.current?.focus(), 50);
      }
    };
    window.addEventListener("focus", onWinFocus);
    return () => window.removeEventListener("focus", onWinFocus);
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const tryAddProduct = useCallback((p: Product) => {
    if (p.stock <= 0) {
      // Show the out-of-stock modal instead of just a toast
      setOutOfStockProduct(p);
      setStockPin("");
      setStockQty("1");
      setStockPinError("");
      return false;
    }
    if (!addProduct(p)) {
      showMsg("❌ المنتج نفد من المخزون ولا يمكن إدخاله");
      return false;
    }
    // بعد الإضافة يبقى التركيز في خانة البحث (فارغة) للمسح/الكتابة التالية.
    // للتعديل على الكمية/السعر: السهم لأسفل من خانة البحث ينقلك إلى السلة.
    return true;
  }, [addProduct]);

  // النزول من خانة البحث إلى السلة (آخر منتج مُضاف) لتعديل كميته/سعره.
  const focusCartFromSearch = useCallback(() => {
    const last = cart.lines[cart.lines.length - 1];
    if (last) setAmountFocus(f => ({ id: last.productId, nonce: f.nonce + 1 }));
  }, [cart.lines]);

  const handleAddStockFromPos = useCallback(async () => {
    if (!storeId || !outOfStockProduct) return;
    if (stockPin !== STOCK_PIN) {
      setStockPinError("كلمة السر غير صحيحة");
      return;
    }
    const qty = parseInt(stockQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setStockPinError("أدخل كمية صحيحة");
      return;
    }
    setStockLoading(true);
    try {
      await offlineAwareAwait(updateStock(storeId, outOfStockProduct.id, qty), 2000);
      showMsg(`✅ تمت إضافة ${qty} وحدة لـ ${outOfStockProduct.nameAr || outOfStockProduct.name}`);
      setOutOfStockProduct(null);
      focusSearch();
    } catch (e) {
      setStockPinError("حدث خطأ أثناء التحديث");
    } finally {
      setStockLoading(false);
    }
  }, [storeId, outOfStockProduct, stockPin, stockQty, focusSearch]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // Listen for sidebar shortcut addition
  useEffect(() => {
    const handleShortcutAdd = (e: Event) => {
      const p = (e as CustomEvent).detail as Product;
      if (p) {
        tryAddProduct(p);
        focusSearch(); // العودة لخانة البحث بعد الاختصار (للمسح/الكتابة التالية)
      }
    };
    window.addEventListener("add-shortcut-product", handleShortcutAdd);
    return () => window.removeEventListener("add-shortcut-product", handleShortcutAdd);
  }, [tryAddProduct, focusSearch]);

  // F1 → نافذة بيع جديدة، F2 → بيع كريدي + فتح اختيار العميل (كأنك ضغطت "اختر عميل")
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        window.open(window.location.href, "_blank", "width=1200,height=800,menubar=no,toolbar=no,status=no");
      } else if (e.key === "F2") {
        e.preventDefault();
        setMode("credit");
        setShowCreditPanel(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);


  const suggestions = search.trim().length > 0
    ? activeProducts.filter(p =>
        p.nameAr.includes(search) ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        productMatchesBarcodeSearch(p, search)
      ).slice(0, 8)
    : [];

  const handleBarcode = useCallback((code: string) => {
    const normalized = normalizeScannedDigits(code.trim());
    const p = activeProducts.find(p => productHasBarcode(p, normalized));
    if (p) {
      if (tryAddProduct(p)) { setSearch(""); setShowDropdown(false); }
    } else { setSearch(normalized); setShowDropdown(true); }
    setShowCamera(false);
  }, [activeProducts, tryAddProduct]);

  useUsbScanner(handleBarcode, !showCamera && !showCreditPanel);

  const processLines = () =>
    cart.lines
      .filter(l => l.quantity > 0)
      .map(l => ({
        productId: l.productId,
        productName: l.productName,
        quantity: l.quantity,
        unitPrice: l.sellingPrice,
        totalPrice: lineTotal(l),
      }));

  const handleConfirm = useCallback(async (shouldPrint: boolean = true) => {
    if (!storeId || cart.lines.length === 0) return;
    if (mode === "credit" && !selectedCustomer) {
      setShowCreditPanel(true);
      return;
    }
    setLoading(true);
    try {
      const isCash = mode === "cash";
      const items = processLines();

      if (items.length === 0) {
        showMsg("❌ خطأ: لا توجد منتجات صالحة للبيع بالسلّة");
        setLoading(false);
        return;
      }

      const subtotal = cart.sellSubtotal;
      const total = cart.sellTotal;
      const receiptNumber = generateReceiptNumber();
      const now = new Date();
      
      // Store cart lines before clearing
      const cartLines = [...cart.lines];

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

      // addSale يُولِّد الـ ID فوراً محلياً (doc()+setDoc()) فيكون saleId صحيحاً دائماً
      const actualSaleId = addSale(storeId, saleData);
      const saleWithTimestamp: Sale = { ...saleData, id: actualSaleId, createdAt: now };

      // Clear cart and show success immediately
      cart.clearCart();
      setSelectedCustomer(null);
      setActiveMobileTab("cart");
      showMsg(`✅ تم البيع — ${receiptNumber}`);
      setLoading(false);
      // الوجهة الدائمة: خانة البحث بعد كل عملية بيع
      focusSearch();

      // Print immediately
      if (shouldPrint) {
        wantSearchFocusRef.current = true; // أعد التركيز لخانة البحث بعد إغلاق نافذة الطباعة
        printReceipt(saleWithTimestamp);
      }

      // Save stock deductions and credit in background (don't wait).
      // كل خطوة مستقلة: فشل خصم مخزون منتج لا يجب أن يمنع تسجيل الكريدي أو خصم باقي المنتجات.
      const creditCustomer = mode === "credit" ? selectedCustomer : null;
      (async () => {
        // 1) خصم المخزون — يُطبَّق على الكاش المحلي فوراً فيظهر الخصم حتى دون اتصال.
        for (const l of cartLines.filter(l => l.quantity > 0)) {
          try {
            await updateStock(storeId, l.productId, -l.quantity);
          } catch (e) {
            console.error("updateStock failed for", l.productId, e);
          }
        }

        // 3) تسجيل الكريدي — يُستدعى دون انتظار تأكيد الخادم (يُطبَّق محلياً ويتزامن لاحقاً)
        //    حتى يظهر الدين فوراً عند البيع بالحساب ولو دون اتصال.
        if (creditCustomer) {
          const balanceBefore = creditCustomer.totalDebt;
          const balanceAfter = balanceBefore + total;
          addCreditTransaction(storeId, {
            customerId: creditCustomer.id,
            customerName: creditCustomer.name,
            type: "purchase",
            amount: total, balanceBefore, balanceAfter,
            saleId: actualSaleId, createdBy: appUser!.uid,
          }); // fire-and-forget — يُطبَّق فوراً على الكاش المحلي
          updateCreditCustomer(storeId, creditCustomer.id, {
            totalDebt: balanceAfter, lastTransactionAt: new Date(),
          });
        }
      })();
    } catch (e) {
      showMsg("❌ خطأ: " + e);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, mode, selectedCustomer, cart, appUser]);

  const handleConfirmOnly = useCallback(async () => {
    await handleConfirm(false);
  }, [handleConfirm]);

  const handleConfirmAndPrint = useCallback(async () => {
    await handleConfirm(true);
  }, [handleConfirm]);

  // F9 → confirm + print, F10 → confirm without print (after handleConfirm is defined)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        e.preventDefault();
        handleConfirm(true); // تأكيد الطلبية مع الطباعة
      } else if (e.key === "F10") {
        e.preventDefault();
        handleConfirm(false); // تأكيد الطلبية دون أي طباعة
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleConfirm]);

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
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        {/* Mode & Action buttons grouped for mobile layout */}
        <div className="flex flex-wrap gap-2 items-center justify-between md:justify-start shrink-0">
          {/* Mode tabs */}
          <div style={{ display: "flex", borderRadius: "0.625rem", overflow: "hidden", border: "1px solid #e5e7eb" }}>
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

          {/* Action buttons (Camera, USB, Clear) */}
          <div className="flex gap-1.5 items-center">
            <button onClick={() => setShowCamera(true)}
              style={{ padding: "0.6rem 0.875rem", borderRadius: "0.5rem", border: "1px solid #c5e5b8", background: "#f1f8ee", color: "#26683a", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.82rem", fontWeight: 500, whiteSpace: "nowrap" }}>
              <Camera size={17} /> كاميرا
            </button>
            <button onClick={() => searchRef.current?.focus()}
              style={{ padding: "0.6rem 0.875rem", borderRadius: "0.5rem", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
              <ScanLine size={17} /> USB
            </button>
            {cart.lines.length > 0 && (
              <button onClick={() => { cart.clearCart(); focusSearch(); }}
                style={{ padding: "0.6rem 0.875rem", borderRadius: "0.5rem", border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                <Trash2 size={15} /> مسح الكل
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1">
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
            onChange={e => { setSearch(normalizeDigits(e.target.value)); setShowDropdown(true); setSelIdx(0); }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={e => {
              // السهم لأسفل: تنقّل الاقتراحات إن وُجدت، وإلا انزل إلى السلة للتعديل
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (suggestions.length > 0) {
                  setShowDropdown(true);
                  setSelIdx(i => Math.min(i + 1, suggestions.length - 1));
                } else {
                  focusCartFromSearch();
                }
                return;
              }
              if (e.key === "ArrowUp" && suggestions.length > 0) {
                e.preventDefault();
                setSelIdx(i => Math.max(i - 1, 0));
                return;
              }
              if (e.key === "Enter") {
                // الباركود الممسوح قد يصل برموز لوحة المفاتيح الفرنسية → حوّله لأرقام
                const trimmed = normalizeScannedDigits(search.trim());
                if (trimmed) {
                  const exactProduct = activeProducts.find(p => productHasBarcode(p, trimmed));
                  if (exactProduct) {
                    if (tryAddProduct(exactProduct)) {
                      setSearch("");
                      setShowDropdown(false);
                    }
                    e.preventDefault();
                    return;
                  }
                }
                if (suggestions.length > 0) {
                  const chosen = suggestions[Math.min(selIdx, suggestions.length - 1)];
                  if (tryAddProduct(chosen)) {
                    setSearch("");
                    setShowDropdown(false);
                    setSelIdx(0);
                  }
                  e.preventDefault();
                }
              }
              // Suppr/Delete في خانة البحث الفارغة = اختصار لمسح السلة كلها
              if (e.key === "Delete" && !search) {
                e.preventDefault();
                if (cart.lines.length > 0) {
                  cart.clearCart();
                  showMsg("🗑️ تم مسح السلة");
                }
                return;
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
              {suggestions.map((p, i) => (
                <button key={p.id} onMouseDown={(e) => { e.preventDefault(); if (tryAddProduct(p)) { setSearch(""); setShowDropdown(false); setSelIdx(0); searchRef.current?.focus(); } }}
                  onMouseEnter={() => setSelIdx(i)}
                  style={{
                    width: "100%", padding: "0.6rem 0.875rem",
                    background: i === Math.min(selIdx, suggestions.length - 1) ? "#eaf6e3" : "none",
                    border: "none", borderRight: i === Math.min(selIdx, suggestions.length - 1) ? "3px solid #49a35c" : "3px solid transparent",
                    textAlign: "right", cursor: "pointer", display: "flex", justifyContent: "space-between",
                    alignItems: "center", borderBottom: "1px solid #f3f4f6", fontSize: "0.875rem",
                  }}
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

      {/* Mobile Tab Switcher */}
      <div className="flex lg:hidden border border-gray-200 bg-white rounded-xl p-1 gap-1">
        <button
          onClick={() => setActiveMobileTab("cart")}
          style={{ transition: "all 0.2s" }}
          className={`flex-1 py-2 text-center rounded-lg text-xs font-bold ${
            activeMobileTab === "cart"
              ? "bg-[#26683a] text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          🛒 الفاتورة ({cart.lines.length} صنف)
        </button>
        <button
          onClick={() => setActiveMobileTab("checkout")}
          style={{ transition: "all 0.2s" }}
          className={`flex-1 py-2 text-center rounded-lg text-xs font-bold ${
            activeMobileTab === "checkout"
              ? "bg-[#26683a] text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          💰 الدفع ({mode === "cash" ? cart.buyTotal : cart.sellTotal} د.ج)
        </button>
      </div>

      {/* Main area: table + summary */}
      <div style={{ display: "flex", gap: "0.75rem", flex: 1, overflow: "hidden" }}>

        {/* Left: table */}
        <div 
          className={`${activeMobileTab === "cart" ? "flex" : "hidden lg:flex"}`}
          style={{ flex: 1, flexDirection: "column", gap: "0.5rem", overflow: "hidden" }}
        >
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
              <span style={{ marginRight: "auto", fontSize: "0.72rem", color: "#9ca3af", display: "flex", alignItems: "center", gap: "0.25rem", flexWrap: "wrap" }}>
                <kbd style={{ padding: "1px 4px", borderRadius: "3px", border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: "0.7rem", fontFamily: "monospace" }}>F1</kbd> نافذة &nbsp;|&nbsp; <kbd style={{ padding: "1px 4px", borderRadius: "3px", border: "1px solid #fde68a", background: "#fffbeb", fontSize: "0.7rem", fontFamily: "monospace", color: "#92400e" }}>F2</kbd> كريدي &nbsp;|&nbsp; <kbd style={{ padding: "1px 4px", borderRadius: "3px", border: "1px solid #c5e5b8", background: "#f1f8ee", fontSize: "0.7rem", fontFamily: "monospace", color: "#26683a" }}>F9</kbd> طباعة وتأكيد &nbsp;|&nbsp; <kbd style={{ padding: "1px 4px", borderRadius: "3px", border: "1px solid #c5e5b8", background: "#f1f8ee", fontSize: "0.7rem", fontFamily: "monospace", color: "#26683a" }}>F10</kbd> تأكيد بدون طباعة
              </span>
            </div>
            <PosTable
              lines={cart.lines}
              mode={mode}
              onQty={cart.updateQty}
              onAmount={cart.setLineAmount}
              onRemove={cart.removeLine}
              focusProductId={amountFocus.id}
              focusNonce={amountFocus.nonce}
              onReturnToSearch={focusSearch}
            />

            {/* Mobile-only go to checkout sticky button */}
            {cart.lines.length > 0 && (
              <div className="lg:hidden p-3 bg-white border-t border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-gray-500">إجمالي الفاتورة</div>
                  <div className="text-md font-extrabold text-[#26683a]">
                    {mode === "cash" ? cart.buyTotal : cart.sellTotal} د.ج
                  </div>
                </div>
                <button
                  onClick={() => setActiveMobileTab("checkout")}
                  className="bg-[#26683a] text-white px-4 py-2 rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5"
                >
                  الذهاب للدفع 💰
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Summary panel */}
        <div className={`shrink-0 w-full lg:w-auto ${activeMobileTab === "checkout" ? "flex" : "hidden lg:flex"}`}>
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
            onClear={() => { cart.clearCart(); focusSearch(); }}
            onConfirm={handleConfirmOnly}
            onConfirmAndPrint={handleConfirmAndPrint}
            loading={loading}
            disabled={cart.lines.length === 0}
          />
        </div>
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

      {/* Out-of-Stock Modal */}
      {outOfStockProduct && (
        <div className="modal-overlay" onClick={() => setOutOfStockProduct(null)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "400px" }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <PackagePlus size={18} color="#dc2626" />
                </div>
                <div>
                  <h2 style={{ fontWeight: 700, fontSize: "1rem", color: "#17231c", margin: 0 }}>نفد من المخزون</h2>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280" }}>يمكنك إضافة كمية بكلمة السر</p>
                </div>
              </div>
              <button onClick={() => setOutOfStockProduct(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><X size={20} /></button>
            </div>

            {/* Product name */}
            <div style={{ padding: "0.75rem 1rem", background: "#fef2f2", borderRadius: "0.625rem", marginBottom: "1rem", border: "1px solid #fecaca" }}>
              <div style={{ fontWeight: 700, color: "#991b1b", fontSize: "0.95rem" }}>
                {outOfStockProduct.nameAr || outOfStockProduct.name}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "0.25rem" }}>المخزون الحالي: 0 وحدة</div>
            </div>

            {/* PIN input */}
            <div style={{ marginBottom: "0.875rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>
                <Lock size={14} /> كلمة السر
              </label>
              <input
                type="password"
                className="input-field"
                placeholder="أدخل كلمة السر..."
                value={stockPin}
                onChange={e => { setStockPin(e.target.value); setStockPinError(""); }}
                onKeyDown={e => e.key === "Enter" && handleAddStockFromPos()}
                maxLength={4}
                autoFocus
                style={{ letterSpacing: "0.25rem", textAlign: "center", fontSize: "1.1rem" }}
              />
            </div>

            {/* Quantity input */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>
                الكمية المضافة
              </label>
              <input
                type="number"
                className="input-field"
                placeholder="الكمية"
                value={stockQty}
                min="1"
                onChange={e => { setStockQty(e.target.value); setStockPinError(""); }}
                onKeyDown={e => e.key === "Enter" && handleAddStockFromPos()}
                style={{ textAlign: "center", fontSize: "1rem" }}
              />
            </div>

            {/* Error */}
            {stockPinError && (
              <div style={{ padding: "0.5rem 0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.5rem", color: "#dc2626", fontSize: "0.8rem", marginBottom: "0.875rem", fontWeight: 600 }}>
                ⚠️ {stockPinError}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: "flex", gap: "0.625rem" }}>
              <button
                onClick={() => setOutOfStockProduct(null)}
                style={{ flex: 1, padding: "0.65rem", border: "1px solid #e5e7eb", borderRadius: "0.625rem", background: "white", color: "#6b7280", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}
              >
                إلغاء
              </button>
              <button
                onClick={handleAddStockFromPos}
                disabled={stockLoading}
                style={{ flex: 2, padding: "0.65rem", border: "none", borderRadius: "0.625rem", background: "linear-gradient(135deg, #26683a, #49a35c)", color: "white", fontWeight: 700, cursor: stockLoading ? "not-allowed" : "pointer", fontSize: "0.875rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem" }}
              >
                <PackagePlus size={16} />
                {stockLoading ? "جارٍ الإضافة..." : "إضافة للمخزون"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
