"use client";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useSales } from "@/hooks/useSales";
import { useCredits } from "@/hooks/useCredits";
import { useAjal } from "@/hooks/useAjal";
import { getExpensesByDateRange } from "@/lib/firestore/expenses";
import { formatCurrency } from "@/lib/utils/currency";
import { STORE_NAME } from "@/lib/constants/branding";
import { Sparkles, Send, Loader2, RefreshCw } from "lucide-react";
import type { Expense } from "@/types/expense";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const suggestions = [
  "ما هي أكثر المنتجات مبيعاً هذا الأسبوع؟",
  "ما هي المنتجات التي أوشكت على النفاد؟",
  "ما هو إجمالي الديون غير المسددة؟",
  "أعطني تقريراً مالياً موجزاً",
];

export default function AiPage() {
  const { appUser } = useAuth();
  const storeId = appUser?.storeId;
  const { products, activeProducts, lowStock } = useProducts(storeId);
  const { sales, todaySales, todayTotal, todayCount } = useSales(storeId, 50);
  const { customers, totalDebt } = useCredits(storeId);
  const { customers: ajalCustomers, totalDebt: ajalDebt } = useAjal(storeId);
  const [monthExpenses, setMonthExpenses] = useState<Expense[]>([]);

  // مصاريف الشهر الحالي (لمنح المساعد رؤية كاملة للمصاريف)
  useEffect(() => {
    if (!storeId) return;
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    getExpensesByDateRange(storeId, start, end).then(setMonthExpenses).catch(() => {});
  }, [storeId]);

  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: `مرحباً! أنا مساعدك الذكي لمتجر ${STORE_NAME}. يمكنني تحليل بيانات مبيعاتك ومخزونك وديون عملائك. كيف يمكنني مساعدتك؟ 🌿` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // يبني نصاً للمساعد: ملخصات شاملة + تفاصيل المنتجات المذكورة في السؤال فقط (لتقليل التكلفة).
  const buildContext = (question = "") => {
    const fmt = formatCurrency;
    const priceMap = new Map(products.map(p => [p.id, p.purchasePrice]));

    // أفضل المنتجات مبيعاً (من آخر الفواتير المحمّلة)
    const topAgg = sales.reduce((acc: Record<string, { name: string; qty: number; revenue: number }>, s) => {
      s.items.forEach(item => {
        if (!acc[item.productId]) acc[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
        acc[item.productId].qty += item.quantity;
        acc[item.productId].revenue += item.totalPrice;
      });
      return acc;
    }, {});
    const topProducts = Object.values(topAgg).sort((a, b) => b.qty - a.qty).slice(0, 10);

    // تفصيل المبيعات حسب طريقة الدفع + تقدير الربح
    const cashSales = sales.filter(s => s.paymentMethod === "cash");
    const creditSales = sales.filter(s => s.paymentMethod === "credit");
    const salesRevenue = sales.reduce((a, s) => a + s.total, 0);
    const salesCost = sales.reduce((a, s) => a + s.items.reduce((c, it) => c + (priceMap.get(it.productId) || 0) * it.quantity, 0), 0);
    const grossProfit = salesRevenue - salesCost;

    // المخزون
    const inventoryValue = products.reduce((a, p) => a + p.stock * p.purchasePrice, 0);
    const outOfStock = activeProducts.filter(p => p.stock === 0);
    const categories = Array.from(new Set(activeProducts.map(p => p.category)));

    // بحث ذكي: تفاصيل المنتجات المذكورة في السؤال فقط (بدل إرسال كل المنتجات → توفير كبير).
    const qWords = question.toLowerCase().split(/\s+/).map(w => w.replace(/[؟?.,!:؛،]/g, "")).filter(w => w.length >= 3);
    const matched = qWords.length
      ? activeProducts.filter(p => {
          const ar = (p.nameAr || "").toLowerCase();
          const en = (p.name || "").toLowerCase();
          return qWords.some(w => ar.includes(w) || en.includes(w) || (!!p.barcode && p.barcode.includes(w)));
        }).slice(0, 12)
      : [];
    const matchedLines = matched.map(p =>
      `${p.nameAr || p.name} | فئة:${p.category || "-"} | شراء:${p.purchasePrice} | بيع:${p.sellingPrice} | مخزون:${p.stock}${p.barcode ? ` | باركود:${p.barcode}` : ""}`
    ).join("\n");
    const productsSection = matched.length
      ? `\n\n— تفاصيل المنتجات المذكورة في سؤالك —\n${matchedLines}`
      : "";

    // عملاء الكريدي المدينون
    const debtors = customers.filter(c => c.totalDebt > 0).sort((a, b) => b.totalDebt - a.totalDebt);
    const custLines = debtors.slice(0, 100).map(c => `${c.name} | هاتف:${c.phone || "-"} | دين:${fmt(c.totalDebt)}${c.dueDate ? ` | استحقاق:${c.dueDate}` : ""}`).join("\n");

    // عملاء الآجل المدينون
    const ajalDebtors = ajalCustomers.filter(c => c.totalDebt > 0).sort((a, b) => b.totalDebt - a.totalDebt);
    const ajalLines = ajalDebtors.slice(0, 50).map(c => `${c.name} | دين:${fmt(c.totalDebt)}`).join("\n");

    // مصاريف الشهر
    const expensesTotal = monthExpenses.reduce((a, e) => a + e.amount, 0);
    const expLines = monthExpenses.slice(0, 40).map(e => `${e.title}: ${fmt(e.amount)}${e.note ? ` (${e.note})` : ""}`).join("\n");

    const storeData = `التاريخ: ${new Date().toLocaleString("ar-DZ")}

— المبيعات —
مبيعات اليوم: ${fmt(todayTotal)} (${todayCount} فاتورة)
آخر ${sales.length} فاتورة محمّلة: إجمالي ${fmt(salesRevenue)}
  • نقداً: ${cashSales.length} فاتورة بقيمة ${fmt(cashSales.reduce((a, s) => a + s.total, 0))}
  • كريدي: ${creditSales.length} فاتورة بقيمة ${fmt(creditSales.reduce((a, s) => a + s.total, 0))}
تقدير رأس المال (تكلفة البضاعة المباعة): ${fmt(salesCost)}
تقدير الفائدة/الربح: ${fmt(grossProfit)}

— أفضل المنتجات مبيعاً —
${topProducts.map(d => `${d.name}: ${d.qty} وحدة، ${fmt(d.revenue)}`).join("\n") || "لا توجد بيانات"}

— المخزون —
عدد المنتجات النشطة: ${activeProducts.length} | الفئات: ${categories.join("، ")}
قيمة المخزون (بسعر الشراء): ${fmt(inventoryValue)}
نفدت تماماً (${outOfStock.length}): ${outOfStock.slice(0, 30).map(p => p.nameAr || p.name).join("، ") || "لا شيء"}
مخزون منخفض (${lowStock.length}): ${lowStock.slice(0, 30).map(p => `${p.nameAr || p.name}(${p.stock})`).join("، ") || "لا شيء"}${productsSection}

— الكريديات (ديون العملاء) —
إجمالي الديون: ${fmt(totalDebt)} | عدد العملاء: ${customers.length} | مدينون: ${debtors.length}
${custLines || "لا يوجد مدينون"}

— الكريديات الآجلة —
إجمالي ديون الآجل: ${fmt(ajalDebt)} | عدد العملاء: ${ajalCustomers.length}
${ajalLines || "لا يوجد"}

— مصاريف الشهر الحالي —
الإجمالي: ${fmt(expensesTotal)} (${monthExpenses.length} مصروف)
${expLines || "لا توجد مصاريف"}

ملاحظة: عدد المنتجات كبير، لذا تظهر تفاصيل سعر/مخزون/باركود أي منتج تلقائياً عند ذكر اسمه في السؤال. إن سُئلت عن منتج لم تظهر تفاصيله، اطلب من المستخدم كتابة اسمه بدقة.`;

    return { storeData };
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const ctx = buildContext(text);

      // Detect environment: Electron serves from 127.0.0.1, APK from localhost/capacitor
      const isElectron =
        typeof window !== "undefined" && window.location.hostname === "127.0.0.1";

      let reply = "";
      let success = false;

      if (isElectron) {
        // ── Electron: call local Next.js API route first ──
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        try {
          const res = await fetch("/api/ai/chat", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, context: ctx }),
          });
          if (res.ok) {
            const data = await res.json();
            // "API key not set." من الخادم = فشل، فنسقط إلى الجلب المباشر الذي يحوي المفتاح
            if (data.reply && !data.reply.startsWith("❌") && data.reply !== "API key not set.") {
              reply = data.reply;
              success = true;
            }
          }
        } catch (err) {
          console.warn("Local API route failed, trying direct client-side fetch...", err);
        } finally {
          clearTimeout(timeoutId);
        }
      }

      if (!success) {
        // ── Direct client-side fetch to OpenRouter (for APK, Web, or as fallback for EXE) ──
        const apiKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
        const model = process.env.NEXT_PUBLIC_AI_MODEL || "nousresearch/hermes-3-llama-3.1-405b:free";
        // نماذج احتياطية إن فشل الأساسي (Provider error / حد مجاني)
        const fallbackModels = ["qwen/qwen3-next-80b-a3b-instruct:free", "meta-llama/llama-3.2-3b-instruct:free"];
        // OpenRouter يسمح بـ3 نماذج كحدّ أقصى
        const models = [model, ...fallbackModels.filter((m) => m !== model)].slice(0, 3);

        if (!apiKey || apiKey === "your-openrouter-key-here") {
          setMessages(prev => [...prev, { role: "assistant", content: "⚠️ مفتاح OpenRouter API غير مُعين." }]);
          return;
        }

        const systemPrompt = `أنت المساعد الذكي لمتجر "${STORE_NAME}" ولديك صلاحية كاملة للوصول إلى كل بيانات المتجر أدناه (المنتجات، الأسعار، المخزون، المبيعات، الأرباح، الديون والكريديات، الآجل، المصاريف). استعمل هذه البيانات للإجابة بدقة عن أي سؤال يخص المتجر. أجب دائماً باللغة العربية بوضوح وتفصيل مفيد، واذكر الأرقام عند توفّرها.\n\n=== بيانات المتجر ===\n${ctx.storeData}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        let res: Response;
        try {
          res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://blgasm-pos.app",
              "X-Title": "Blgasm POS",
            },
            body: JSON.stringify({
              models, // النموذج الأساسي + الاحتياطية (OpenRouter يجرّبها بالترتيب)
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text },
              ],
              max_tokens: 1024,
            }),
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const serverError = errData?.error?.message || `HTTP ${res.status}`;
          // 429 أو خطأ المزوّد = تجاوز الحدّ اليومي المجاني → رسالة واضحة
          if (res.status === 429 || /rate|limit|provider returned error/i.test(serverError)) {
            reply = "⚠️ تم تجاوز الحدّ اليومي المجاني للمساعد الذكي. حاول مرة أخرى بعد عدة ساعات، أو أضف رصيداً بسيطاً لحساب OpenRouter لرفع الحدّ.";
          } else {
            reply = `❌ خطأ من OpenRouter (${model}): ${serverError}`;
          }
        } else {
          const data = await res.json();
          reply = data.choices?.[0]?.message?.content || "عذراً، لم أتمكن من الإجابة في الوقت الحالي.";
        }
      }

      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e: any) {
      const isTimeout = e?.name === "AbortError";
      const errMsg = isTimeout
        ? "انتهت مهلة الاتصال. تحقق من اتصالك بالإنترنت."
        : (e instanceof Error ? e.message : String(e));
      setMessages(prev => [...prev, { role: "assistant", content: `❌ ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#17231c", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Sparkles size={24} color="#49a35c" /> المساعد الذكي
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>مدعوم بـ AI — يحلل بيانات متجرك في الوقت الفعلي</p>
      </div>

      {/* Chat container */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "white", borderRadius: "1rem", boxShadow: "0 8px 24px rgba(23,35,28,0.08)", overflow: "hidden" }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-start" : "flex-end" }}>
              <div style={{
                maxWidth: "75%", padding: "0.75rem 1rem", borderRadius: msg.role === "user" ? "1rem 1rem 0 1rem" : "1rem 1rem 1rem 0",
                background: msg.role === "user" ? "#f1f8ee" : "linear-gradient(135deg, #49a35c, #26683a)",
                color: msg.role === "user" ? "#17231c" : "white",
                fontSize: "0.875rem", lineHeight: 1.6,
                boxShadow: "0 2px 8px rgba(23,35,28,0.08)",
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ padding: "0.75rem 1rem", borderRadius: "1rem 1rem 1rem 0", background: "linear-gradient(135deg, #49a35c, #26683a)", color: "white", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
                <Loader2 size={16} className="animate-spin" /> جارٍ التحليل…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div style={{ padding: "0 1.25rem 0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s)} style={{
                padding: "0.375rem 0.75rem", borderRadius: "9999px",
                border: "1px solid #c5e5b8", background: "#f1f8ee",
                color: "#26683a", fontSize: "0.78rem", cursor: "pointer",
                transition: "all 0.15s",
              }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid #f3f4f6", display: "flex", gap: "0.75rem" }}>
          <button onClick={() => setMessages([{ role: "assistant", content: "مرحباً! كيف يمكنني مساعدتك؟ 🌿" }])} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "0.5rem", cursor: "pointer", color: "#6b7280" }}>
            <RefreshCw size={18} />
          </button>
          <input
            className="input-field" style={{ flex: 1 }}
            placeholder="اسأل عن مبيعاتك، مخزونك، أو ديون العملاء..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading} className="btn-primary" style={{ padding: "0.5rem 1rem" }}>
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
