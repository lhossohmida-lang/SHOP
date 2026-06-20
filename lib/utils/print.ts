import type { Sale } from "@/types/sale";
import type { CreditCustomer, CreditTransaction } from "@/types/credit";
import { STORE_NAME } from "@/lib/constants/branding";
import { formatCurrency } from "./currency";
import { formatDateTime } from "./date";

/** Standard receipt / statement paper: 80mm thermal roll (height auto-fits content). */
const RECEIPT_WINDOW = { width: 303, height: 600 };

/** Small product label paper size — 40mm wide × 20mm tall, landscape */
const LABEL_PAGE = "40mm 20mm";
const LABEL_WINDOW = { width: 151, height: 76 };

/** True on Capacitor native or any mobile browser/WebView. */
function isMobileWebView(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as any).Capacitor) return true;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/** Inject the auto-print + "back" button behaviour right before </body>. */
function injectPrintScript(html: string): string {
  return html.replace("</body>", `${printScript()}</body>`);
}

/**
 * Mobile printing: render the document inside a hidden iframe in the CURRENT page
 * and trigger printing from there. Nothing navigates away, so there is no separate
 * window/page to get stuck on — dismissing the system print dialog returns straight
 * to the app (fixes the dead "back" button on phones).
 */
function printViaIframe(html: string): void {
  document.getElementById("__print_iframe__")?.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "__print_iframe__";
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0",
    width: "0", height: "0", border: "0", visibility: "hidden",
  } as CSSStyleDeclaration);
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => iframe.remove(), 500);
  };

  const win = iframe.contentWindow!;
  win.onafterprint = cleanup;

  // Wait for layout/fonts to settle, then print from inside the iframe.
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch (err) {
      console.error("Failed to print:", err);
    }
    // Fallback cleanup in case onafterprint never fires on some WebViews.
    setTimeout(cleanup, 3000);
  }, 350);
}

