"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { enableNetwork, disableNetwork } from "firebase/firestore";
import { db } from "@/lib/firebase";

// حدّ زمن الاستجابة (ping): إن تجاوزه الاتصال يُعتبر ضعيفاً → ينتقل تلقائياً لعدم الاتصال.
const LATENCY_LIMIT_MS = 300;
const CHECK_INTERVAL_MS = 15000; // قياس كل 15 ثانية
const PING_TIMEOUT_MS = 3000;
const PING_URL = "https://www.google.com/generate_204";

/**
 * يدير وضع الاتصال:
 * - تبديل يدوي بين متصل/غير متصل.
 * - قياس دوري لزمن الاستجابة؛ إن كان الاتصال ضعيفاً (>300ms) أو منقطعاً يُفرَض وضع عدم الاتصال
 *   ولا يُسمح بالاتصال حتى يتحسّن.
 * - يطبّق الوضع فعلياً على Firestore (enableNetwork / disableNetwork).
 */
export function useNetworkMode() {
  const [manualOffline, setManualOffline] = useState(false); // اختيار المستخدم
  const [weak, setWeak] = useState(false); // اتصال ضعيف أو منقطع
  const [latency, setLatency] = useState<number | null>(null);
  const appliedRef = useRef<boolean | null>(null);

  // متصل فعلياً = لم يختر المستخدم عدم الاتصال + الاتصال ليس ضعيفاً
  const effectiveOnline = !manualOffline && !weak;

  // قياس زمن الاستجابة دورياً
  useEffect(() => {
    let cancelled = false;

    const measure = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!cancelled) { setWeak(true); setLatency(null); }
        return;
      }
      const start = performance.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      try {
        await fetch(PING_URL, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
        const ms = Math.round(performance.now() - start);
        if (!cancelled) { setLatency(ms); setWeak(ms > LATENCY_LIMIT_MS); }
      } catch {
        if (!cancelled) { setLatency(null); setWeak(true); }
      } finally {
        clearTimeout(timer);
      }
    };

    measure();
    const id = setInterval(measure, CHECK_INTERVAL_MS);
    const onOnline = () => measure();
    const onOffline = () => { setWeak(true); setLatency(null); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // طبّق وضع Firestore عند تغيّر الحالة الفعلية فقط
  useEffect(() => {
    if (appliedRef.current === effectiveOnline) return;
    appliedRef.current = effectiveOnline;
    (effectiveOnline ? enableNetwork(db) : disableNetwork(db)).catch(() => {});
  }, [effectiveOnline]);

  // التبديل اليدوي (لا يُمكن الاتصال إن كان الاتصال ضعيفاً — يبقى عدم اتصال)
  const toggle = useCallback(() => setManualOffline((prev) => !prev), []);

  return { effectiveOnline, manualOffline, weak, latency, toggle };
}
