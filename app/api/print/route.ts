import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Mark as dynamic so this route is excluded from static (Android/Capacitor) exports.
// With output:"export" Next.js will skip routes marked dynamic="force-dynamic".
export const dynamic = "force-dynamic";

// In-memory store for print payloads
const printJobs = new Map<string, string>();

export async function POST(request: NextRequest) {
  try {
    const { html } = await request.json();
    if (!html) {
      return NextResponse.json({ error: "Missing HTML content" }, { status: 400 });
    }

    // Generate a unique ID for the print job
    const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
    printJobs.set(id, html);

    // Auto-delete after 5 minutes to prevent memory leaks
    setTimeout(() => {
      printJobs.delete(id);
    }, 5 * 60 * 1000);

    return NextResponse.json({ id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !printJobs.has(id)) {
    return new Response(
      "<!DOCTYPE html><html lang='ar' dir='rtl'><head><meta charset='utf-8'><title>خطأ</title></head><body style='font-family:sans-serif;text-align:center;padding:50px;'><h2>عذراً، انتهت صلاحية أمر الطباعة هذا أو أنه غير موجود.</h2></body></html>",
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const html = printJobs.get(id)!;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
