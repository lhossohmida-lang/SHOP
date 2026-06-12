"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useSales } from "@/hooks/useSales";
import { useCredits } from "@/hooks/useCredits";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { TrendingUp, Users, AlertTriangle, Package } from "lucide-react";
import Link from "next/link";
import PasswordGate from "@/components/layout/PasswordGate";
import { getSalesByDateRange } from "@/lib/firestore/sales";
import type { Sale } from "@/types/sale";

export default function DashboardPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { products, activeProducts, lowStock } = useProducts(storeId);
  const { sales, todayCount, todayAvg } = useSales(storeId, 10);
  const { totalDebt, activeCustomers } = useCredits(storeId);

  // Load last 30 days sales for Weekly & Monthly Profit + accurate Today Profit
  const [thirtyDaysSales, setThirtyDaysSales] = useState<Sale[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    setLoadingStats(true);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);

    getSalesByDateRange(storeId, start, end)
      .then((data) => {
        setThirtyDaysSales(data);
        setLoadingStats(false);
      })
      .catch((err) => {
        console.error("Error fetching 30 days sales:", err);
        setLoadingStats(false);
      });
  }, [storeId]);

  const calculateProfit = useCallback((salesList: Sale[]) => {
    return salesList.reduce((sum, s) => {
      const cost = s.items.reduce((c, item) => {
        const p = products.find(prod => prod.id === item.productId);
        return c + (p?.purchasePrice || 0) * item.quantity;
      }, 0);
      return sum + s.total - cost;
    }, 0);
  }, [products]);

  // Today profit and sales total from the 30-day list (covers all sales today, not just last 10)
  const todaySales = thirtyDaysSales.filter(s => new Date(s.createdAt).toDateString() === new Date().toDateString());
  const todayTotal = todaySales.reduce((sum, s) => sum + s.total, 0);
  const todayProfit = calculateProfit(todaySales);

  // Weekly profit (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const weeklySales = thirtyDaysSales.filter(s => new Date(s.createdAt) >= sevenDaysAgo);
  const weeklyProfit = calculateProfit(weeklySales);

  // Monthly profit (last 30 days)
  const monthlyProfit = calculateProfit(thirtyDaysSales);

  // Top 5 products
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  sales.forEach(s => s.items.forEach(item => {
    if (!productSales[item.productId]) productSales[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
    productSales[item.productId].qty += item.quantity;
    productSales[item.productId].revenue += item.totalPrice;
  }));
  const topProducts = Object.entries(productSales).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);

  // Last 7 days bar chart (using the 30-day full list for correctness)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toDateString();
    return {
      label: d.toLocaleDateString("ar", { weekday: "short" }),
      total: thirtyDaysSales.filter(s => new Date(s.createdAt).toDateString() === dayStr).reduce((sum, s) => sum + s.total, 0),
    };
  });
  const maxVal = Math.max(...last7.map(d => d.total), 1);

  return (
    <PasswordGate>
      <div className="animate-fade-in" style={{ maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c" }}>لوحة التحكم</h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>مرحباً، {appUser?.displayName}</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { label: "مبيعات اليوم", value: loadingStats ? "..." : formatCurrency(todayTotal), sub: `${todaySales.length} فاتورة`, cls: "stat-card-green", icon: "📈" },
          { label: "ربح اليوم", value: loadingStats ? "..." : formatCurrency(todayProfit), sub: `متوسط ${formatCurrency(todayAvg)}`, cls: "stat-card-orange", icon: "💰" },
          { label: "ربح الأسبوع", value: loadingStats ? "..." : formatCurrency(weeklyProfit), sub: "آخر 7 أيام بالكامل", cls: "stat-card-green", icon: "📅" },
          { label: "ربح الشهر", value: loadingStats ? "..." : formatCurrency(monthlyProfit), sub: "آخر 30 يوماً بالكامل", cls: "stat-card-orange", icon: "🗓️" },
          { label: "إجمالي الديون", value: formatCurrency(totalDebt), sub: `${activeCustomers.length} عميل`, cls: "stat-card-yellow", icon: "👥" },
          { label: "المنتجات", value: String(activeProducts.length), sub: `${lowStock.length} على وشك النفاد`, cls: "stat-card-blue", icon: "📦" },
        ].map((s, i) => (
          <div key={i} className={s.cls}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <p style={{ opacity: 0.85, fontSize: "0.8rem", marginBottom: "0.25rem" }}>{s.label}</p>
                <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{s.value}</p>
              </div>
              <span style={{ fontSize: "1.75rem", opacity: 0.7 }}>{s.icon}</span>
            </div>
            <p style={{ opacity: 0.75, fontSize: "0.72rem", marginTop: "0.5rem" }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: "1rem", color: "#17231c" }}>مبيعات آخر 7 أيام</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "120px" }}>
            {last7.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <div style={{
                  width: "100%", borderRadius: "4px 4px 0 0",
                  background: i === 6 ? "linear-gradient(180deg, #49a35c, #26683a)" : "#c5e5b8",
                  height: `${Math.max((d.total / maxVal) * 100, 4)}px`, minHeight: "4px",
                }} />
                <span style={{ fontSize: "0.6rem", color: "#6b7280" }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: "1rem", color: "#17231c" }}>أكثر المنتجات مبيعاً</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {topProducts.length === 0 ? <p style={{ color: "#9ca3af", fontSize: "0.875rem" }}>لا توجد بيانات</p> :
              topProducts.map(([id, data], i) => (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: i === 0 ? "#eab308" : "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: i === 0 ? "white" : "#6b7280", flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data.name}</div>
                    <div style={{ fontSize: "0.68rem", color: "#6b7280" }}>{data.qty} وحدة</div>
                  </div>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#26683a" }}>{formatCurrency(data.revenue)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontWeight: 600, color: "#17231c" }}>آخر المبيعات</h3>
            <Link href="/reports" style={{ fontSize: "0.8rem", color: "#49a35c", textDecoration: "none" }}>عرض الكل</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {sales.slice(0, 6).map(s => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.75rem", borderRadius: "0.5rem", background: "#f8fdf5", border: "1px solid #eefae7" }}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: "0.5rem" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#17231c" }}>{s.receiptNumber}</div>
                  <div style={{ fontSize: "0.68rem", color: "#6b7280", marginTop: "1px" }}>{formatDateTime(s.createdAt)}</div>
                  <div style={{ fontSize: "0.72rem", color: "#4b5563", marginTop: "0.25rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.items.map(item => `${item.productName} × ${item.quantity}`).join("، ")}>
                    {s.items.map(item => `${item.productName} × ${item.quantity}`).join("، ")}
                  </div>
                </div>
                <div style={{ textAlign: "left", flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, color: "#26683a", fontSize: "0.85rem" }}>{formatCurrency(s.total)}</div>
                  <span className={s.paymentMethod === "credit" ? "badge-red" : "badge-green"} style={{ fontSize: "0.65rem", marginTop: "2px", display: "inline-block" }}>
                    {s.paymentMethod === "cash" ? "نقداً" : s.paymentMethod === "card" ? "بطاقة" : "آجل"}
                  </span>
                </div>
              </div>
            ))}
            {sales.length === 0 && <p style={{ color: "#9ca3af", fontSize: "0.875rem", textAlign: "center" }}>لا توجد مبيعات</p>}
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontWeight: 600, color: "#17231c", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <AlertTriangle size={18} color="#f97316" /> تنبيهات المخزون
            </h3>
            <Link href="/inventory" style={{ fontSize: "0.8rem", color: "#49a35c", textDecoration: "none" }}>إدارة</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {lowStock.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1rem" }}>
                <p style={{ color: "#49a35c", fontSize: "0.875rem" }}>✅ المخزون بحالة جيدة</p>
              </div>
            ) : lowStock.slice(0, 6).map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem", borderRadius: "0.5rem", background: p.stock === 0 ? "#fff5f5" : "#fffbeb" }}>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 500 }}>{p.nameAr || p.name}</div>
                  <div style={{ fontSize: "0.68rem", color: "#6b7280" }}>{p.category}</div>
                </div>
                <span className={p.stock === 0 ? "badge-red" : "badge-orange"}>{p.stock} {p.unit}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </PasswordGate>
  );
}
