"use client";
import { useEffect, useRef, useCallback } from "react";

/**
 * Detects USB/serial barcode scanner input.
 * USB scanners send characters very rapidly (< 50ms apart) then press Enter.
 * This hook buffers those rapid keystrokes and calls onScan when complete.
 */
export function useUsbScanner(
  onScan: (barcode: string) => void,
  enabled = true
) {
  const bufferRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyTimeRef = useRef<number>(0);

  const flush = useCallback(() => {
    const code = bufferRef.current.trim();
    if (code.length >= 3) {
      onScan(code);
    }
    bufferRef.current = "";
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only intercept when no input/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const now = Date.now();
      const timeSinceLast = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        if (timerRef.current) clearTimeout(timerRef.current);
        flush();
        return;
      }

      // If gap > 100ms, reset buffer (human typing is slow)
      if (timeSinceLast > 100 && bufferRef.current.length > 0) {
        bufferRef.current = "";
      }

      // Only accept printable characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;

        // Auto-flush after 150ms of no input
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flush, 150);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, flush]);
}
