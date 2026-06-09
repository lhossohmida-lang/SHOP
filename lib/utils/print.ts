import type { Sale } from "@/types/sale";
import type { CreditCustomer, CreditTransaction } from "@/types/credit";
import { STORE_NAME } from "@/lib/constants/branding";
import { renderBarcodeSvg } from "@/lib/barcode/renderBarcode";
import { formatCurrency } from "./currency";
import { formatDateTime } from "./date";

/** Standard receipt / statement paper size */
const RECEIPT_PAGE = "88mm 100mm";
const RECEIPT_WINDOW = { width: 333, height: 378 };

/** Small product label paper size — 40mm wide × 20mm tall, landscape */
const LABEL_PAGE = "40mm 20mm";
const LABEL_WINDOW = { width: 151, height: 76 };

async function executePrint(
  html: string,
  width = RECEIPT_WINDOW.width,
  height = RECEIPT_WINDOW.height
): Promise<void> {
  const isElectron = typeof window !== "undefined" && window.navigator.userAgent.toLowerCase().includes("electron");

  if (isElectron) {
    try {
      const response = await fetch("/api/print", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ html }),
      });
      if (response.ok) {
        const { id } = await response.json();
        const absoluteUrl = `${window.location.origin}/api/print?id=${id}`;
        window.open(absoluteUrl, "_blank");
        return;
      }
    } catch (err) {
      console.error("Failed to send print job to Electron backend:", err);
    }
  }

  const win = window.open("", "_blank", `width=${width},height=${height}`);
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

function printScript(): string {
  return `
  <script>
    window.onload = function() {
      window.focus();
      window.onafterprint = function() {
        window.close();
      };
      setTimeout(function() {
        window.print();
        setTimeout(function() {
          window.close();
        }, 2000);
      }, 200);
    };
  </script>`;
}

function barcodeBlock(barcode?: string): string {
  if (!barcode) return "";
  const svg = renderBarcodeSvg(barcode);
  if (!svg) return "";
  return `<div class="barcode-wrap">${svg}</div>`;
}

