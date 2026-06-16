"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useExpenses } from "@/hooks/useExpenses";
import { addExpense, deleteExpense } from "@/lib/firestore/expenses";
import { isOffline, offlineAwareAwait } from "@/lib/firestore/helpers";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { Plus, X, Trash2, Receipt } from "lucide-react";
import Toast from "@/components/ui/Toast";
import type { Expense } from "@/types/expense";

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export default function ExpensesPanel() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { expenses, totalExpenses, loading } = useExpenses(storeId);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [msg, setMsg] = useState("");
  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split("T")[0]);

  const resetForm = () => {
    setTitle("");
    setAmount("");
    setNote("");
    setExpenseDate(new Date().toISOString().split("T")[0]);
  };

  const handleAdd = async () => {
    if (!storeId || !title.trim() || !amount || Number(amount) <= 0) return;
    setSaving(true);
    setErrorMsg("");

    const saveOp = addExpense(storeId, {
      title: title.trim(),
      amount: Number(amount),
      note: note.trim(),
      createdBy: appUser!.uid,
      createdByName: appUser!.displayName,
      createdAt: new Date(expenseDate),
    });

    setShowForm(false);
    resetForm();
    setSaving(false);

    saveOp.catch((e) => {
      console.error("Error saving expense:", e);
      setErrorMsg("خطأ في حفظ المصروف: " + (e instanceof Error ? e.message : String(e)));
    });
  };

  return (
    <div>
      <Toast message={msg} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div className="stat-card-orange" style={{ flex: 1, minWidth: "200px" }}>
          <p style={{ opacity: 0.85, fontSize: "0.8rem" }}>إجمالي المصاريف المسجلة</p>
          <p style={{ fontSize: "1.4rem", fontWeight: 700 }}>{formatCurrency(totalExpenses)}</p>
        </div>
        <button onClick={() => { setErrorMsg(""); setShowForm(true); }} className="btn-primary">
          <Plus size={18} /> مصروف جديد
        </button>
      </div>

      {errorMsg && !showForm && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "0.5rem", padding: "0.75rem", marginBottom: "1rem", color: "#dc2626", fontSize: "0.875rem" }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>جارٍ التحميل...</p>
        ) : expenses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
            <Receipt size={40} style={{ margin: "0 auto 0.75rem", opacity: 0.2 }} />
            <p>لا توجد مصاريف مسجلة. أضف مصروفاً جديداً.</p>
          </div>
        ) : (
          expenses.map((e) => (
            <div key={e.id} className="card-sm" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "#17231c" }}>{e.title}</div>
                <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.15rem" }}>
                  {formatDateTime(e.createdAt)}
                  {e.createdByName ? ` • ${e.createdByName}` : ""}
                </div>
                {e.note && (
                  <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>{e.note}</div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "#d97706" }}>{formatCurrency(e.amount)}</div>
                <button
                  onClick={() => setExpenseToDelete(e)}
                  className="btn-danger"
                  style={{ padding: "0.25rem 0.5rem" }}
                  title="حذف المصروف"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "420px" }} onClick={(ev) => ev.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h2 style={{ fontWeight: 700 }}>تسجيل مصروف</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <FormField label="وصف المصروف *">
                <input className="input-field" value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="مثال: إيجار، كهرباء، نقل..." autoComplete="off" autoFocus />
              </FormField>
              <FormField label="المبلغ (د.ج) *">
                <input type="number" min="0" className="input-field" value={amount} onChange={(ev) => setAmount(ev.target.value === "" ? "" : Number(ev.target.value))} dir="ltr" style={{ textAlign: "left" }} />
              </FormField>
              <FormField label="تاريخ المصروف">
                <input type="date" className="input-field" value={expenseDate} onChange={(ev) => setExpenseDate(ev.target.value)} />
              </FormField>
              <FormField label="ملاحظة">
                <input className="input-field" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="اختياري" autoComplete="off" />
              </FormField>
            </div>
            {errorMsg && <p style={{ color: "#dc2626", fontSize: "0.8rem", marginTop: "0.5rem" }}>{errorMsg}</p>}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button onClick={() => setShowForm(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>إلغاء</button>
              <button onClick={handleAdd} disabled={saving || !title.trim() || !amount || Number(amount) <= 0} className="btn-primary" style={{ flex: 2, justifyContent: "center" }}>
                {saving ? "جارٍ الحفظ..." : "حفظ المصروف"}
              </button>
            </div>
          </div>
        </div>
      )}

      {expenseToDelete && (
        <div className="modal-overlay" onClick={() => setExpenseToDelete(null)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "420px" }} onClick={(ev) => ev.stopPropagation()}>
            <h3 style={{ fontWeight: 700, marginBottom: "0.75rem", color: "#dc2626" }}>حذف المصروف</h3>
            <p style={{ color: "#4b5563", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              حذف <strong>"{expenseToDelete.title}"</strong> بقيمة <strong>{formatCurrency(expenseToDelete.amount)}</strong>؟
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setExpenseToDelete(null)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>إلغاء</button>
              <button
                onClick={async () => {
                  const exp = expenseToDelete;
                  setExpenseToDelete(null); // أغلق النافذة دائماً أولاً حتى لا تَعلق
                  if (!storeId || !exp) return;
                  try {
                    await offlineAwareAwait(deleteExpense(storeId, exp.id));
                    showMsg("✅ تم حذف المصروف");
                  } catch (e) {
                    console.error("delete expense error:", e);
                    showMsg("⚠️ خطأ أثناء حذف المصروف");
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
