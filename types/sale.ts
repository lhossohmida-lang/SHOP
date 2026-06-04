export type PaymentMethod = "cash" | "card" | "credit";
export type SaleType = "sale" | "refund";

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Sale {
  id: string;
  type: SaleType;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  customerId?: string;
  customerName?: string;
  cashierId: string;
  cashierName: string;
  note?: string;
  receiptNumber: string;
  storeId: string;
  createdAt: Date;
}
