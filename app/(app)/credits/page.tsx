"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { addCreditCustomer, updateCreditCustomer, addCreditTransaction, getCreditTransactions } from "@/lib/firestore/credits";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { Plus, X, Search, CreditCard, Phone, ChevronDown, ChevronUp } from "lucide-react";
import type { CreditCustomer, CreditTransaction } from "@/types/credit";

export default function CreditsPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { customers, totalDebt, loading } = useCredits(storeId);

  const [search, setSearch] = useState("");
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CreditCustomer | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payNote, setPayNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New customer form
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [creditLimit, setCreditLimit] = useState(50000);

  const filtered = customers.filter(c => !search || c.name.includes(search) || c.phone.includes(search));

  const loadTransactions = async (c: CreditCustomer) => {
    if (!storeId) return;
    setLoadingTx(true);
    const txs = await getCreditTransactions(storeId, c.id);
    setTransactions(txs);
    setLoadingTx(false);
  };

  const toggleExpand = async (c: CreditCustomer) => {
    if (expandedId === c.id) { setExpandedId(null); return; }
    setExpandedId(c.id);
    await loadTransactions(c);
  };

  const handleAddCustomer = async () => {
    if (!storeId || !newName) return;
    setSaving(true);
    try {
      await addCreditCustomer(storeId, { name: newName, phone: newPhone, address: newAddress || undefined, totalDebt: 0, creditLimit, isActive: true });
      setShowAddCustomer(false); setNewName(""); setNewPhone(""); setNewAddress("");
    } catch (e) { alert("خطأ: " + e); }
    finally { setSaving(false); }
  };

  const handlePayment = async () => {
    if (!storeId || !selectedCustomer || payAmount <= 0) return;
    setSaving(true);
    try {
      const balanceBefore = selectedCustomer.totalDebt;
      const balanceAfter = Math.max(0, balanceBefore - payAmount);
      await addCreditTransaction(storeId, {
        customerId: selectedCustomer.id, customerName: selectedCustomer.name,
        type: "payment", amount: payAmount, balanceBefore, balanceAfter,
        note: payNote || undefined, createdBy: appUser!.uid,
      });
      await updateCreditCustomer(storeId, selectedCustomer.id, { totalDebt: balanceAfter, lastTransactionAt: new Date() });
      setShowPayment(false); setPayAmount(0); setPayNote(""); setSelectedCustomer(null);
    } catch (e) { alert("خطأ: " + e); }
    finally { setSaving(false); }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>إدارة الكريديتيات</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>متابعة الديون وتسجيل المدفوعات</p>
        </div>
        <button onClick={() => setShowAddCustomer(true)} className="btn-primary"><Plus size={18} /> عميل جديد</button>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="stat-card-orange">
          <p style={{ opacity: 0.85, fontSize: "0.8rem" }}>إجمالي الديون</p>
          <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{formatCurrency(totalDebt)}</p>
        </div>
        <div className="stat-card-green">
          <p style={{ opacity: 0.85, fontSize: "0.8rem" }}>عدد العملاء</p>
          <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{customers.length}</p>
        </div>
        <div className="stat-card-yellow">
          <p style={{ opacity: 0.85, fontSize: "0.8rem" }}>عملاء نشطون</p>
          <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{customers.filter(c => c.totalDebt > 0).length}</p>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: "1rem" }}>
        <Search size={16} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
        <input className="input-field" style={{ paddingRight: "2.25rem" }} placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Customers List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {loading ? <p style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>جارٍ التحميل...</p>
          : filtered.map(c => (
            <div key={c.id} className="card-sm" style={{ border: c.totalDebt > c.creditLimit ? "1px solid #fca5a5" : "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "linear-gradient(135deg, #49a35c, #26683a)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "1rem", flexShrink: 0 }}>
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: "#17231c" }}>{c.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Phone size={12} />{c.phone || "—"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: "1rem", color: c.totalDebt > 0 ? "#dc2626" : "#26683a" }}>{formatCurrency(c.totalDebt)}</div>
                    <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>حد: {formatCurrency(c.creditLimit)}</div>
                  </div>
                  <button onClick={() => { setSelectedCustomer(c); setShowPayment(true); }} className="btn-primary" style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem" }}>
                    <CreditCard size={14} /> دفعة
                  </button>
                  <button onClick={() => toggleExpand(c)} className="btn-secondary" style={{ padding: "0.375rem 0.5rem" }}>
                    {expandedId === c.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Expanded Transactions */}
              {expandedId === c.id && (
                <div style={{ marginTop: "1rem", borderTop: "1px solid #f3f4f6", paddingTop: "1rem" }}>
                  {loadingTx ? <p style={{ textAlign: "center", color: "#9ca3af", fontSize: "0.875rem" }}>جارٍ التحميل...</p>
                    : transactions.length === 0 ? <p style={{ textAlign: "center", color: "#9ca3af", fontSize: "0.875rem" }}>لا توجد معاملات</p>
                    : <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      {transactions.map(tx => (
                        <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem", borderRadius: "0.375rem", background: tx.type === "payment" ? "#f0fdf4" : "#fff5f5" }}>
                          <div>
                            <span className={tx.type === "payment" ? "badge-green" : "badge-red"} style={{ fontSize: "0.7rem" }}>{tx.type === "payment" ? "دفعة" : tx.type === "purchase" ? "شراء" : "تعديل"}</span>
                            <span style={{ fontSize: "0.72rem", color: "#6b7280", marginRight: "0.5rem" }}>{formatDateTime(tx.createdAt)}</span>
                          </div>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: tx.type === "payment" ? "#26683a" : "#dc2626" }}>
                              {tx.type === "payment" ? "-" : "+"}{formatCurrency(tx.amount)}
                            </div>
                            <div style={{ fontSize: "0.68rem", color: "#6b7280" }}>رصيد: {formatCurrency(tx.balanceAfter)}</div>
                          </div>
                        </div>
                      ))}
                    </div>}
                </div>
              )}
            </div>
          ))}
        {!loading && filtered.length === 0 && <p style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>لا يوجد عملاء</p>}
      </div>

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="modal-overlay" onClick={() => setShowAddCustomer(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "400px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h2 style={{ fontWeight: 700 }}>إضافة عميل جديد</h2>
              <button onClick={() => setShowAddCustomer(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div><label className="label">الاسم *</label><input className="input-field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="اسم العميل" /></div>
              <div><label className="label">الهاتف</label><input className="input-field" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="0555 000 000" dir="ltr" style={{ textAlign: "left" }} /></div>
              <div><label className="label">العنوان</label><input className="input-field" value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="اختياري" /></div>
              <div><label className="label">حد الائتمان (د.ج)</label><input type="number" className="input-field" value={creditLimit} onChange={e => setCreditLimit(Number(e.target.value))} /></div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button onClick={() => setShowAddCustomer(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>إلغاء</button>
              <button onClick={handleAddCustomer} disabled={saving || !newName} className="btn-primary" style={{ flex: 2, justifyContent: "center" }}>{saving ? "جارٍ الحفظ..." : "إضافة العميل"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && selectedCustomer && (
        <div className="modal-overlay" onClick={() => setShowPayment(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "380px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h2 style={{ fontWeight: 700 }}>تسجيل دفعة</h2>
              <button onClick={() => setShowPayment(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ background: "#fff5f5", borderRadius: "0.75rem", padding: "0.875rem", marginBottom: "1rem" }}>
              <div style={{ fontWeight: 600 }}>{selectedCustomer.name}</div>
              <div style={{ color: "#dc2626", fontWeight: 700, fontSize: "1.1rem" }}>الدين: {formatCurrency(selectedCustomer.totalDebt)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div><label className="label">مبلغ الدفعة (د.ج) *</label><input type="number" min="0" max={selectedCustomer.totalDebt} className="input-field" value={payAmount || ""} onChange={e => setPayAmount(Number(e.target.value))} /></div>
              <div><label className="label">ملاحظة</label><input className="input-field" value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="اختياري" /></div>
              {payAmount > 0 && <div style={{ background: "#f0fdf4", padding: "0.625rem", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
                الرصيد بعد الدفع: <strong style={{ color: "#26683a" }}>{formatCurrency(Math.max(0, selectedCustomer.totalDebt - payAmount))}</strong>
              </div>}
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button onClick={() => setShowPayment(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>إلغاء</button>
              <button onClick={handlePayment} disabled={saving || payAmount <= 0} className="btn-primary" style={{ flex: 2, justifyContent: "center" }}>{saving ? "جارٍ الحفظ..." : "تأكيد الدفعة"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