export function printProductLabel(
  productName: string,
  sellingPrice: number,
  barcode?: string
): void {
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>${productName}</title>
  <style>
    @page { size: ${LABEL_PAGE}; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 40mm;
      height: 20mm;
      overflow: hidden;
      font-family: Tahoma, Arial, sans-serif;
      direction: rtl;
    }
    body {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 1mm;
      padding: 1mm 2mm;
      text-align: center;
    }
    .name {
      font-size: 6pt;
      font-weight: bold;
      color: #17231c;
      line-height: 1.2;
      max-width: 12mm;
      overflow: hidden;
      word-break: break-word;
      flex-shrink: 0;
    }
    .barcode-wrap {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      min-width: 0;
    }
    .barcode-wrap svg {
      max-width: 22mm;
      max-height: 14mm;
      height: auto;
    }
    .price {
      font-size: 8pt;
      font-weight: bold;
      color: #26683a;
      white-space: nowrap;
      flex-shrink: 0;
    }
    @media print {
      html, body { width: 40mm; height: 20mm; }
    }
  </style>
</head>
<body>
  <div class="name">${productName}</div>
  ${barcodeBlock(barcode)}
  <div class="price">${formatCurrency(sellingPrice)}</div>
  ${printScript()}
</body>
</html>`;

  executePrint(html, LABEL_WINDOW.width, LABEL_WINDOW.height);
}

function productLabelHtml(
  productName: string,
  sellingPrice: number,
  barcode?: string
): string {
  return `<div class="label-page">
  <div class="name">${productName}</div>
  ${barcodeBlock(barcode)}
  <div class="price">${formatCurrency(sellingPrice)}</div>
</div>`;
}

const labelPageStyles = `
    @page { size: ${LABEL_PAGE}; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { font-family: Tahoma, Arial, sans-serif; direction: rtl; }
    .label-page {
      width: 40mm;
      height: 20mm;
      overflow: hidden;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 1mm;
      padding: 1mm 2mm;
      text-align: center;
      page-break-after: always;
    }
    .label-page:last-child { page-break-after: auto; }
    .name {
      font-size: 6pt;
      font-weight: bold;
      color: #17231c;
      line-height: 1.2;
      max-width: 12mm;
      overflow: hidden;
      word-break: break-word;
      flex-shrink: 0;
    }
    .barcode-wrap {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      min-width: 0;
    }
    .barcode-wrap svg {
      max-width: 22mm;
      max-height: 14mm;
      height: auto;
    }
    .price {
      font-size: 8pt;
      font-weight: bold;
      color: #26683a;
      white-space: nowrap;
      flex-shrink: 0;
    }
`;

export function printProductLabelsBatch(
  products: { name: string; sellingPrice: number; barcode?: string }[]
): void {
  if (products.length === 0) return;

  const pages = products
    .map((p) => productLabelHtml(p.name, p.sellingPrice, p.barcode))
    .join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>طباعة ${products.length} بطاقة</title>
  <style>${labelPageStyles}</style>
</head>
<body>${pages}${printScript()}</body>
</html>`;

  executePrint(html, LABEL_WINDOW.width, LABEL_WINDOW.height);
}

export function printReceipt(sale: Sale, storeName = STORE_NAME): void {
  const lines = sale.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:2px 4px;font-size:9px;">${item.productName}</td>
          <td style="padding:2px 4px;text-align:center;font-size:9px;">${item.quantity}</td>
          <td style="padding:2px 4px;text-align:left;font-size:9px;">${formatCurrency(item.unitPrice)}</td>
          <td style="padding:2px 4px;text-align:left;font-size:9px;">${formatCurrency(item.totalPrice)}</td>
        </tr>`
    )
    .join("");

  const payMap: Record<string, string> = {
    cash: "نقداً",
    card: "بطاقة",
    credit: "على الحساب",
  };

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>وصل بيع ${sale.receiptNumber}</title>
  <style>
    @page { size: ${RECEIPT_PAGE}; margin: 2mm; }
    * { box-sizing: border-box; }
    html, body {
      width: 88mm;
      max-height: 100mm;
      overflow: hidden;
    }
    body { font-family: Tahoma, Arial, sans-serif; font-size: 9px; margin: 0; padding: 2mm; direction: rtl; }
    .header { text-align: center; border-bottom: 1px dashed #333; padding-bottom: 4px; margin-bottom: 4px; }
    .header h2 { margin: 0; font-size: 11px; }
    .meta { font-size: 8px; color: #555; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #f1f8ee; }
    th { padding: 2px 4px; font-size: 8px; text-align: right; border-bottom: 1px solid #ccc; }
    .totals { margin-top: 4px; border-top: 1px dashed #333; padding-top: 4px; }
    .totals tr td:first-child { font-weight: bold; }
    .total-row td { font-size: 10px; font-weight: bold; color: #26683a; }
    .footer { text-align: center; margin-top: 4px; font-size: 7px; color: #888; border-top: 1px dashed #ccc; padding-top: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <h2>${storeName}</h2>
    <div>وصل رقم: <strong>${sale.receiptNumber}</strong></div>
    <div>${formatDateTime(sale.createdAt)}</div>
  </div>
  <div class="meta">
    <div>الكاشير: ${sale.cashierName}</div>
    ${sale.customerName ? `<div>العميل: ${sale.customerName}</div>` : ""}
    <div>طريقة الدفع: ${payMap[sale.paymentMethod] || sale.paymentMethod}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>المنتج</th><th>الكمية</th><th>السعر</th><th>المجموع</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
  <table class="totals">
    <tr><td>المجموع الفرعي</td><td style="text-align:left;">${formatCurrency(sale.subtotal)}</td></tr>
    ${sale.discount > 0 ? `<tr><td>الخصم</td><td style="text-align:left;">-${formatCurrency(sale.discount)}</td></tr>` : ""}
    ${sale.tax > 0 ? `<tr><td>الضريبة</td><td style="text-align:left;">${formatCurrency(sale.tax)}</td></tr>` : ""}
    <tr class="total-row"><td>الإجمالي</td><td style="text-align:left;">${formatCurrency(sale.total)}</td></tr>
  </table>
  <div class="footer">شكراً لزيارتكم! • ${storeName}</div>
  ${printScript()}
</body>
</html>`;

  executePrint(html, RECEIPT_WINDOW.width, RECEIPT_WINDOW.height);
}

export function printCustomerStatement(
  customer: CreditCustomer,
  txs: (CreditTransaction & { saleItems?: { productName: string; quantity: number; unitPrice: number; totalPrice: number }[] })[],
  storeName = STORE_NAME
): void {
  const typeMap: Record<string, string> = {
    purchase: "شراء (كريدي)",
    payment: "دفع دفعة",
    adjustment: "إضافة دين",
  };

  const rows = txs
    .map((tx) => {
      const typeStr = typeMap[tx.type] || tx.type;
      const sign = tx.type === "payment" ? "-" : "+";
      const color = tx.type === "payment" ? "green" : "red";

      let itemsStr = "";
      if (tx.saleItems && tx.saleItems.length > 0) {
        itemsStr = `<div style="font-size:7px;color:#555;margin-top:2px;padding-right:4px;border-right:1px solid #ccc;">
          ${tx.saleItems.map(i => `${i.productName} (${i.quantity} × ${formatCurrency(i.unitPrice)})`).join("<br/>")}
        </div>`;
      }

      return `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:3px;font-size:7px;">${formatDateTime(tx.createdAt)}</td>
          <td style="padding:3px;font-size:7px;">
            <strong>${typeStr}</strong>
            ${tx.note ? `<br/><small style="color:#666;">${tx.note}</small>` : ""}
            ${itemsStr}
          </td>
          <td style="padding:3px;font-size:7px;text-align:left;color:${color};font-weight:bold;">
            ${sign}${formatCurrency(tx.amount)}
          </td>
          <td style="padding:3px;font-size:7px;text-align:left;font-weight:bold;">
            ${formatCurrency(tx.balanceAfter)}
          </td>
        </tr>
      `;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>كشف حساب عميل: ${customer.name}</title>
  <style>
    @page { size: ${RECEIPT_PAGE}; margin: 2mm; }
    * { box-sizing: border-box; }
    html, body {
      width: 88mm;
      max-height: 100mm;
      overflow: hidden;
    }
    body { font-family: Tahoma, Arial, sans-serif; font-size: 9px; margin: 0; padding: 2mm; direction: rtl; color: #17231c; }
    .header { text-align: center; border-bottom: 1px solid #26683a; padding-bottom: 4px; margin-bottom: 6px; }
    .header h2 { margin: 0; font-size: 11px; color: #26683a; }
    .customer-info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px; background: #f8fdf5; padding: 4px; border-radius: 4px; border: 1px solid #c5e5b8; font-size: 8px; }
    .customer-info div { line-height: 1.4; }
    .title-tx { font-size: 9px; font-weight: bold; margin-bottom: 4px; color: #26683a; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    thead tr { background: #26683a; color: white; }
    th { padding: 3px 2px; font-size: 7px; text-align: right; }
    td { padding: 3px 2px; font-size: 7px; }
    .footer { text-align: center; margin-top: 6px; font-size: 7px; color: #888; border-top: 1px dashed #ccc; padding-top: 4px; }
    @media print {
      body { padding: 0; }
      .customer-info { background: none; border: 1px solid #ccc; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>${storeName}</h2>
    <div style="font-size: 9px; margin-top: 2px; font-weight: bold;">كشف حساب عميل (كريدي)</div>
    <div style="font-size: 8px; color: #666; margin-top: 1px;">تاريخ الاستخراج: ${formatDateTime(new Date())}</div>
  </div>

  <div class="customer-info">
    <div>
      <strong>العميل:</strong> ${customer.name}<br/>
      <strong>الهاتف:</strong> ${customer.phone || "—"}<br/>
      <strong>العنوان:</strong> ${customer.address || "—"}
    </div>
    <div style="text-align: left;">
      <span style="font-size: 9px;"><strong>الدين الحالي:</strong> <span style="color:#dc2626;font-weight:bold;">${formatCurrency(customer.totalDebt)}</span></span><br/>
      <strong>حد الائتمان:</strong> ${formatCurrency(customer.creditLimit)}<br/>
      ${customer.dueDate ? `<strong>تاريخ الاستحقاق:</strong> <span style="color:#dc2626;font-weight:bold;">${customer.dueDate}</span>` : ""}
    </div>
  </div>

  <div class="title-tx">سجل المعاملات والديون التفصيلي</div>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">التاريخ</th>
        <th style="width: 45%;">التفاصيل</th>
        <th style="text-align:left; width: 15%;">المبلغ</th>
        <th style="text-align:left; width: 15%;">الرصيد</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="4" style="text-align:center;padding:8px;color:#888;">لا توجد معاملات مسجلة.</td></tr>'}
    </tbody>
  </table>

  <div class="footer">تم إنشاء هذا التقرير بواسطة ${storeName}</div>
  ${printScript()}
</body>
</html>`;

  executePrint(html, RECEIPT_WINDOW.width, RECEIPT_WINDOW.height);
}
