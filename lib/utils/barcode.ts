/**
 * Barcode scanners send digits as keystrokes. When the OS keyboard layout is
 * Arabic, those keystrokes can arrive as Arabic-Indic digits (٠١٢٣…) or
 * Persian/Extended Arabic-Indic digits (۰۱۲۳…) instead of Latin digits (0123…),
 * which breaks barcode lookups because product barcodes are stored in Latin.
 *
 * normalizeDigits converts any Arabic-Indic / Persian digit to its Latin
 * equivalent and leaves every other character untouched (so Arabic product
 * names typed for searching are not affected).
 */
export function normalizeDigits(input: string): string {
  if (!input) return input;
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    // Arabic-Indic digits U+0660..U+0669
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    // Extended Arabic-Indic (Persian) digits U+06F0..U+06F9
    return String(code - 0x06f0);
  });
}

/**
 * USB barcode scanners emulate a keyboard by sending the *physical* number-row
 * key codes. When the active OS layout is French AZERTY (common alongside Arabic
 * on these machines), those keys produce symbols instead of digits:
 *   &→1  é→2  "→3  '→4  (→5  -→6  è→7  _→8  ç→9  à→0
 * normalizeScannedDigits maps those symbols back to Latin digits, then applies
 * normalizeDigits for any Arabic-Indic digits.
 *
 * WARNING: only use this on known barcode input (scanner buffer / barcode field).
 * Never use it on free-text search, because it would corrupt French product names
 * containing é è à ç ' - etc.
 */
const AZERTY_NUMBER_ROW: Record<string, string> = {
  "&": "1", "é": "2", '"': "3", "'": "4", "(": "5",
  "-": "6", "è": "7", "_": "8", "ç": "9", "à": "0",
};

export function normalizeScannedDigits(input: string): string {
  if (!input) return input;
  const mapped = input.replace(/[&é"'(\-è_çà]/g, (ch) => AZERTY_NUMBER_ROW[ch] ?? ch);
  return normalizeDigits(mapped);
}

/** A product can carry several barcodes; this is structural to avoid a type import. */
interface HasBarcodes {
  barcode?: string;
  barcodes?: string[];
}

/** All non-empty barcodes of a product (falls back to the single `barcode`). */
export function productBarcodes(p: HasBarcodes): string[] {
  const list = p.barcodes && p.barcodes.length ? p.barcodes : p.barcode ? [p.barcode] : [];
  return list.map((b) => b.trim()).filter(Boolean);
}

/** True when `code` exactly matches any of the product's barcodes (digits normalized). */
export function productHasBarcode(p: HasBarcodes, code: string): boolean {
  const c = normalizeDigits(code.trim());
  if (!c) return false;
  return productBarcodes(p).some((b) => normalizeDigits(b) === c);
}

/** True when `term` is contained in any of the product's barcodes (for text search). */
export function productMatchesBarcodeSearch(p: HasBarcodes, term: string): boolean {
  const t = normalizeDigits(term.trim());
  if (!t) return false;
  return productBarcodes(p).some((b) => normalizeDigits(b).includes(t));
}
