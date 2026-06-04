"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { addProduct, updateProduct, deleteProduct } from "@/lib/firestore/products";
import { formatCurrency } from "@/lib/utils/currency";
import { ProductForm } from "@/components/products/ProductForm";
import type { ProductFormData, Product } from "@/types/product";
import { Plus, Search, Edit2, Trash2, Package } from "lucide-react";

export default function ProductsPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { products, loading } = useProducts(storeId);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.nameAr.includes(search) ||
      p.barcode.includes(search)
  );

  const openNew = () => { setEditingProduct(null); setShowForm(true); };
  const openEdit = (p: Product) => { setEditingProduct(p); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingProduct(null); };

  const handleSave = async (data: ProductFormData) => {
    if (!storeId) return;
    setSaving(true);
    try {
      if (editingProduct) {
        await updateProduct(storeId, editingProduct.id, data);
      } else {
        await addProduct(storeId, data);
      }
      closeForm();
    } catch (e) {
      alert("خطأ في الحفظ: " + e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Product) => {
    if (!storeId || !confirm(`حذف "${p.nameAr || p.name}"؟`)) return;
    await deleteProduct(storeId, p.id);
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>المنتجات</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>{products.length} منتج إجمالاً</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={18} /> منتج جديد
        </button>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: "1rem" }}>
        <Search
          size={18}
          style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}
        />
        <input
          className="input-field"
          style={{ paddingRight: "2.5rem" }}
          placeholder="بحث بالاسم أو الباركود..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>المنتج</th>
              <th>الفئة</th>
              <th>سعر الشراء</th>
              <th>سعر البيع</th>
              <th>هامش الربح</th>
              <th>المخزون</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>
                  جارٍ التحميل...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
                  <Package size={40} style={{ margin: "0 auto 0.75rem", opacity: 0.2 }} />
                  <br />
                  {search ? "لا توجد نتائج" : "لا توجد منتجات. أضف منتجاً جديداً!"}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const margin =
                  p.sellingPrice > 0 && p.purchasePrice > 0
                    ? (((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100).toFixed(1)
                    : null;
                const expiry = p.expiryDate ? (() => {
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  const exp = new Date(p.expiryDate);
                  exp.setHours(0, 0, 0, 0);
                  const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  if (diff <= 0) return { label: "منتهي الصلاحية", color: "#dc2626", bg: "#fef2f2" };
                  if (diff <= 30) return { label: `ينتهي خلال ${diff} يوم`, color: "#d97706", bg: "#fffbeb" };
                  return { label: p.expiryDate, color: "#4b5563", bg: "#f3f4f6" };
                })() : null;

                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "#17231c" }}>{p.nameAr || p.name}</div>
                      {p.nameAr && <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{p.name}</div>}
                      <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", marginTop: "0.25rem", flexWrap: "wrap" }}>
                        {p.barcode && (
                          <span style={{ fontSize: "0.7rem", color: "#9ca3af", fontFamily: "monospace", background: "#f9fafb", padding: "1px 4px", borderRadius: "3px" }}>
                            📊 {p.barcode}
                          </span>
                        )}
                        {expiry && (
                          <span style={{ fontSize: "0.7rem", color: expiry.color, background: expiry.bg, padding: "1px 6px", borderRadius: "3px", fontWeight: 600 }}>
                            📅 {expiry.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td><span className="badge-green">{p.category}</span></td>
                    <td style={{ color: "#6b7280" }}>{formatCurrency(p.purchasePrice)}</td>
                    <td style={{ fontWeight: 600, color: "#26683a" }}>{formatCurrency(p.sellingPrice)}</td>
                    <td>
                      {margin ? (
                        <span className={Number(margin) < 10 ? "badge-orange" : "badge-green"}>
                          {margin}%
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      <span className={p.stock === 0 ? "badge-red" : p.stock <= p.minStock ? "badge-orange" : "badge-green"}>
                        {p.stock} {p.unit}
                      </span>
                    </td>
                    <td>
                      <span className={p.isActive ? "badge-green" : "badge-red"}>
                        {p.isActive ? "نشط" : "معطل"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          onClick={() => openEdit(p)}
                          className="btn-secondary"
                          style={{ padding: "0.25rem 0.5rem" }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="btn-danger"
                          style={{ padding: "0.25rem 0.5rem" }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Product Form Modal — rendered as separate component to prevent cursor reset */}
      {showForm && (
        <ProductForm
          initial={editingProduct}
          onSave={handleSave}
          onClose={closeForm}
          saving={saving}
        />
      )}
    </div>
  );
}
