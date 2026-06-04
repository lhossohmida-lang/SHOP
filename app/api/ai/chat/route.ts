import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { message, context } = await req.json();
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey || apiKey === "your-openrouter-key-here") {
      return NextResponse.json({
        reply: "⚠️ مفتاح OpenRouter API غير مُعين. أضف OPENROUTER_API_KEY في ملف .env.local للحصول على إجابات ذكية.",
      });
    }

    const systemPrompt = `أنت مساعد تحليلي ذكي لمتجر بقالة اسمه Blgasm POS. لديك وصول لبيانات المتجر التالية:
- ملخص المبيعات: ${context?.salesSummary || "غير متوفر"}
- حالة المخزون: ${context?.inventorySummary || "غير متوفر"}
- الكريديتيات (الديون): ${context?.creditsSummary || "غير متوفر"}
- أكثر المنتجات مبيعاً: ${context?.topProducts || "غير متوفر"}

أجب دائماً باللغة العربية بشكل موجز وعملي ومفيد. استخدم الأرقام والبيانات المتاحة في إجاباتك.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Blgasm POS",
      },
      body: JSON.stringify({
        model: process.env.NEXT_PUBLIC_AI_MODEL || "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        max_tokens: 512,
      }),
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "عذراً، لم أتمكن من الإجابة في الوقت الحالي.";
    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json({ reply: "❌ حدث خطأ في الاتصال بخدمة الذكاء الاصطناعي." }, { status: 500 });
  }
}
