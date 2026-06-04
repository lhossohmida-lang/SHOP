"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getSalesByDateRange, deleteSaleAndRestoreStock } from "@/lib/firestore/sales";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { BarChart3, Download, Search, Trash2 } from "lucide-react";
import type { Sale } from "@/types/sale";
import PasswordGate from "@/components/layout/PasswordGate";

export default function ReportsPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;

  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [payFilter, setPayFilter] = useState("الكل");
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchReport = async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const data = await getSalesByDateRange(storeId, start, end);
      setSales(data);
      setFetched(true);
    } catch (e) { alert("خطأ: " + e); }
    finally { setLoading(false); }
  };

  const handleDeleteSale = async (sale: Sale) => {
    const confirmDelete = window.confirm(`هل أنت متأكد من إلغاء الفاتورة رقم ${sale.receiptNumber} وإرجاع منتجاتها إلى المخزون؟`);
    if (!confirmDelete) return;

    try {
      await deleteSaleAndRestoreStock(storeId!, sale);
      setSales(prev => prev.filter(s => s.id !== sale.id));
      alert("تم إلغاء الفاتورة وإرجاع الكميات للمخزون بنجاح.");
    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء الحذف: " + e);
    }
  };

  const filtered = sales.filter(s => payFilter === "الكل" || s.paymentMethod === payFilter);
  const totalAmount = filtered.reduce((s, sale) => s + sale.total, 0);
  const cashTotal = filtered.filter(s => s.paymentMethod === "cash").reduce((s, sale) => s + sale.total, 0);
  const cardTotal = filtered.filter(s => s.paymentMethod === "card").reduce((s, sale) => s + sale.total, 0);
  const creditTotal = filtered.filter(s => s.paymentMethod === "credit").reduce((s, sale) => s + sale.total, 0);

  const exportCSV = () => {
    const rows = [
      ["رقم الوصل", "التاريخ", "الكاشير", "الأصناف", "الإجمالي", "طريقة الدفع"],
      ...filtered.map(s => [s.receiptNumber, formatDateTime(s.createdAt), s.cashierName, s.items.length, s.total, s.paymentMethod]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `تقرير-المبيعات-${startDate}-${endDate}.csv`; a.click();
  };

  return (
    <PasswordGate>
      <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>التقارير</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>تقارير المبيعات والأرباح</p>
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
            { label: "بطاقة", value: formatCurrency(cardTotal), color: "#3b82f6", bg: "#eff6ff" },
            { label: "آجل", value: formatCurrency(creditTotal), color: "#dc2626", bg: "#fff5f5" },
            { label: "عدد الفواتير", value: String(filtered.length), color: "#6b7280", bg: "#f9fafb" },
          ].map((s, i) => (
            <div key={i} className="card-sm" style={{ border: `1px solid ${s.bg}`, background: s.bg }}>
              <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.25rem" }}>{s.label}</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sales Table */}
      {fetched && (
        <div className="table-container">
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
                <th style={{ textAlign: "center" }}>إلغاء المبيعة</th>
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
                      onClick={() => handleDeleteSale(s)}
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
    </div>
    </PasswordGate>
  );
}
