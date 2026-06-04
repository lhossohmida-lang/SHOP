export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ar-DZ", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount) + " د.ج";
}

export function formatCurrencyCompact(amount: number): string {
  if (amount >= 1_000_000) {
    return (amount / 1_000_000).toFixed(1) + "م د.ج";
  }
  if (amount >= 1_000) {
    return (amount / 1_000).toFixed(1) + "ك د.ج";
  }
  return formatCurrency(amount);
}

export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/[^\d.]/g, "")) || 0;
}
