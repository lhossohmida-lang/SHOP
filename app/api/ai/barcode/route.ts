import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey || apiKey === "your-openrouter-key-here" || !imageBase64) {
      return NextResponse.json({ barcode: null, error: "missing_config" });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "بلقاسم Barcode OCR",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
              {
                type: "text",
                text: `Look at this image carefully. Find the barcode (EAN-13 or EAN-8). 
Read ONLY the digits printed in text below the barcode stripes (the human-readable number).
Return ONLY the digits with no spaces, dashes, or other characters.
If you see multiple groups like "6 130384 000182", return them joined: "6130384000182".
If no barcode number is visible, return exactly: NOT_FOUND
Return nothing else — just the digits or NOT_FOUND.`,
              },
            ],
          },
        ],
        max_tokens: 64,
      }),
    });

    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content || "").trim();

    // Clean: keep only digits
    const digits = raw.replace(/\D/g, "");

    if (!digits || raw === "NOT_FOUND" || digits.length < 8) {
      return NextResponse.json({ barcode: null, error: "not_detected" });
    }

    return NextResponse.json({ barcode: digits });
  } catch (error) {
    return NextResponse.json({ barcode: null, error: "server_error" }, { status: 500 });
  }
}
