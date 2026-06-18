"use client";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getSalesByDateRange, returnSaleItems, deleteSaleAndRestoreStock } from "@/lib/firestore/sales";
import { getExpensesByDateRange } from "@/lib/firestore/expenses";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { BarChart3, Download, Search, Trash2, Receipt } from "lucide-react";
import type { Sale } from "@/types/sale";
import type { Expense } from "@/types/expense";
import PasswordGate from "@/components/layout/PasswordGate";
import { useProducts } from "@/hooks/useProducts";
import { useAjal } from "@/hooks/useAjal";

export default function ReportsPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { products: allProducts } = useProducts(storeId);
  const { totalDebt: ajalTotalDebt } = useAjal(storeId);

  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [payFilter, setPayFilter] = useState("الكل");
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  // نافذة الإرجاع (جزئي أو كلي) + نافذة الإلغاء الكامل + الكميات المُختارة لكل صنف + رسالة toast (بدل alert).
  const [saleToReturn, setSaleToReturn] = useState<Sale | null>(null);
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");
  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const fetchReport = async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      
      const [salesData, expensesData] = await Promise.all([
        getSalesByDateRange(storeId, start, end),
        getExpensesByDateRange(storeId, start, end),
      ]);
      
      setSales(salesData);
      setExpenses(expensesData);
      setFetched(true);
    } catch (e) {
      console.error("Error loading reports:", e);
      showMsg("⚠️ تعذّر تحميل التقارير — تحقّق من الاتصال وحاول مجدداً");
    } finally {
      setLoading(false);
    }
  };

  // فتح نافذة الإرجاع (تسمح بإرجاع صنف واحد، أو بعض الأصناف، أو كلها).
  const openReturn = (sale: Sale) => {
    setSaleToReturn(sale);
    setReturnQty({}); // تبدأ كل الكميات بصفر
  };

  // القيمة الحالية للمُرتجَع (للعرض الحيّ في النافذة)
  const returnPreviewValue = saleToReturn
    ? saleToReturn.items.reduce((sum, it) => {
        const rq = Math.min(returnQty[it.productId] || 0, it.quantity);
        const unit = it.quantity > 0 ? it.totalPrice / it.quantity : it.unitPrice;
        return sum + unit * rq;
      }, 0)
    : 0;

  const confirmReturn = async () => {
    const sale = saleToReturn;
    const qtys = returnQty;
    setSaleToReturn(null); // أغلق النافذة دائماً أولاً
    if (!sale || !storeId) return;

    const returns = sale.items
      .map((it) => ({ productId: it.productId, quantity: Math.min(qtys[it.productId] || 0, it.quantity) }))
      .filter((r) => r.quantity > 0);

    if (returns.length === 0) {
      showMsg("⚠️ حدّد كمية صنف واحد على الأقل للإرجاع");
      return;
    }

    const returnMap = new Map(returns.map((r) => [r.productId, r.quantity]));

    // احسب القيمة المُرتجَعة محلياً للتحديث التفاؤلي
    let returnedValue = 0;
    sale.items.forEach((it) => {
      const ret = returnMap.get(it.productId) || 0;
      const unit = it.quantity > 0 ? it.totalPrice / it.quantity : it.unitPrice;
      returnedValue += unit * ret;
    });

    // حدّث الواجهة فوراً (قلّص الفاتورة أو احذفها إن أُرجع كل شيء)
    setSales((prev) =>
      prev.flatMap((s) => {
        if (s.id !== sale.id) return [s];
        const newItems = s.items
          .map((it) => {
            const ret = returnMap.get(it.productId) || 0;
            if (ret <= 0) return it;
            const unit = it.quantity > 0 ? it.totalPrice / it.quantity : it.unitPrice;
            const newQty = it.quantity - ret;
            return { ...it, quantity: newQty, totalPrice: unit * newQty };
          })
          .filter((it) => it.quantity > 0);
        if (newItems.length === 0) return [];
        return [{ ...s, items: newItems, subtotal: Math.max(0, s.subtotal - returnedValue), total: Math.max(0, s.total - returnedValue) }];
      })
    );

    try {
      const res = await returnSaleItems(storeId, sale, returns);
      showMsg(
        res.allReturned
          ? `✅ تم إرجاع كل الأصناف وإلغاء الفاتورة ${sale.receiptNumber}`
          : `✅ تم إرجاع أصناف بقيمة ${formatCurrency(res.returnedValue)}`
      );
    } catch (e) {
      console.error("return error:", e);
      showMsg("⚠️ قد لا يكون الإرجاع حُفظ — حاول مجدداً");
    }
  };

  const confirmCancelSale = async () => {
    const sale = saleToCancel;
    setSaleToCancel(null);
    if (!sale || !storeId) return;

    // Remove from UI immediately (optimistic)
    setSales((prev) => prev.filter((s) => s.id !== sale.id));

    try {
      await deleteSaleAndRestoreStock(storeId, sale);
      showMsg(`✅ تم إلغاء الفاتورة ${sale.receiptNumber} بالكامل واستعادة مخزونها`);
    } catch (e) {
      console.error("Deletion error:", e);
      showMsg("⚠️ قد لا يكون إلغاء الفاتورة حُفظ — حاول مجدداً");
    }
  };

  const filtered = sales.filter(s => payFilter === "الكل" || s.paymentMethod === payFilter);
  const totalAmount = filtered.reduce((s, sale) => s + sale.total, 0);
  const cashTotal = filtered.filter(s => s.paymentMethod === "cash").reduce((s, sale) => s + sale.total, 0);
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const netTotal = totalAmount - expensesTotal;

  // رأس المال (تكلفة الشراء للأصناف المباعة) + الفائدة (هامش الربح)
  // نستخدم سعر الشراء الحالي للمنتجات تقريباً (أدق ما يمكن بدون تخزين السعر في كل فاتورة)
  const productPriceMap = useMemo(
    () => new Map(allProducts.map(p => [p.id, p.purchasePrice])),
    [allProducts]
  );
  // رأس المال = تكلفة شراء البضاعة المباعة نقداً/بطاقة فقط (رأس المال المُستردّ فعلاً).
  // مبيعات الكريدي لا تُحتسب: رأس مالها خرج كبضاعة ولم يرجع (دين)، وفائدتها لا تُسجَّل حتى يُدفع.
  const capitalTotal = useMemo(() => {
    return filtered.filter(s => s.paymentMethod !== "credit").reduce((total, sale) =>
      total + sale.items.reduce((s, item) =>
        s + (productPriceMap.get(item.productId) || 0) * item.quantity, 0), 0);
  }, [filtered, productPriceMap]);
  // تكلفة شراء بضاعة الكريدي (للعرض كملاحظة فقط) — رأس مال خرج ولم يُسترَدّ بعد
  const creditCapital = useMemo(() => {
    return filtered.filter(s => s.paymentMethod === "credit").reduce((total, sale) =>
      total + sale.items.reduce((s, item) =>
        s + (productPriceMap.get(item.productId) || 0) * item.quantity, 0), 0);
  }, [filtered, productPriceMap]);
  // مبيعات غير الكريدي (المحصّلة فعلاً) — الفائدة تُحسب منها فقط
  const nonCreditTotal = useMemo(
    () => filtered.filter(s => s.paymentMethod !== "credit").reduce((s, sale) => s + sale.total, 0),
    [filtered]
  );
  // الفائدة = ربح المبيعات المحصّلة فقط؛ مبيعات الكريدي لا تُسجَّل فائدتها حتى يُدفع الدين
  const grossProfit = nonCreditTotal - capitalTotal;

  const exportCSV = () => {
    const salesRows = [
      ["--- المبيعات ---"],
      ["رقم الوصل", "التاريخ", "الكاشير", "الأصناف", "الإجمالي", "طريقة الدفع"],
      ...filtered.map(s => [s.receiptNumber, formatDateTime(s.createdAt), s.cashierName, s.items.length, s.total, s.paymentMethod]),
      [],
      ["--- المصاريف ---"],
      ["الوصف", "التاريخ", "المبلغ", "ملاحظة"],
      ...expenses.map(e => [e.title, formatDateTime(e.createdAt), e.amount, e.note || ""]),
    ];
    const csv = salesRows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `تقرير-${startDate}-${endDate}.csv`; a.click();
  };

  return (
    <PasswordGate>
      <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>التقارير</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>تقارير المبيعات والمصاريف والأرباح</p>
        </div>
        {fetched && <button onClick={exportCSV} className="btn-secondary"><Download size={16} /> تصدير CSV</button>}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label className="label">من تاريخ</label>
            <input type="date" className="input-field" value={startDate} onChange={e => setStartDate(e.target.value)} dir="ltr" style={{ textAlign: "left" }} />
          </div>
          <div>
            <label className="label">إلى تاريخ</label>
            <input type="date" className="input-field" value={endDate} onChange={e => setEndDate(e.target.value)} dir="ltr" style={{ textAlign: "left" }} />
          </div>
          <div>
            <label className="label">طريقة الدفع</label>
            <select className="input-field" value={payFilter} onChange={e => setPayFilter(e.target.value)}>
              <option value="الكل">الكل</option>
              <option value="cash">نقداً</option>
              <option value="card">بطاقة</option>
              <option value="credit">آجل</option>
            </select>
          </div>
          <button onClick={fetchReport} disabled={loading} className="btn-primary" style={{ alignSelf: "flex-end" }}>
            <Search size={16} /> {loading ? "جارٍ التحميل..." : "عرض التقرير"}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {fetched && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
          {[
            { label: "إجمالي المبيعات", value: formatCurrency(totalAmount), color: "#49a35c", bg: "#f1f8ee" },
            { label: "نقداً", value: formatCurrency(cashTotal), color: "#26683a", bg: "#dff0d6" },
            { label: "عدد الفواتير", value: String(filtered.length), color: "#6b7280", bg: "#f9fafb" },
            { label: "إجمالي المصاريف", value: formatCurrency(expensesTotal), color: "#d97706", bg: "#fffbeb" },
            { label: "صافي (مبيعات − مصاريف)", value: formatCurrency(netTotal), color: netTotal >= 0 ? "#26683a" : "#dc2626", bg: netTotal >= 0 ? "#f0fdf4" : "#fff5f5" },
          ].map((s, i) => (
            <div key={i} className="card-sm" style={{ border: `1px solid ${s.bg}`, background: s.bg }}>
              <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.25rem" }}>{s.label}</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}

          {/* رأس المال + الفائدة */}
          <div className="card-sm" style={{ border: "1px solid #e0d7ff", background: "#f5f3ff", gridColumn: "span 1" }}>
            <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.4rem", fontWeight: 600 }}>رأس المال + الفائدة</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.7rem", color: "#7c3aed" }}>رأس المال</span>
                <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#7c3aed" }}>{formatCurrency(capitalTotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.7rem", color: "#059669" }}>الفائدة</span>
                <span style={{ fontSize: "0.95rem", fontWeight: 700, color: grossProfit >= 0 ? "#059669" : "#dc2626" }}>{formatCurrency(grossProfit)}</span>
              </div>
              {creditCapital > 0 && (
                <div style={{ fontSize: "0.66rem", color: "#d97706", textAlign: "right", marginTop: "0.1rem" }}>
                  ـ بضاعة كريدي برأس مال {formatCurrency(creditCapital)} (لم تُحتسب فائدتها)
                </div>
              )}
              {nonCreditTotal > 0 && (
                <div style={{ fontSize: "0.68rem", color: "#9ca3af", textAlign: "left", marginTop: "0.1rem" }}>
                  هامش {((grossProfit / nonCreditTotal) * 100).toFixed(1)}%
                </div>
              )}
            </div>
          </div>

          {/* كريديات آجلة */}
          <div className="card-sm" style={{ border: "1px solid #fde68a", background: "#fffbeb" }}>
            <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.25rem" }}>كريديات آجلة (إجمالي)</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: ajalTotalDebt > 0 ? "#d97706" : "#9ca3af" }}>{formatCurrency(ajalTotalDebt)}</div>
            <div style={{ fontSize: "0.68rem", color: "#9ca3af", marginTop: "0.15rem" }}>مجموع ديون الآجل المتراكمة</div>
          </div>
        </div>
      )}

      {/* Expenses Table */}
      {fetched && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#17231c", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Receipt size={18} color="#d97706" /> المصاريف في هذه الفترة
          </h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>الوصف</th>
                  <th>التاريخ</th>
                  <th>المسجّل بواسطة</th>
                  <th>ملاحظة</th>
                  <th>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "1.5rem", color: "#9ca3af" }}>
                      لا توجد مصاريف في هذه الفترة
                    </td>
                  </tr>
                ) : expenses.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}>{e.title}</td>
                    <td style={{ fontSize: "0.8rem", color: "#6b7280" }}>{formatDateTime(e.createdAt)}</td>
                    <td style={{ fontSize: "0.85rem" }}>{e.createdByName || "—"}</td>
                    <td style={{ fontSize: "0.8rem", color: "#6b7280" }}>{e.note || "—"}</td>
                    <td style={{ fontWeight: 700, color: "#d97706" }}>{formatCurrency(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sales Table */}
      {fetched && (
        <div className="table-container">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#17231c", marginBottom: "0.75rem" }}>المبيعات</h2>
          <table>
            <thead>
              <tr>
                <th>رقم الوصل</th>
                <th>التاريخ</th>
                <th>الكاشير</th>
                <th>الأصناف والتفاصيل</th>
                <th>الخصم</th>
                <th>الإجمالي</th>
                <th>طريقة الدفع</th>
                <th style={{ textAlign: "center" }}>إرجاع / إلغاء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>
                  <BarChart3 size={32} style={{ margin: "0 auto 0.5rem", opacity: 0.3 }} /><br />لا توجد بيانات في هذه الفترة
                </td></tr>
              ) : filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: "monospace", fontSize: "0.8rem", fontWeight: 600 }}>{s.receiptNumber}</td>
                  <td style={{ fontSize: "0.8rem", color: "#6b7280" }}>{formatDateTime(s.createdAt)}</td>
                  <td style={{ fontSize: "0.85rem" }}>{s.cashierName}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxWidth: "320px" }}>
                      <span className="badge-green" style={{ alignSelf: "flex-start", fontSize: "0.7rem", padding: "1px 6px" }}>
                        {s.items.length} {s.items.length === 1 ? "صنف" : "أصناف"}
                      </span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.25rem" }}>
                        {s.items.map((item, idx) => (
                          <span key={idx} style={{
                            fontSize: "0.72rem",
                            background: "#f3f4f6",
                            color: "#374151",
                            padding: "2px 6px",
                            borderRadius: "0.25rem",
                            border: "1px solid #e5e7eb",
                            fontWeight: 500,
                            whiteSpace: "nowrap"
                          }}>
                            {item.productName} × {item.quantity}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td style={{ color: "#dc2626", fontSize: "0.85rem" }}>{s.discount > 0 ? `-${formatCurrency(s.discount)}` : "—"}</td>
                  <td style={{ fontWeight: 700, color: "#26683a" }}>{formatCurrency(s.total)}</td>
                  <td><span className={s.paymentMethod === "credit" ? "badge-red" : s.paymentMethod === "card" ? "badge-yellow" : "badge-green"}>
                    {s.paymentMethod === "cash" ? "نقداً" : s.paymentMethod === "card" ? "بطاقة" : "آجل"}
                  </span></td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      onClick={() => openReturn(s)}
                      style={{
                        background: "#fff5f5",
                        border: "1px solid #fee2e2",
                        borderRadius: "0.375rem",
                        color: "#dc2626",
                        cursor: "pointer",
                        padding: "0.35rem 0.5rem",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = "#fee2e2";
                        e.currentTarget.style.transform = "scale(1.05)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = "#fff5f5";
                        e.currentTarget.style.transform = "";
                      }}
                      title="إلغاء الفاتورة وإرجاع الكميات للمخزون"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!fetched && (
        <div style={{ textAlign: "center", padding: "4rem", color: "#9ca3af" }}>
          <BarChart3 size={48} style={{ margin: "0 auto 1rem", opacity: 0.2 }} />
          <p>اختر نطاقاً زمنياً وانقر على "عرض التقرير"</p>
        </div>
      )}

      {/* Toast (بدل alert) */}
      {msg && (
        <div style={{
          position: "fixed", top: "1rem", left: "50%", transform: "translateX(-50%)",
          padding: "0.75rem 1.5rem", borderRadius: "0.75rem", zIndex: 200,
          background: msg.startsWith("⚠️") ? "#dc2626" : "#26683a",
          color: "white", fontWeight: 600, fontSize: "0.875rem",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)", maxWidth: "90vw", textAlign: "center",
        }}>{msg}</div>
      )}

      {/* نافذة الإرجاع الجزئي */}
      {saleToReturn && (
        <div className="modal-overlay" onClick={() => setSaleToReturn(null)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "500px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, marginBottom: "0.5rem", color: "#26683a", fontSize: "1.1rem" }}>
              إرجاع أصناف من الفاتورة رقم {saleToReturn.receiptNumber}
            </h3>
            <p style={{ color: "#6b7280", fontSize: "0.8rem", marginBottom: "1rem" }}>
              {saleToReturn.customerName ? `الزبون: ${saleToReturn.customerName} | ` : ""}
              طريقة الدفع: {saleToReturn.paymentMethod === "cash" ? "نقداً" : saleToReturn.paymentMethod === "card" ? "بطاقة" : "آجل"}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "280px", overflowY: "auto", marginBottom: "1rem", paddingRight: "0.25rem" }}>
              {saleToReturn.items.map((item) => {
                const currentQty = returnQty[item.productId] || 0;
                const unitPrice = item.quantity > 0 ? item.totalPrice / item.quantity : item.unitPrice;
                return (
                  <div key={item.productId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem", background: "#f9fafb", borderRadius: "0.5rem", border: "1px solid #e5e7eb" }}>
                    <div style={{ flex: 1, paddingLeft: "0.5rem" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{item.productName}</div>
                      <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                        تم الشراء: {item.quantity} × {formatCurrency(unitPrice)}
                      </div>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <button 
                        onClick={() => setReturnQty(prev => ({
                          ...prev,
                          [item.productId]: Math.max(0, currentQty - 1)
                        }))}
                        style={{ width: "28px", height: "28px", borderRadius: "4px", border: "1px solid #c5e5b8", background: "#f1f8ee", color: "#26683a", cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        min="0"
                        max={item.quantity}
                        value={currentQty}
                        onChange={(e) => {
                          const val = Math.min(item.quantity, Math.max(0, parseInt(e.target.value) || 0));
                          setReturnQty(prev => ({ ...prev, [item.productId]: val }));
                        }}
                        style={{ width: "45px", textAlign: "center", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "2px 0", fontSize: "0.85rem" }}
                      />
                      <button 
                        onClick={() => setReturnQty(prev => ({
                          ...prev,
                          [item.productId]: Math.min(item.quantity, currentQty + 1)
                        }))}
                        style={{ width: "28px", height: "28px", borderRadius: "4px", border: "1px solid #c5e5b8", background: "#f1f8ee", color: "#26683a", cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        +
                      </button>
                      <button 
                        onClick={() => setReturnQty(prev => ({
                          ...prev,
                          [item.productId]: item.quantity
                        }))}
                        style={{ fontSize: "0.7rem", padding: "2px 6px", background: "#e5e7eb", border: "none", borderRadius: "4px", cursor: "pointer", color: "#374151" }}
                      >
                        الكل
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f3f4f6", paddingTop: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.85rem", color: "#4b5563" }}>
                إجمالي قيمة المرتجع:
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#dc2626" }}>
                {formatCurrency(returnPreviewValue)}
              </div>
            </div>

            {saleToReturn.paymentMethod === "credit" && returnPreviewValue > 0 && (
              <div style={{ fontSize: "0.75rem", color: "#dc2626", background: "#fff5f5", border: "1px solid #fee2e2", padding: "0.5rem", borderRadius: "0.375rem", marginBottom: "1rem" }}>
                ⚠️ ملاحظة: هذه مبيعة آجل (كريدي). سيتم خصم قيمة المرتجع ({formatCurrency(returnPreviewValue)}) تلقائياً من إجمالي دين الزبون.
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button onClick={() => setSaleToReturn(null)} className="btn-secondary" style={{ flex: 1, justifyContent: "center", minWidth: "80px" }}>
                إغلاق
              </button>
              <button 
                onClick={confirmReturn} 
                className="btn-primary" 
                disabled={returnPreviewValue === 0} 
                style={{ flex: 2, justifyContent: "center", minWidth: "120px" }}
              >
                تأكيد الإرجاع
              </button>
              <button 
                onClick={() => {
                  setSaleToCancel(saleToReturn);
                  setSaleToReturn(null);
                }} 
                className="btn-danger" 
                style={{ flex: 1.5, justifyContent: "center", minWidth: "120px" }}
              >
                إلغاء الفاتورة بالكامل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تأكيد إلغاء الفاتورة (بدل window.confirm المعطِّل) */}
      {saleToCancel && (
        <div className="modal-overlay" onClick={() => setSaleToCancel(null)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, marginBottom: "0.75rem", color: "#dc2626" }}>تأكيد إلغاء الفاتورة</h3>
            <p style={{ color: "#4b5563", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              هل أنت متأكد من إلغاء الفاتورة رقم <strong>{saleToCancel.receiptNumber}</strong> وإرجاع جميع منتجاتها إلى المخزون؟ لا يمكن التراجع.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setSaleToCancel(null)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>
                تراجع
              </button>
              <button onClick={confirmCancelSale} className="btn-danger" style={{ flex: 1, justifyContent: "center" }}>
                تأكيد الإلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PasswordGate>
  );
}
