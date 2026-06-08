"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import {
  addCreditCustomer, updateCreditCustomer, deleteCreditCustomer,
  addCreditTransaction, addCustomerDebt, getCreditTransactions,
} from "@/lib/firestore/credits";
import { getSale } from "@/lib/firestore/sales";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { printCustomerStatement } from "@/lib/utils/print";
import { Plus, X, Search, CreditCard, Phone, Calendar, Trash2, Printer, TrendingUp } from "lucide-react";
import type { CreditCustomer, CreditTransaction } from "@/types/credit";

interface CreditTransactionWithItems extends CreditTransaction {
  saleItems?: { productName: string; quantity: number; unitPrice: number; totalPrice: number }[];
}

// At module scope — prevents focus-loss bug
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export default function CreditsPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { customers, totalDebt, loading } = useCredits(storeId);

  const [search, setSearch] = useState("");
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showAddDebt, setShowAddDebt] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CreditCustomer | null>(null);
  const [transactions, setTransactions] = useState<CreditTransactionWithItems[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<CreditCustomer | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // New customer fields — individual state to avoid cursor reset
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [creditLimit, setCreditLimit] = useState<number | "">(50000);
  const [newDueDate, setNewDueDate] = useState("");
  const [newInitialDebt, setNewInitialDebt] = useState<number | "">("");

  // Payment fields
  const [payAmount, setPayAmount] = useState<number | "">("");
  const [payNote, setPayNote] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Add debt fields
  const [debtAmount, setDebtAmount] = useState<number | "">("");
  const [debtNote, setDebtNote] = useState("");
  const [debtDate, setDebtDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Delete customer field
  const [customerToDelete, setCustomerToDelete] = useState<CreditCustomer | null>(null);

  const filtered = customers.filter(
    (c) => !search || c.name.includes(search) || c.phone.includes(search)
  );

  const resolveTransactionsWithItems = async (
    txs: CreditTransaction[],
    currentStoreId: string
  ): Promise<CreditTransactionWithItems[]> => {
    return Promise.all(
      txs.map(async (tx) => {
        if (tx.type === "purchase" && tx.saleId) {
          try {
            const sale = await getSale(currentStoreId, tx.saleId);
            if (sale) {
              return {
                ...tx,
                saleItems: sale.items.map(item => ({
                  productName: item.productName,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  totalPrice: item.totalPrice,
                }))
              };
            }
          } catch (e) {
            console.error("Error loading sale detail:", e);
          }
        }
        return tx;
      })
    );
  };

  const loadTransactions = async (c: CreditCustomer) => {
    if (!storeId) return;
    setLoadingTx(true);
    setTransactions([]);
    setErrorMsg("");
    try {
      const txs = await getCreditTransactions(storeId, c.id);
      const resolvedTxs = await resolveTransactionsWithItems(txs, storeId);
      setTransactions(resolvedTxs);
    } catch (e: unknown) {
      console.error("Error loading credit transactions:", e);
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg("تعذر تحميل معاملات العميل: " + msg);
    } finally {
      setLoadingTx(false);
    }
  };

  const handlePrintStatement = async (c: CreditCustomer) => {
    if (!storeId) return;
    let txsToPrint = transactions;
    if (detailCustomer?.id !== c.id) {
      setLoadingTx(true);
      setErrorMsg("");
      try {
        const txs = await getCreditTransactions(storeId, c.id);
        txsToPrint = await resolveTransactionsWithItems(txs, storeId);
      } catch (e: unknown) {
        console.error("Error loading credit transactions for print:", e);
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg("تعذر تحميل كشف معاملات العميل: " + msg);
        return;
      } finally {
        setLoadingTx(false);
      }
    }
    printCustomerStatement(c, txsToPrint);
  };

  const openCustomerDetail = async (c: CreditCustomer) => {
    setDetailCustomer(c);
    await loadTransactions(c);
  };

  const openPayment = (c: CreditCustomer) => {
    setSelectedCustomer(c);
    setPayAmount("");
    setPayNote("");
    setPayDate(new Date().toISOString().split("T")[0]);
    setShowPayment(true);
  };

  const openAddDebt = (c: CreditCustomer) => {
    setSelectedCustomer(c);
    setDebtAmount("");
    setDebtNote("");
    setDebtDate(new Date().toISOString().split("T")[0]);
    setShowAddDebt(true);
  };

  const handleAddCustomer = async () => {
    if (!storeId || !newName.trim()) return;
    setSaving(true);
    setErrorMsg("");
    try {
      const initialDebt = Number(newInitialDebt) || 0;
      await addCreditCustomer(
        storeId,
        {
          name: newName.trim(),
          phone: newPhone.trim(),
          address: newAddress.trim() || "",
          totalDebt: initialDebt,
          creditLimit: Number(creditLimit) || 50000,
          isActive: true,
          dueDate: newDueDate || "",
        },
        initialDebt > 0
          ? { createdBy: appUser!.uid, initialDebtNote: "دين افتتاحي" }
          : undefined
      );
      setShowAddCustomer(false);
      setNewName(""); setNewPhone(""); setNewAddress(""); setCreditLimit(50000); setNewDueDate(""); setNewInitialDebt("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg("خطأ في إضافة العميل: " + msg);
    } finally {
      setSaving(false);
    }
  };

  const handleAddDebt = async () => {
    if (!storeId || !selectedCustomer || !debtAmount) return;
    const amount = Number(debtAmount);
    if (amount <= 0) return;

    setSaving(true);
    setErrorMsg("");
    try {
      await addCustomerDebt(
        storeId,
        selectedCustomer,
        amount,
        appUser!.uid,
        debtNote.trim() || "إضافة دين",
        new Date(debtDate)
      );
      setShowAddDebt(false);
      setSelectedCustomer(null);
      if (detailCustomer?.id === selectedCustomer.id) {
        await loadTransactions({ ...selectedCustomer, totalDebt: selectedCustomer.totalDebt + amount });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg("خطأ في إضافة الدين: " + msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePayment = async () => {
    if (!storeId || !selectedCustomer || !payAmount) return;
    setSaving(true);
    setErrorMsg("");
    try {
      const amount = Number(payAmount);
      const balanceBefore = selectedCustomer.totalDebt;
      const balanceAfter = Math.max(0, balanceBefore - amount);
      await addCreditTransaction(storeId, {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        type: "payment",
        amount,
        balanceBefore,
        balanceAfter,
        note: payNote.trim() || "",
        createdBy: appUser!.uid,
        createdAt: new Date(payDate),
      });
      await updateCreditCustomer(storeId, selectedCustomer.id, {
        totalDebt: balanceAfter,
        lastTransactionAt: new Date(payDate),
      });
      setShowPayment(false);
      setSelectedCustomer(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg("خطأ في تسجيل الدفعة: " + msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>إدارة الكريديتيات</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>متابعة الديون وتسجيل المدفوعات</p>
        </div>
        <button onClick={() => { setErrorMsg(""); setShowAddCustomer(true); }} className="btn-primary">
          <Plus size={18} /> عميل جديد
        </button>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "0.5rem", padding: "0.75rem 1rem", marginBottom: "1rem", color: "#dc2626", fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>
          {errorMsg}
          <button onClick={() => setErrorMsg("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626" }}>✕</button>
        </div>
      )}

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="stat-card-orange">
          <p style={{ opacity: 0.85, fontSize: "0.8rem" }}>إجمالي الديون</p>
          <p style={{ fontSize: "1.4rem", fontWeight: 700 }}>{formatCurrency(totalDebt)}</p>
        </div>
        <div className="stat-card-green">
          <p style={{ opacity: 0.85, fontSize: "0.8rem" }}>عدد العملاء</p>
          <p style={{ fontSize: "1.4rem", fontWeight: 700 }}>{customers.length}</p>
        </div>
        <div className="stat-card-yellow">
          <p style={{ opacity: 0.85, fontSize: "0.8rem" }}>لديهم دين</p>
          <p style={{ fontSize: "1.4rem", fontWeight: 700 }}>{customers.filter((c) => c.totalDebt > 0).length}</p>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: "1rem" }}>
        <Search size={16} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
        <input
          className="input-field"
          style={{ paddingRight: "2.25rem" }}
          placeholder="بحث بالاسم أو الهاتف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Customer cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>جارٍ التحميل...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>
            {search ? "لا نتائج" : "لا يوجد عملاء. أضف عميلاً جديداً!"}
          </p>
        ) : filtered.map((c) => (
          <div key={c.id} className="card-sm" style={{ border: c.totalDebt > c.creditLimit ? "1px solid #fca5a5" : "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => openCustomerDetail(c)}
                style={{
                  display: "flex", gap: "0.75rem", alignItems: "center",
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  textAlign: "right", flex: 1, minWidth: 0,
                }}
                title="عرض معلومات العميل وسجل المشتريات"
              >
                <div style={{
                  width: "42px", height: "42px", borderRadius: "50%",
                  background: "linear-gradient(135deg, #49a35c, #26683a)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white", fontWeight: 700, fontSize: "1rem", flexShrink: 0,
                }}>
                  {c.name.charAt(0)}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "#17231c" }}>{c.name}</div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.15rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Phone size={12} /> {c.phone || "—"}
                    </div>
                    {c.dueDate && (
                      <div style={{
                        fontSize: "0.72rem",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        background: new Date(c.dueDate) <= new Date() ? "#fef2f2" : "#f3f4f6",
                        color: new Date(c.dueDate) <= new Date() ? "#dc2626" : "#4b5563",
                        fontWeight: new Date(c.dueDate) <= new Date() ? 600 : 400,
                      }}>
                        <Calendar size={11} /> استحقاق: {c.dueDate}
                      </div>
                    )}
                  </div>
                </div>
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem", color: c.totalDebt > 0 ? "#dc2626" : "#26683a" }}>
                    {formatCurrency(c.totalDebt)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>حد: {formatCurrency(c.creditLimit)}</div>
                </div>
                <button onClick={() => openAddDebt(c)} className="btn-secondary" style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem", color: "#dc2626", borderColor: "#fecaca" }}>
                  <TrendingUp size={14} /> دين
                </button>
                <button onClick={() => openPayment(c)} className="btn-primary" style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem" }}>
                  <CreditCard size={14} /> دفعة
                </button>
                <button
                  onClick={() => handlePrintStatement(c)}
                  className="btn-secondary"
                  style={{ padding: "0.375rem 0.5rem" }}
                  title="طباعة كشف الحساب"
                >
                  <Printer size={14} />
                </button>
                <button
                  onClick={() => setCustomerToDelete(c)}
                  className="btn-danger"
                  style={{ padding: "0.375rem 0.5rem" }}
                  title="حذف الحساب"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="modal-overlay" onClick={() => setShowAddCustomer(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h2 style={{ fontWeight: 700 }}>إضافة عميل جديد</h2>
              <button onClick={() => setShowAddCustomer(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <FormField label="الاسم *">
                <input className="input-field" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم العميل" autoComplete="off" />
              </FormField>
              <FormField label="الهاتف">
                <input className="input-field" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="0555 000 000" dir="ltr" style={{ textAlign: "left" }} autoComplete="off" />
              </FormField>
              <FormField label="العنوان">
                <input className="input-field" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="اختياري" autoComplete="off" />
              </FormField>
              <FormField label="حد الائتمان (د.ج)">
                <input type="number" className="input-field" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value === "" ? "" : Number(e.target.value))} dir="ltr" style={{ textAlign: "left" }} />
              </FormField>
              <FormField label="تاريخ استحقاق الدفع">
                <input type="date" className="input-field" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
              </FormField>
              <FormField label="دين افتتاحي (د.ج) — اختياري">
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  value={newInitialDebt}
                  onChange={(e) => setNewInitialDebt(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                  dir="ltr"
                  style={{ textAlign: "left" }}
                />
              </FormField>
            </div>
            {errorMsg && <p style={{ color: "#dc2626", fontSize: "0.8rem", marginTop: "0.5rem" }}>{errorMsg}</p>}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button onClick={() => setShowAddCustomer(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>إلغاء</button>
              <button onClick={handleAddCustomer} disabled={saving || !newName.trim()} className="btn-primary" style={{ flex: 2, justifyContent: "center" }}>
                {saving ? "جارٍ الحفظ..." : "إضافة العميل"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Debt Modal */}
      {showAddDebt && selectedCustomer && (
        <div className="modal-overlay" onClick={() => setShowAddDebt(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "380px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h2 style={{ fontWeight: 700 }}>إضافة دين</h2>
              <button onClick={() => setShowAddDebt(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ background: "#fff5f5", borderRadius: "0.75rem", padding: "0.875rem", marginBottom: "1rem" }}>
              <div style={{ fontWeight: 600 }}>{selectedCustomer.name}</div>
              <div style={{ color: "#dc2626", fontWeight: 700, fontSize: "1.1rem" }}>الدين الحالي: {formatCurrency(selectedCustomer.totalDebt)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <FormField label="مبلغ الدين (د.ج) *">
                <input type="number" min="0" className="input-field" value={debtAmount} onChange={(e) => setDebtAmount(e.target.value === "" ? "" : Number(e.target.value))} dir="ltr" style={{ textAlign: "left" }} autoFocus />
              </FormField>
              <FormField label="تاريخ الدين">
                <input type="date" className="input-field" value={debtDate} onChange={(e) => setDebtDate(e.target.value)} />
              </FormField>
              <FormField label="ملاحظة">
                <input className="input-field" value={debtNote} onChange={(e) => setDebtNote(e.target.value)} placeholder="مثال: بضاعة سابقة" autoComplete="off" />
              </FormField>
              {debtAmount !== "" && Number(debtAmount) > 0 && (
                <div style={{ background: "#fef2f2", padding: "0.625rem", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
                  الرصيد بعد الإضافة: <strong style={{ color: "#dc2626" }}>{formatCurrency(selectedCustomer.totalDebt + Number(debtAmount))}</strong>
                </div>
              )}
            </div>
            {errorMsg && <p style={{ color: "#dc2626", fontSize: "0.8rem", marginTop: "0.5rem" }}>{errorMsg}</p>}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button onClick={() => setShowAddDebt(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>إلغاء</button>
              <button onClick={handleAddDebt} disabled={saving || !debtAmount || Number(debtAmount) <= 0} className="btn-danger" style={{ flex: 2, justifyContent: "center" }}>
                {saving ? "جارٍ الحفظ..." : "تأكيد إضافة الدين"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && selectedCustomer && (
        <div className="modal-overlay" onClick={() => setShowPayment(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "380px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h2 style={{ fontWeight: 700 }}>تسجيل دفعة</h2>
              <button onClick={() => setShowPayment(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ background: "#fff5f5", borderRadius: "0.75rem", padding: "0.875rem", marginBottom: "1rem" }}>
              <div style={{ fontWeight: 600 }}>{selectedCustomer.name}</div>
              <div style={{ color: "#dc2626", fontWeight: 700, fontSize: "1.1rem" }}>الدين: {formatCurrency(selectedCustomer.totalDebt)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <FormField label="مبلغ الدفعة (د.ج) *">
                <input type="number" min="0" max={selectedCustomer.totalDebt} className="input-field" value={payAmount} onChange={(e) => setPayAmount(e.target.value === "" ? "" : Number(e.target.value))} dir="ltr" style={{ textAlign: "left" }} autoFocus />
              </FormField>
              <FormField label="تاريخ الدفعة">
                <input type="date" className="input-field" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </FormField>
              <FormField label="ملاحظة">
                <input className="input-field" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="اختياري" autoComplete="off" />
              </FormField>
              {payAmount !== "" && Number(payAmount) > 0 && (
                <div style={{ background: "#f0fdf4", padding: "0.625rem", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
                  الرصيد بعد الدفع: <strong style={{ color: "#26683a" }}>{formatCurrency(Math.max(0, selectedCustomer.totalDebt - Number(payAmount)))}</strong>
                </div>
              )}
            </div>
            {errorMsg && <p style={{ color: "#dc2626", fontSize: "0.8rem", marginTop: "0.5rem" }}>{errorMsg}</p>}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button onClick={() => setShowPayment(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>إلغاء</button>
              <button onClick={handlePayment} disabled={saving || !payAmount || Number(payAmount) <= 0} className="btn-primary" style={{ flex: 2, justifyContent: "center" }}>
                {saving ? "جارٍ الحفظ..." : "تأكيد الدفعة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      {detailCustomer && (
        <div className="modal-overlay" onClick={() => setDetailCustomer(null)}>
          <div
            className="card animate-slide-up"
            style={{ width: "100%", maxWidth: "560px", maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <div style={{
                  width: "48px", height: "48px", borderRadius: "50%",
                  background: "linear-gradient(135deg, #49a35c, #26683a)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white", fontWeight: 700, fontSize: "1.1rem", flexShrink: 0,
                }}>
                  {detailCustomer.name.charAt(0)}
                </div>
                <div>
                  <h2 style={{ fontWeight: 700, fontSize: "1.15rem" }}>{detailCustomer.name}</h2>
                  <div style={{ fontSize: "0.8rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.15rem" }}>
                    <Phone size={13} /> {detailCustomer.phone || "—"}
                  </div>
                </div>
              </div>
              <button onClick={() => setDetailCustomer(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem",
              background: "#f8fdf5", borderRadius: "0.75rem", padding: "0.875rem",
              border: "1px solid #c5e5b8", marginBottom: "1rem", fontSize: "0.82rem",
            }}>
              <div><span style={{ color: "#6b7280" }}>العنوان:</span> {detailCustomer.address || "—"}</div>
              <div><span style={{ color: "#6b7280" }}>حد الائتمان:</span> {formatCurrency(detailCustomer.creditLimit)}</div>
              <div>
                <span style={{ color: "#6b7280" }}>الدين الحالي:</span>{" "}
                <strong style={{ color: detailCustomer.totalDebt > 0 ? "#dc2626" : "#26683a" }}>
                  {formatCurrency(detailCustomer.totalDebt)}
                </strong>
              </div>
              <div>
                <span style={{ color: "#6b7280" }}>تاريخ الاستحقاق:</span>{" "}
                {detailCustomer.dueDate || "—"}
              </div>
              <div><span style={{ color: "#6b7280" }}>تاريخ التسجيل:</span> {formatDate(detailCustomer.createdAt)}</div>
              <div><span style={{ color: "#6b7280" }}>آخر عملية:</span> {formatDateTime(detailCustomer.lastTransactionAt)}</div>
            </div>

            <h3 style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: "0.625rem" }}>سجل المشتريات والمعاملات</h3>
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
              {loadingTx ? (
                <p style={{ textAlign: "center", color: "#9ca3af", fontSize: "0.875rem", padding: "1.5rem" }}>جارٍ التحميل...</p>
              ) : transactions.length === 0 ? (
                <p style={{ textAlign: "center", color: "#9ca3af", fontSize: "0.875rem", padding: "1.5rem" }}>لا توجد معاملات</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  {transactions.map((tx) => (
                    <div key={tx.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      padding: "0.5rem", borderRadius: "0.375rem",
                      background: tx.type === "payment" ? "#f0fdf4" : "#fff5f5",
                    }}>
                      <div>
                        <div>
                          <span className={tx.type === "payment" ? "badge-green" : "badge-red"} style={{ fontSize: "0.7rem" }}>
                            {tx.type === "payment" ? "دفعة" : tx.type === "purchase" ? "شراء" : "إضافة دين"}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "#374151", marginRight: "0.5rem", fontWeight: "600" }}>
                            {formatDateTime(tx.createdAt)}
                          </span>
                          {tx.note && <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}> — {tx.note}</span>}
                        </div>
                        {tx.saleItems && tx.saleItems.length > 0 && (
                          <div style={{ marginTop: "0.4rem", paddingRight: "0.5rem", borderRight: "2px solid #e5e7eb", display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                              <span style={{ fontSize: "0.7rem", fontWeight: "bold", color: "#6b7280" }}>السلع المشتراة:</span>
                              <button
                                onClick={async () => {
                                  if (tx.saleId && storeId) {
                                    const sale = await getSale(storeId, tx.saleId);
                                    if (sale) {
                                      const { printReceipt } = await import("@/lib/utils/print");
                                      printReceipt(sale);
                                    }
                                  }
                                }}
                                style={{
                                  background: "none", border: "none", color: "#2563eb", cursor: "pointer",
                                  fontSize: "0.68rem", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "2px",
                                  padding: 0
                                }}
                              >
                                طباعة الوصل
                              </button>
                            </div>
                            {tx.saleItems.map((item, idx) => (
                              <span key={idx} style={{ fontSize: "0.72rem", color: "#4b5563" }}>
                                {item.productName} ({item.quantity} × {formatCurrency(item.unitPrice)}) ={" "}
                                <strong style={{ color: "#111827" }}>{formatCurrency(item.totalPrice)}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "left", flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.85rem", color: tx.type === "payment" ? "#26683a" : "#dc2626" }}>
                          {tx.type === "payment" ? "-" : "+"}{formatCurrency(tx.amount)}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "#6b7280" }}>رصيد: {formatCurrency(tx.balanceAfter)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid #f3f4f6", flexWrap: "wrap" }}>
              <button onClick={() => openAddDebt(detailCustomer)} className="btn-secondary" style={{ flex: 1, justifyContent: "center", color: "#dc2626", borderColor: "#fecaca", minWidth: "120px" }}>
                <TrendingUp size={14} /> إضافة دين
              </button>
              <button onClick={() => openPayment(detailCustomer)} className="btn-primary" style={{ flex: 1, justifyContent: "center", minWidth: "120px" }}>
                <CreditCard size={14} /> تسجيل دفعة
              </button>
              <button
                onClick={() => handlePrintStatement(detailCustomer)}
                className="btn-secondary"
                style={{ flex: 1, justifyContent: "center", minWidth: "120px" }}
              >
                <Printer size={14} /> طباعة الكشف
              </button>
              <button onClick={() => setDetailCustomer(null)} className="btn-primary" style={{ flex: 1, justifyContent: "center", minWidth: "120px" }}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Customer Confirmation Modal */}
      {customerToDelete && (
        <div className="modal-overlay" onClick={() => setCustomerToDelete(null)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, marginBottom: "0.75rem", color: "#dc2626" }}>تأكيد حذف الحساب</h3>
            <p style={{ color: "#4b5563", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              هل أنت متأكد من رغبتك في حذف حساب العميل <strong>"{customerToDelete.name}"</strong> نهائياً؟ 
              سيؤدي هذا إلى مسح الحساب بالكامل وتصفير رصيد مديونيته البالغ <strong>{formatCurrency(customerToDelete.totalDebt)}</strong>.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setCustomerToDelete(null)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>
                إلغاء
              </button>
              <button
                onClick={async () => {
                  if (!storeId) return;
                  const c = customerToDelete;
                  setCustomerToDelete(null);
                  try {
                    await deleteCreditCustomer(storeId, c.id);
                  } catch (e) {
                    alert("خطأ أثناء حذف العميل: " + e);
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
    </div>
  );
}
