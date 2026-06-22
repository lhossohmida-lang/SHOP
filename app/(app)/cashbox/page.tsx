"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getSalesByDateRange } from "@/lib/firestore/sales";
import { getExpensesByDateRange } from "@/lib/firestore/expenses";
import { getCreditPaymentsByDateRange } from "@/lib/firestore/credits";
import { formatCurrency } from "@/lib/utils/currency";
import { normalizeDigits } from "@/lib/utils/barcode";
import { Wallet, Search, RefreshCw, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import PasswordGate from "@/components/layout/PasswordGate";

// المفاتيح المحفوظة محلياً (الرصيد الافتتاحي والمبلغ المتروك يُتذكَّران بين الجلسات).
const LS_OPENING = "cashbox_opening";
const LS_LEAVE = "cashbox_leave";

export default function CashboxPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [opening, setOpening] = useState<string>("");
  const [leaveForTomorrow, setLeaveForTomorrow] = useState<string>("");

  const [cashSales, setCashSales] = useState(0);
  const [creditPaid, setCreditPaid] = useState(0);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [msg, setMsg] = useState("");
  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3500); };

  const filterRef = useRef<HTMLDivElement>(null);

  // استرجاع آخر قيم محفوظة
  useEffect(() => {
    setOpening(localStorage.getItem(LS_OPENING) || "");
    setLeaveForTomorrow(localStorage.getItem(LS_LEAVE) || "");
  }, []);

  // أسهم يمين/يسار: تذهب مباشرة لخانة التاريخ (عند دخول الصفحة). لا تتدخّل في خانات الكتابة الأخرى.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const container = filterRef.current;
      if (!container) return;
      const fields = Array.from(container.querySelectorAll("input, select")) as HTMLElement[];
      if (fields.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? fields.indexOf(active) : -1;
      if (idx !== -1) {
        if (fields.length < 2) return;
        e.preventDefault();
        const next = e.key === "ArrowLeft" ? idx + 1 : idx - 1;
        fields[(next + fields.length) % fields.length]?.focus();
      } else if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) {
        e.preventDefault();
        fields[0].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fetchDay = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end = new Date(date); end.setHours(23, 59, 59, 999);

      const [salesData, expensesData, paymentsData] = await Promise.all([
        getSalesByDateRange(storeId, start, end),
        getExpensesByDateRange(storeId, start, end),
        getCreditPaymentsByDateRange(storeId, start, end),
      ]);

      // النقد الداخل للصندوق = المبيعات النقدية فقط (الكريدي دين لا نقد)
      setCashSales(salesData.filter(s => s.paymentMethod === "cash").reduce((a, s) => a + s.total, 0));
      setCreditPaid(paymentsData.reduce((a, t) => a + t.amount, 0));
      setExpensesTotal(expensesData.reduce((a, e) => a + e.amount, 0));
      setFetched(true);
    } catch (e) {
      console.error("cashbox fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [storeId, date]);

  // حساب الصندوق
  const openingNum = Number(opening) || 0;
  const leaveNum = Number(leaveForTomorrow) || 0;
  // النقد الحالي = الافتتاحي + المبيعات النقدية + مدفوعات الكريديات المستلمة − المصاريف
  const currentCash = openingNum + cashSales + creditPaid - expensesTotal;
  const takeOut = Math.max(0, currentCash - leaveNum);

  const saveOpening = (v: string) => {
    const n = normalizeDigits(v).replace(/[^\d.]/g, "");
    setOpening(n);
    localStorage.setItem(LS_OPENING, n);
  };
  const saveLeave = (v: string) => {
    const n = normalizeDigits(v).replace(/[^\d.]/g, "");
    setLeaveForTomorrow(n);
    localStorage.setItem(LS_LEAVE, n);
  };

  // حفظ ما تركته في الصندوق: يُسجَّل ويُرحَّل ليكون رصيد الغد الافتتاحي.
  const saveLeftover = () => {
    const v = String(leaveNum);
    localStorage.setItem(LS_LEAVE, v);
    localStorage.setItem(LS_OPENING, v); // ما تركته الليلة = رصيد الغد الافتتاحي
    setOpening(v);
    showMsg(`✅ تم حفظ ما تركته في الصندوق: ${formatCurrency(leaveNum)} — سيكون رصيد الغد الافتتاحي`);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", border: "1px solid #c5e5b8", borderRadius: "0.5rem",
    padding: "0.6rem 0.75rem", fontSize: "1.05rem", fontWeight: 700, direction: "ltr", textAlign: "center",
  };

  const Row = ({ label, value, color, sign }: { label: string; value: number; color: string; sign: "+" | "−" | "=" }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.25rem", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: "0.9rem", color: "#4b5563", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <span style={{ width: "18px", textAlign: "center", fontWeight: 700, color }}>{sign}</span>
        {label}
      </span>
      <span style={{ fontSize: "1rem", fontWeight: 700, color }}>{formatCurrency(value)}</span>
    </div>
  );

  return (
    <PasswordGate>
      <div className="animate-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Wallet size={24} color="#26683a" /> صندوق النقود
            </h1>
            <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>احسب كم في الصندوق وكم تترك للغد بدقة</p>
          </div>
        </div>

        {/* اختيار اليوم */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div
            ref={filterRef}
            style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}
          >
            <div>
              <label className="label">اليوم</label>
              <input type="date" className="input-field" value={date} onChange={e => setDate(e.target.value)} dir="ltr" style={{ textAlign: "left" }} />
            </div>
            <button onClick={fetchDay} disabled={loading} className="btn-primary" style={{ alignSelf: "flex-end" }}>
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />} {loading ? "جارٍ الحساب..." : "احسب الصندوق"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}>
          {/* حساب الصندوق */}
          <div className="card">
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#26683a", marginBottom: "0.75rem" }}>حساب الصندوق</h2>

            <label className="label">الرصيد الافتتاحي (ما كان في الصندوق صباحاً)</label>
            <input
              type="text" inputMode="decimal" value={opening}
              onChange={e => saveOpening(e.target.value)}
              placeholder="مثال: 40000"
              style={{ ...inputStyle, marginBottom: "0.75rem" }}
            />

            <Row label="مبيعات نقدية اليوم" value={cashSales} color="#16a34a" sign="+" />
            <Row label="مدفوعات كريديات مستلمة" value={creditPaid} color="#16a34a" sign="+" />
            <Row label="مصاريف اليوم" value={expensesTotal} color="#dc2626" sign="−" />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.875rem 0.25rem 0.25rem", marginTop: "0.25rem", borderTop: "2px solid #26683a" }}>
              <span style={{ fontSize: "1rem", fontWeight: 700, color: "#17231c" }}>النقد الحالي في الصندوق</span>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, color: currentCash >= 0 ? "#26683a" : "#dc2626" }}>{formatCurrency(currentCash)}</span>
            </div>
            {!fetched && (
              <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.5rem", textAlign: "center" }}>اضغط "احسب الصندوق" لجلب مبيعات ومصاريف اليوم</p>
            )}
          </div>

          {/* كم تترك للغد */}
          <div className="card" style={{ background: "#f8fdf5" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#26683a", marginBottom: "0.75rem" }}>التوزيع لنهاية اليوم</h2>

            <label className="label">المبلغ المتروك للغد (في الصندوق)</label>
            <input
              type="text" inputMode="decimal" value={leaveForTomorrow}
              onChange={e => saveLeave(e.target.value)}
              placeholder="مثال: 40000"
              style={{ ...inputStyle, marginBottom: "1rem" }}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ background: "white", border: "1px solid #c5e5b8", borderRadius: "0.75rem", padding: "0.875rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.9rem", color: "#4b5563", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <ArrowDownCircle size={18} color="#2563eb" /> يبقى في الصندوق للغد
                </span>
                <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "#2563eb" }}>{formatCurrency(leaveNum)}</span>
              </div>

              <div style={{ background: "white", border: "1px solid #fdba74", borderRadius: "0.75rem", padding: "0.875rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.9rem", color: "#4b5563", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <ArrowUpCircle size={18} color="#d97706" /> المبلغ الذي تسحبه الليلة
                </span>
                <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "#d97706" }}>{formatCurrency(takeOut)}</span>
              </div>

              {leaveNum > currentCash && (
                <p style={{ fontSize: "0.78rem", color: "#dc2626", fontWeight: 600, textAlign: "center" }}>
                  ⚠️ المبلغ المتروك أكبر من النقد الموجود في الصندوق
                </p>
              )}

              {/* زر حفظ ما تركته في الصندوق */}
              <button
                onClick={saveLeftover}
                style={{
                  marginTop: "0.25rem", width: "100%", padding: "0.7rem 1rem",
                  borderRadius: "0.625rem", border: "none", background: "#26683a",
                  color: "white", cursor: "pointer", fontWeight: 700, fontSize: "0.95rem",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
                }}
              >
                💾 حفظ ما تركته في الصندوق
              </button>
            </div>
          </div>
        </div>

        {/* رسالة الحفظ */}
        {msg && (
          <div style={{
            position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
            padding: "0.75rem 1.5rem", borderRadius: "0.75rem", zIndex: 200,
            background: "#26683a", color: "white", fontWeight: 600, fontSize: "0.875rem",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)", maxWidth: "90vw", textAlign: "center",
          }}>{msg}</div>
        )}
      </div>
    </PasswordGate>
  );
}
