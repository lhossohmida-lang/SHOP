import { NextRequest, NextResponse } from "next/server";

const AI_MODEL = process.env.NEXT_PUBLIC_AI_MODEL || "meta-llama/llama-3.1-8b-instruct:free";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const { message, context } = await req.json();

    if (!OPENROUTER_KEY || OPENROUTER_KEY === "your-openrouter-key-here") {
      return NextResponse.json({ reply: "API key not set." });
    }

    const systemPrompt = `You are a smart store assistant. Store data:\n- Sales: ${context?.salesSummary || "N/A"}\n- Inventory: ${context?.inventorySummary || "N/A"}\n- Credits/Debt: ${context?.creditsSummary || "N/A"}\n- Top products: ${context?.topProducts || "N/A"}\nAlways respond in Arabic language, concisely and helpfully.`;

    // 60-second timeout for server-side fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://blgasm-pos.app",
          "X-Title": "Blgasm POS",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          max_tokens: 512,
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${response.status}`;
      return NextResponse.json({ reply: `❌ خطأ من OpenRouter (${AI_MODEL}): ${errMsg}` });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "عذراً، لم أتمكن من الإجابة.";
    return NextResponse.json({ reply });

  } catch (error: any) {
    const isTimeout = error?.name === "AbortError";
    const msg = isTimeout
      ? "انتهت مهلة الاتصال (60 ثانية)"
      : (error instanceof Error ? error.message : String(error));
    return NextResponse.json({ reply: `❌ ${msg}` }, { status: 500 });
  }
}