async function executePrint(
  html: string,
  width = RECEIPT_WINDOW.width,
  height = RECEIPT_WINDOW.height,
  tightWidthMm?: number
): Promise<void> {
  // جسر Electron: يطبع بحجم ورق محسوب من المحتوى (بلا فراغ أبيض). للوصل وكشف الحساب فقط.
  const electronAPI = typeof window !== "undefined" ? (window as any).electronAPI : undefined;
  if (tightWidthMm && electronAPI?.printHTML) {
    try {
      await electronAPI.printHTML(html, tightWidthMm);
      return;
    } catch (err) {
      console.error("electron printHTML failed, falling back to browser print:", err);
    }
  }

  const isElectron = typeof window !== "undefined" && window.navigator.userAgent.toLowerCase().includes("electron");

  if (isElectron) {
    try {
      const response = await fetch("/api/print", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ html: injectPrintScript(html) }),
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

  // On phones a separate print window can't be closed/navigated back from — print
  // inside a hidden iframe in the current page instead.
  if (isMobileWebView()) {
    printViaIframe(html);
    return;
  }

  const win = window.open("", "_blank", `width=${width},height=${height}`);
  if (win) {
    win.document.write(injectPrintScript(html));
    win.document.close();
  }
}

function printScript(): string {
  return `
  <style>
    #print-back-btn {
      position: fixed;
      top: 10px;
      left: 10px;
      z-index: 9999;
      padding: 8px 18px;
      background: #26683a;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-family: Tahoma, Arial, sans-serif;
      cursor: pointer;
      font-weight: bold;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    @media print {
      #print-back-btn { display: none !important; }
    }
  </style>
  <button id="print-back-btn" onclick="try{window.close();}catch(e){history.back();}">
    &#x2190; رجوع
  </button>
  <script>
    window.onload = function() {
      window.focus();
      window.onafterprint = function() {
        try { window.close(); } catch(e) {}
      };
      setTimeout(function() {
        window.print();
        setTimeout(function() {
          try { window.close(); } catch(e) {}
        }, 2000);
      }, 200);
    };
  </script>`;
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
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1mm;
      padding: 0.5mm;
      text-align: center;
    }
    .name {
      font-size: 16pt;
      font-weight: 900;
      color: #000;
      line-height: 1;
      width: 100%;
      max-height: 9.5mm;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      word-break: break-word;
    }
    .price {
      font-size: 21pt;
      font-weight: 900;
      color: #000;
      white-space: nowrap;
      line-height: 1;
    }
  </style>
</head>
<body>
  <div class="name">${productName}</div>
  <div class="price">${formatCurrency(sellingPrice)}</div>
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
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1mm;
      padding: 0.5mm;
      text-align: center;
      page-break-after: always;
    }
    .label-page:last-child { page-break-after: auto; }
    .name {
      font-size: 16pt;
      font-weight: 900;
      color: #000;
      line-height: 1;
      width: 100%;
      max-height: 9.5mm;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      word-break: break-word;
    }
    .price {
      font-size: 21pt;
      font-weight: 900;
      color: #000;
      white-space: nowrap;
      line-height: 1;
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
<body>${pages}</body>
</html>`;

  executePrint(html, LABEL_WINDOW.width, LABEL_WINDOW.height);
}

export function printReceipt(sale: Sale, storeName = STORE_NAME): void {
  const lines = sale.items
    .map(
      (item) =>
        `<tr style="border-bottom:1px solid #ddd;">
          <td style="padding:4px 1px;text-align:right;font-size:12px;font-weight:bold;">${item.productName}</td>
          <td style="padding:4px 1px;text-align:center;font-size:12px;font-weight:bold;">${item.quantity}</td>
          <td style="padding:4px 1px;text-align:left;font-size:10px;font-weight:bold;white-space:nowrap;">${formatCurrency(item.unitPrice)}</td>
          <td style="padding:4px 1px;text-align:left;font-size:10px;font-weight:bold;white-space:nowrap;">${formatCurrency(item.totalPrice)}</td>
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
    /* الصفحة = 72mm (عرض الطباعة الفعلي لورق 80mm). المحتوى يملأها بهوامش متساوية فيظهر موسَّطاً (لا انحياز يميناً). */
    @page { size: 72mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 72mm; margin: 0; }
    /* بلا فراغ يدوي كبير: القص التلقائي للطابعة يتولّى دفع الورق. فراغ سفلي صغير فقط. */
    body { font-family: Tahoma, Arial, sans-serif; font-size: 13px; font-weight: bold; padding: 1mm 3mm 3mm; direction: rtl; color: #000; }
    /* منع انقسام التيكت على صفحتين (المجاميع يجب ألا تنفصل عن الأصناف) */
    table, tr, .totals, .footer, .header, .meta { page-break-inside: avoid; break-inside: avoid; }
    .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 5px; margin-bottom: 5px; }
    .header h2 { margin: 0; font-size: 18px; font-weight: 900; }
    .meta { font-size: 12px; color: #000; margin-bottom: 5px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead tr { background: #f1f8ee; }
    th, td { word-wrap: break-word; overflow-wrap: break-word; }
    th { padding: 4px 2px; font-size: 12px; text-align: right; border-bottom: 2px solid #000; font-weight: 900; }
    .col-name { width: 38%; text-align: right; }
    .col-qty { width: 12%; text-align: center; }
    .col-price { width: 25%; text-align: left; }
    .col-total { width: 25%; text-align: left; }
    .totals { margin-top: 5px; border-top: 2px dashed #000; padding-top: 5px; }
    .totals td { font-size: 13px; padding: 2px 2px; }
    .totals .lbl { text-align: right; font-weight: 900; }
    .totals .val { text-align: left; font-weight: 900; white-space: nowrap; }
    .total-row td { font-size: 17px; font-weight: 900; color: #000; padding-top: 4px; }
    .footer { text-align: center; margin-top: 5px; font-size: 11px; color: #333; border-top: 1px dashed #999; padding-top: 4px; font-weight: bold; }
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
    <colgroup>
      <col class="col-name"/><col class="col-qty"/><col class="col-price"/><col class="col-total"/>
    </colgroup>
    <thead>
      <tr>
        <th style="text-align:right;">المنتج</th><th style="text-align:center;">الكمية</th><th style="text-align:left;">السعر</th><th style="text-align:left;">المجموع</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
  <table class="totals">
    <colgroup><col style="width:60%;"/><col style="width:40%;"/></colgroup>
    <tr><td class="lbl">المجموع الفرعي</td><td class="val">${formatCurrency(sale.subtotal)}</td></tr>
    ${sale.discount > 0 ? `<tr><td class="lbl">الخصم</td><td class="val">-${formatCurrency(sale.discount)}</td></tr>` : ""}
    ${sale.tax > 0 ? `<tr><td class="lbl">الضريبة</td><td class="val">${formatCurrency(sale.tax)}</td></tr>` : ""}
    <tr class="total-row"><td class="lbl">الإجمالي</td><td class="val">${formatCurrency(sale.total)}</td></tr>
  </table>
  <div class="footer">شكراً لزيارتكم! • ${storeName}</div>
</body>
</html>`;

  executePrint(html, RECEIPT_WINDOW.width, RECEIPT_WINDOW.height, 72);
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
        itemsStr = `<div style="font-size:10px;color:#333;margin-top:2px;padding-right:4px;border-right:2px solid #999;font-weight:bold;">
          ${tx.saleItems.map(i => `${i.productName} (${i.quantity} × ${formatCurrency(i.unitPrice)})`).join("<br/>")}
        </div>`;
      }

      return `
        <tr style="border-bottom:1px solid #ccc;">
          <td style="padding:4px;font-size:11px;font-weight:bold;">${formatDateTime(tx.createdAt)}</td>
          <td style="padding:4px;font-size:11px;font-weight:bold;">
            <strong>${typeStr}</strong>
            ${tx.note ? `<br/><small style="color:#444;font-size:10px;">${tx.note}</small>` : ""}
            ${itemsStr}
          </td>
          <td style="padding:4px;font-size:12px;text-align:left;color:${color};font-weight:900;">
            ${sign}${formatCurrency(tx.amount)}
          </td>
          <td style="padding:4px;font-size:12px;text-align:left;font-weight:900;">
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
    /* الصفحة = 72mm (عرض الطباعة الفعلي لورق 80mm). المحتوى يملأها بهوامش متساوية فيظهر موسَّطاً. */
    @page { size: 72mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 72mm; margin: 0; }
    /* بلا فراغ يدوي كبير: القص التلقائي للطابعة يتولّى دفع الورق. فراغ سفلي صغير فقط. */
    body { font-family: Tahoma, Arial, sans-serif; font-size: 12px; font-weight: bold; padding: 1mm 3mm 3mm; direction: rtl; color: #000; }
    /* منع انقسام الكشف على صفحتين */
    table, tr, .footer, .header, .customer-info { page-break-inside: avoid; break-inside: avoid; }
    .header { text-align: center; border-bottom: 2px solid #26683a; padding-bottom: 5px; margin-bottom: 7px; }
    .header h2 { margin: 0; font-size: 17px; font-weight: 900; color: #26683a; }
    .customer-info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 7px; background: #f8fdf5; padding: 5px; border-radius: 4px; border: 1px solid #c5e5b8; font-size: 11px; }
    .customer-info div { line-height: 1.5; }
    .title-tx { font-size: 13px; font-weight: 900; margin-bottom: 5px; color: #26683a; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    thead tr { background: #26683a; color: white; }
    th { padding: 4px 3px; font-size: 11px; text-align: right; font-weight: 900; }
    td { padding: 4px 3px; font-size: 11px; }
    .footer { text-align: center; margin-top: 7px; font-size: 10px; color: #555; border-top: 1px dashed #999; padding-top: 4px; font-weight: bold; }
    @media print {
      body { padding: 0; }
      .customer-info { background: none; border: 1px solid #ccc; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>${storeName}</h2>
    <div style="font-size: 13px; margin-top: 2px; font-weight: 900;">كشف حساب عميل (كريدي)</div>
    <div style="font-size: 11px; color: #333; margin-top: 1px; font-weight: bold;">تاريخ الاستخراج: ${formatDateTime(new Date())}</div>
  </div>

  <div class="customer-info">
    <div>
      <strong>العميل:</strong> ${customer.name}<br/>
      <strong>الهاتف:</strong> ${customer.phone || "—"}<br/>
      <strong>العنوان:</strong> ${customer.address || "—"}
    </div>
    <div style="text-align: left;">
      <span style="font-size: 13px;"><strong>الدين الحالي:</strong> <span style="color:#dc2626;font-weight:900;">${formatCurrency(customer.totalDebt)}</span></span><br/>
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
</body>
</html>`;

  executePrint(html, RECEIPT_WINDOW.width, RECEIPT_WINDOW.height, 72);
}
