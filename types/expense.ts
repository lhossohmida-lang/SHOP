export interface Expense {
  id: string;
  title: string;
  amount: number;
  note?: string;
  storeId: string;
  createdBy: string;
  createdByName?: string;
  createdAt: Date;
}

export interface ExpenseFormData {
  title: string;
  amount: number;
  note?: string;
  createdAt?: Date;
}
