"use client";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useSales } from "@/hooks/useSales";
import { useCredits } from "@/hooks/useCredits";
import { formatCurrency } from "@/lib/utils/currency";
import { STORE_NAME } from "@/lib/constants/branding";
import { Sparkles, Send, Loader2, RefreshCw } from "lucide-react";

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
  const { activeProducts, lowStock } = useProducts(storeId);
  const { sales, todayTotal } = useSales(storeId, 50);
  const { customers, totalDebt } = useCredits(storeId);

  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: `مرحباً! أنا مساعدك الذكي لمتجر ${STORE_NAME}. يمكنني تحليل بيانات مبيعاتك ومخزونك وديون عملائك. كيف يمكنني مساعدتك؟ 🌿` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const buildContext = () => {
    const topProducts = Object.entries(
      sales.reduce((acc: Record<string, { name: string; qty: number; revenue: number }>, s) => {
        s.items.forEach(item => {
          if (!acc[item.productId]) acc[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
          acc[item.productId].qty += item.quantity;
          acc[item.productId].revenue += item.totalPrice;
        });
        return acc;
      }, {})
    ).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);

    return {
      salesSummary: `مبيعات اليوم: ${formatCurrency(todayTotal)}، إجمالي الفواتير المسجلة: ${sales.length}`,
      inventorySummary: `إجمالي المنتجات النشطة: ${activeProducts.length}، منتجات على وشك النفاد: ${lowStock.length} (${lowStock.slice(0, 3).map(p => p.nameAr || p.name).join("، ")})`,
      creditsSummary: `إجمالي الديون: ${formatCurrency(totalDebt)}، عدد العملاء: ${customers.length}`,
      topProducts: topProducts.map(([, d]) => `${d.name}: ${d.qty} وحدة، ${formatCurrency(d.revenue)}`).join(" | "),
    };
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const ctx = buildContext();

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
            if (data.reply && !data.reply.startsWith("❌")) {
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
        const model = process.env.NEXT_PUBLIC_AI_MODEL || "meta-llama/llama-3.1-8b-instruct:free";

        if (!apiKey || apiKey === "your-openrouter-key-here") {
          setMessages(prev => [...prev, { role: "assistant", content: "⚠️ مفتاح OpenRouter API غير مُعين." }]);
          return;
        }

        const systemPrompt = `You are a smart store assistant. Store data: Sales: ${ctx.salesSummary}. Inventory: ${ctx.inventorySummary}. Credits: ${ctx.creditsSummary}. Top products: ${ctx.topProducts}. Always respond in Arabic language concisely.`;

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
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text },
              ],
            }),
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const serverError = errData?.error?.message || `HTTP ${res.status}`;
          reply = `❌ خطأ من OpenRouter (${model}): ${serverError}`;
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
