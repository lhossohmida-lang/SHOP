import { BarcodeFormat } from "@capacitor-mlkit/barcode-scanning";

/** Barcode formats common on grocery / food products */
export const GROCERY_BARCODE_FORMATS = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.UpcE,
  BarcodeFormat.Code128,
  BarcodeFormat.Itf,
];

export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidGroceryBarcode(code: string): boolean {
  const digits = normalizeBarcode(code);
  return digits.length >= 8 && digits.length <= 14;
}
