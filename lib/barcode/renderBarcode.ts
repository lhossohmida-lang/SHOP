import JsBarcode from "jsbarcode";
import { normalizeBarcode } from "./groceryFormats";

function detectFormat(digits: string): string {
  if (digits.length === 13) return "EAN13";
  if (digits.length === 8) return "EAN8";
  if (digits.length === 12) return "UPC";
  return "CODE128";
}

/** Renders a barcode as an inline SVG string for print labels. */
export function renderBarcodeSvg(code: string): string {
  if (typeof document === "undefined") return "";

  const digits = normalizeBarcode(code);
  if (!digits) return "";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const options = {
    width: 1.1,
    height: 24,
    displayValue: true,
    fontSize: 7,
    margin: 0,
    textMargin: 1,
  };

  try {
    JsBarcode(svg, digits, { ...options, format: detectFormat(digits) });
    return svg.outerHTML;
  } catch {
    try {
      JsBarcode(svg, digits, { ...options, format: "CODE128" });
      return svg.outerHTML;
    } catch {
      return "";
    }
  }
}
