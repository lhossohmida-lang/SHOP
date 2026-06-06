import type { Sale } from "@/types/sale";
import type { CreditCustomer, CreditTransaction } from "@/types/credit";
import { formatCurrency } from "./currency";
import { formatDateTime } from "./date";

async function executePrint(html: string, width = 450, height = 650): Promise<void> {
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
        // Opening a URL containing /api/print will be intercepted by Electron
        // and opened in the default browser (Chrome).
        window.open(`/api/print?id=${id}`, "_blank");
        return;
      }
    } catch (err) {
      console.error("Failed to send print job to Electron backend:", err);
    }
  }

  // Fallback for standard browsers / mobile / failures
  const win = window.open("", "_blank", `width=${width},height=${height}`);
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

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
  </script>
</body>
</html>`;

  executePrint(html, 450, 650);
}

export function printCustomerStatement(
  customer: CreditCustomer,
  txs: (CreditTransaction & { saleItems?: { productName: string; quantity: number; unitPrice: number; totalPrice: number }[] })[],
  storeName = "Blgasm POS"
): void {
  const typeMap: Record<string, string> = {
    purchase: "شراء (كريدي)",
    payment: "دفع دفعة",
    adjustment: "تعديل رصيد",
  };

  const rows = txs
    .map((tx) => {
      const typeStr = typeMap[tx.type] || tx.type;
      const sign = tx.type === "payment" ? "-" : "+";
      const color = tx.type === "payment" ? "green" : "red";

      let itemsStr = "";
      if (tx.saleItems && tx.saleItems.length > 0) {
        itemsStr = `<div style="font-size:11px;color:#555;margin-top:4px;padding-right:8px;border-right:2px solid #ccc;">
          ${tx.saleItems.map(i => `${i.productName} (${i.quantity} × ${formatCurrency(i.unitPrice)})`).join("<br/>")}
        </div>`;
      }

      return `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px;font-size:12px;">${formatDateTime(tx.createdAt)}</td>
          <td style="padding:8px;font-size:12px;">
            <strong>${typeStr}</strong>
            ${tx.note ? `<br/><small style="color:#666;">📝 ${tx.note}</small>` : ""}
            ${itemsStr}
          </td>
          <td style="padding:8px;font-size:12px;text-align:left;color:${color};font-weight:bold;">
            ${sign}${formatCurrency(tx.amount)}
          </td>
          <td style="padding:8px;font-size:12px;text-align:left;font-weight:bold;">
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
    body { font-family: Tahoma, Arial, sans-serif; font-size: 13px; margin: 0; padding: 20px; direction: rtl; color: #17231c; }
    .header { text-align: center; border-bottom: 2px solid #26683a; padding-bottom: 12px; margin-bottom: 20px; }
    .header h2 { margin: 0; font-size: 22px; color: #26683a; }
    .customer-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; background: #f8fdf5; padding: 15px; border-radius: 8px; border: 1px solid #c5e5b8; }
    .customer-info div { line-height: 1.6; }
    .title-tx { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #26683a; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    thead tr { background: #26683a; color: white; }
    th { padding: 10px 8px; font-size: 12px; text-align: right; }
    td { padding: 10px 8px; font-size: 12px; }
    .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #888; border-top: 1px dashed #ccc; padding-top: 12px; }
    @media print {
      body { padding: 0; }
      .customer-info { background: none; border: 1px solid #ccc; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>${storeName}</h2>
    <div style="font-size: 14px; margin-top: 5px; font-weight: bold;">كشف حساب عميل (كريدي)</div>
    <div style="font-size: 12px; color: #666; margin-top: 2px;">تاريخ الاستخراج: ${formatDateTime(new Date())}</div>
  </div>

  <div class="customer-info">
    <div>
      <strong>العميل:</strong> ${customer.name}<br/>
      <strong>الهاتف:</strong> ${customer.phone || "—"}<br/>
      <strong>العنوان:</strong> ${customer.address || "—"}
    </div>
    <div style="text-align: left;">
      <span style="font-size: 16px;"><strong>الدين الحالي:</strong> <span style="color:#dc2626;font-weight:bold;">${formatCurrency(customer.totalDebt)}</span></span><br/>
      <strong>حد الائتمان:</strong> ${formatCurrency(customer.creditLimit)}<br/>
      ${customer.dueDate ? `<strong>تاريخ الاستحقاق:</strong> <span style="color:#dc2626;font-weight:bold;">${customer.dueDate}</span>` : ""}
    </div>
  </div>

  <div class="title-tx">سجل المعاملات والديون التفصيلي</div>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">التاريخ والوقت</th>
        <th style="width: 45%;">نوع المعاملة / التفاصيل</th>
        <th style="text-align:left; width: 15%;">المبلغ</th>
        <th style="text-align:left; width: 15%;">الرصيد بعد المعاملة</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="4" style="text-align:center;padding:20px;color:#888;">لا توجد معاملات مسجلة لهذا العميل.</td></tr>'}
    </tbody>
  </table>

  <div class="footer">تم إنشاء هذا التقرير بواسطة Blgasm POS للخدمات التجارية</div>
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
  </script>
</body>
</html>`;

  executePrint(html, 850, 850);
}
