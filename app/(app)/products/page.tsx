"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { addProduct, updateProduct, deleteProduct } from "@/lib/firestore/products";
import { formatCurrency } from "@/lib/utils/currency";
import { PRODUCT_CATEGORIES } from "@/types/product";
import type { ProductFormData, Product } from "@/types/product";
import { Plus, Search, Edit2, Trash2, X, Package } from "lucide-react";

const emptyForm: ProductFormData = {
  name: "", nameAr: "", barcode: "", category: "مواد غذائية",
  purchasePrice: 0, sellingPrice: 0, stock: 0, minStock: 5, unit: "pcs", isActive: true,
};

export default function ProductsPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { products, loading } = useProducts(storeId);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.nameAr.includes(search) || p.barcode.includes(search)
  );

  const openNew = () => { setForm(emptyForm); setEditingProduct(null); setShowForm(true); };
  const openEdit = (p: Product) => { setForm({ name: p.name, nameAr: p.nameAr, barcode: p.barcode, category: p.category, purchasePrice: p.purchasePrice, sellingPrice: p.sellingPrice, stock: p.stock, minStock: p.minStock, unit: p.unit, imageUrl: p.imageUrl, isActive: p.isActive }); setEditingProduct(p); setShowForm(true); };

  const handleSave = async () => {
    if (!storeId) return;
    setSaving(true);
    try {
      if (editingProduct) {
        await updateProduct(storeId, editingProduct.id, form);
      } else {
        await addProduct(storeId, form);
      }
      setShowForm(false);
    } catch (e) { alert("خطأ: " + e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (p: Product) => {
    if (!storeId || !confirm(`حذف "${p.nameAr || p.name}"؟`)) return;
    await deleteProduct(storeId, p.id);
  };

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><label className="label">{label}</label>{children}</div>
  );

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>المنتجات</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>{products.length} منتج إجمالاً</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={18} /> منتج جديد</button>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: "1rem" }}>
        <Search size={18} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
        <input className="input-field" style={{ paddingRight: "2.5rem" }} placeholder="بحث بالاسم أو الباركود..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>المنتج</th><th>الفئة</th><th>سعر الشراء</th><th>سعر البيع</th><th>المخزون</th><th>الحالة</th><th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>جارٍ التحميل...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>
                <Package size={32} style={{ margin: "0 auto 0.5rem", opacity: 0.3 }} /><br />لا توجد منتجات
              </td></tr>
            ) : filtered.map(p => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 600, color: "#17231c" }}>{p.nameAr || p.name}</div>
                  {p.nameAr && <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{p.name}</div>}
                  {p.barcode && <div style={{ fontSize: "0.7rem", color: "#9ca3af", fontFamily: "monospace" }}>{p.barcode}</div>}
                </td>
                <td><span className="badge-green">{p.category}</span></td>
                <td style={{ color: "#6b7280" }}>{formatCurrency(p.purchasePrice)}</td>
                <td style={{ fontWeight: 600, color: "#26683a" }}>{formatCurrency(p.sellingPrice)}</td>
                <td>
                  <span className={p.stock === 0 ? "badge-red" : p.stock <= p.minStock ? "badge-orange" : "badge-green"}>
                    {p.stock} {p.unit}
                  </span>
                </td>
                <td><span className={p.isActive ? "badge-green" : "badge-red"}>{p.isActive ? "نشط" : "معطل"}</span></td>
                <td>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => openEdit(p)} className="btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(p)} className="btn-danger" style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Product Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="card animate-slide-up" style={{ width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 style={{ fontWeight: 700 }}>{editingProduct ? "تعديل منتج" : "منتج جديد"}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <F label="الاسم (عربي)">
                <input className="input-field" value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder="اسم المنتج بالعربية" />
              </F>
              <F label="الاسم (فرنسي/إنجليزي)">
                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" dir="ltr" style={{ textAlign: "left" }} />
              </F>
              <F label="الباركود">
                <input className="input-field" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} placeholder="رقم الباركود" dir="ltr" style={{ textAlign: "left" }} />
              </F>
              <F label="الفئة">
                <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </F>
              <F label="سعر الشراء (د.ج)">
                <input type="number" min="0" className="input-field" value={form.purchasePrice || ""} onChange={e => setForm(f => ({ ...f, purchasePrice: Number(e.target.value) }))} />
              </F>
              <F label="سعر البيع (د.ج)">
                <input type="number" min="0" className="input-field" value={form.sellingPrice || ""} onChange={e => setForm(f => ({ ...f, sellingPrice: Number(e.target.value) }))} />
              </F>
              <F label="الكمية الحالية">
                <input type="number" min="0" className="input-field" value={form.stock || ""} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} />
              </F>
              <F label="حد التنبيه (نفاد)">
                <input type="number" min="0" className="input-field" value={form.minStock || ""} onChange={e => setForm(f => ({ ...f, minStock: Number(e.target.value) }))} />
              </F>
              <F label="وحدة القياس">
                <select className="input-field" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value as ProductFormData["unit"] }))}>
                  {["pcs", "kg", "g", "l", "ml", "box"].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </F>
              <F label="الحالة">
                <select className="input-field" value={form.isActive ? "1" : "0"} onChange={e => setForm(f => ({ ...f, isActive: e.target.value === "1" }))}>
                  <option value="1">نشط</option>
                  <option value="0">معطل</option>
                </select>
              </F>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button onClick={() => setShowForm(false)} className="btn-secondary" style={{ flex: 1, justifyContent: "center" }}>إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 2, justifyContent: "center" }}>
                {saving ? "جارٍ الحفظ..." : editingProduct ? "حفظ التعديلات" : "إضافة المنتج"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
