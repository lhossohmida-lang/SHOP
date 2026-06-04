export type CreditTransactionType = "purchase" | "payment" | "adjustment";

export interface CreditCustomer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  totalDebt: number;
  creditLimit: number;
  isActive: boolean;
  storeId: string;
  lastTransactionAt: Date;
  createdAt: Date;
}

export interface CreditTransaction {
  id: string;
  customerId: string;
  customerName: string;
  type: CreditTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  saleId?: string;
  note?: string;
  createdBy: string;
  storeId: string;
  createdAt: Date;
}
