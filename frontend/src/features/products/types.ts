export type SaleType = "UNIT" | "VARIATION" | "WEIGHT";

export interface ProductStation {
  id: string;
  name: string;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  active: boolean;
  available: boolean;
  saleType: SaleType;
  unitPriceCents: number | null;
  pricePerKgCents: number | null;
  requiresProduction: boolean;
  stationId: string | null;
  station: ProductStation | null;
}

export interface ProductInput {
  name: string;
  saleType: SaleType;
  unitPriceCents?: number | null;
  pricePerKgCents?: number | null;
  requiresProduction?: boolean;
  stationId?: string | null;
}

export interface UpdateProductInput extends Partial<ProductInput> {
  active?: boolean;
  available?: boolean;
}
