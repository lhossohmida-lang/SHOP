"use client";
import { useEffect, useRef, useCallback } from "react";
import { normalizeScannedDigits } from "@/lib/utils/barcode";

/**
 * Detects USB/serial barcode scanner input.
 * USB scanners send characters very rapidly (< 50ms apart) then press Enter.
 * This hook buffers those rapid keystrokes and calls onScan when complete.
 */

/**
 * Resolve the character a key press contributes to the barcode.
 *
 * Scanners emulate a keyboard by sending *physical* key scan codes, so on an
 * AZERTY/Arabic layout the number row produces symbols (& é " ' …) instead of
 * digits. `e.code` is the physical key, independent of the OS layout, so we read
 * digits straight from it (Digit0-9 / Numpad0-9). Other keys fall back to the
 * produced character.
 */
function charFromKey(e: KeyboardEvent): string | null {
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  if (/^Numpad[0-9]$/.test(e.code)) return e.code.slice(6);
  return e.key.length === 1 ? e.key : null;
}
export function useUsbScanner(
  onScan: (barcode: string) => void,
  enabled = true
) {
  const bufferRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyTimeRef = useRef<number>(0);

  const flush = useCallback(() => {
    // Safety net: convert any AZERTY number-row symbols / Arabic-Indic digits the
    // buffer may still hold into Latin digits so barcodes match the stored ones.
    const code = normalizeScannedDigits(bufferRef.current.trim());
    if (code.length >= 3) {
      onScan(code);
    }
    bufferRef.current = "";
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only intercept when no input/textarea is focused. When a real field is
      // focused it owns the keystrokes — drop any partial scanner buffer/timer so
      // a stale flush can't overwrite what the user is typing.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        bufferRef.current = "";
        return;
      }

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

      // Accept printable characters, reading digits from the physical key so the
      // OS keyboard layout (AZERTY/Arabic) can't turn them into symbols.
      const ch = charFromKey(e);
      if (ch !== null) {
        bufferRef.current += ch;

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
