export type PurchasePaymentMethod = "cash" | "credit" | "check";

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface Purchase {
  id: string;
  supplierId?: string;
  supplierName: string;
  items: PurchaseItem[];
  totalCost: number;
  paymentMethod: PurchasePaymentMethod;
  invoiceNumber?: string;
  receivedBy: string;
  note?: string;
  storeId: string;
  createdAt: Date;
}
