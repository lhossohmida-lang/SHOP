export type UserRole = "admin" | "employee" | "accountant";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  storeId: string;
  isActive: boolean;
  createdAt: Date;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  phone: string;
  currency: string;
  taxRate: number;
  createdAt: Date;
}
