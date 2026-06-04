export type ProductUnit = "kg" | "g" | "pcs" | "l" | "ml" | "box";

export interface Product {
  id: string;
  name: string;
  nameAr: string;
  barcode: string;
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  stock: number;
  minStock: number;
  unit: ProductUnit;
  imageUrl?: string;
  isActive: boolean;
  storeId: string;
  expiryDate?: string; // Format: YYYY-MM-DD
  updatedAt: Date;
  createdAt: Date;
}

export interface ProductFormData {
  name: string;
  nameAr: string;
  barcode: string;
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  stock: number;
  minStock: number;
  unit: ProductUnit;
  imageUrl?: string;
  isActive: boolean;
  expiryDate?: string; // Format: YYYY-MM-DD
}

export const PRODUCT_CATEGORIES = [
  "مواد غذائية",
  "مشروبات",
  "منظفات",
  "مواد تجميل",
  "مجمدات",
  "ألبان وأجبان",
  "خبز ومعجنات",
  "لحوم ودواجن",
  "خضروات وفواكه",
  "حلويات وسناكس",
  "أدوات منزلية",
  "أخرى",
] as const;
