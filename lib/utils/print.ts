import type { Sale } from "@/types/sale";
import { formatCurrency } from "./currency";
import { formatDateTime } from "./date";

export function printReceipt(sale: Sale, storeName = "Blgasm POS"): void {
  const lines = sale.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:4px 8px;">${item.productName}</td>
          <td style="padding:4px 8px;text-align:center;">${item.quantity}</td>
          <td style="padding:4px 8px;text-align:left;">${formatCurrency(item.unitPrice)}</td>
          <td style="padding:4px 8px;text-align:left;">${formatCurrency(item.totalPrice)}</td>
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
    body { font-family: Tahoma, Arial, sans-serif; font-size: 13px; margin: 0; padding: 20px; direction: rtl; }
    .header { text-align: center; border-bottom: 2px dashed #333; padding-bottom: 12px; margin-bottom: 12px; }
    .header h2 { margin: 0; font-size: 18px; }
    .meta { font-size: 12px; color: #555; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #f1f8ee; }
    th { padding: 6px 8px; font-size: 12px; text-align: right; border-bottom: 1px solid #ccc; }
    .totals { margin-top: 12px; border-top: 1px dashed #333; padding-top: 8px; }
    .totals tr td:first-child { font-weight: bold; }
    .total-row td { font-size: 15px; font-weight: bold; color: #26683a; }
    .footer { text-align: center; margin-top: 16px; font-size: 11px; color: #888; border-top: 1px dashed #ccc; padding-top: 8px; }
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
  <div class="footer">شكراً لزيارتكم! • Blgasm POS</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=400,height=600");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }
}
