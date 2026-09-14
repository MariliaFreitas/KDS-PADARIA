export type SaleType = "UNIT" | "VARIATION" | "WEIGHT";
export type ProductionItemStatus = "PENDENTE" | "EM_PREPARO" | "PRONTO" | "CANCELADO";

export interface ProductionStation {
  id: string;
  name: string;
  active: boolean;
}

export interface ProductionItemAdditional {
  id: string;
  nameSnapshot: string;
  quantity: number;
}

export interface ProductionItem {
  id: string;
  productNameSnapshot: string;
  saleType: SaleType;
  quantity: number | null;
  weightGrams: number | null;
  variationNameSnapshot: string | null;
  status: ProductionItemStatus;
  observation: string | null;
  includedAt: string;
  additionals: ProductionItemAdditional[];
  order: {
    serviceNumber: number;
    customerName: string;
  };
}
