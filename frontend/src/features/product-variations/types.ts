export interface ProductVariation {
  id: string;
  productId: string;
  name: string;
  priceCents: number;
}

export interface CreateVariationInput {
  name: string;
  priceCents: number;
}

export interface UpdateVariationInput {
  name?: string;
  priceCents?: number;
}
