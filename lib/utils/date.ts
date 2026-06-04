export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("ar-DZ", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function getStartOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEndOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getStartOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getStartOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function generateReceiptNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timeStr = now.getTime().toString().slice(-4);
  return `${dateStr}-${timeStr}`;
}

export function toFirestoreDate(date: Date): Date {
  return date;
}
