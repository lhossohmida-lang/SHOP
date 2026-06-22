import { NextRequest, NextResponse } from "next/server";

const AI_MODEL = process.env.NEXT_PUBLIC_AI_MODEL || "nousresearch/hermes-3-llama-3.1-405b:free";
// نماذج احتياطية مجانية: إن فشل النموذج الأساسي (Provider error / حد مجاني) يجرّب OpenRouter التالي تلقائياً
const AI_FALLBACKS = ["qwen/qwen3-next-80b-a3b-instruct:free", "meta-llama/llama-3.2-3b-instruct:free"];
// OpenRouter يسمح بـ3 نماذج كحدّ أقصى في مصفوفة models
const AI_MODELS = [AI_MODEL, ...AI_FALLBACKS.filter((m) => m !== AI_MODEL)].slice(0, 3);
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const { message, context } = await req.json();

    if (!OPENROUTER_KEY || OPENROUTER_KEY === "your-openrouter-key-here") {
      return NextResponse.json({ reply: "API key not set." });
    }

    const systemPrompt = `أنت المساعد الذكي لمتجر "بلقاسم" ولديك صلاحية كاملة للوصول إلى كل بيانات المتجر أدناه (المنتجات، الأسعار، المخزون، المبيعات، الأرباح، الديون والكريديات، الآجل، المصاريف، صندوق النقود). استعمل هذه البيانات للإجابة بدقة عن أي سؤال يخص المتجر: التحليل، الإحصاء، التوصيات، أفضل/أسوأ المنتجات، الأرباح، الديون، المخزون الناقص، إلخ. أجب دائماً باللغة العربية بوضوح وتفصيل مفيد، واذكر الأرقام عند توفّرها.\n\n=== بيانات المتجر ===\n${context?.storeData || "لا توجد بيانات."}`;

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
          models: AI_MODELS, // النموذج الأساسي + الاحتياطية (OpenRouter يجرّبها بالترتيب)
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          max_tokens: 1024,
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${response.status}`;
      // 429 أو خطأ المزوّد = تجاوز الحدّ اليومي المجاني → رسالة واضحة بدل الخطأ التقني
      if (response.status === 429 || /rate|limit|provider returned error/i.test(errMsg)) {
        return NextResponse.json({ reply: "⚠️ تم تجاوز الحدّ اليومي المجاني للمساعد الذكي. حاول مرة أخرى بعد عدة ساعات، أو أضف رصيداً بسيطاً لحساب OpenRouter لرفع الحدّ." });
      }
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
