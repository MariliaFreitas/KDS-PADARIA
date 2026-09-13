export interface Additional {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
}

export interface CreateAdditionalInput {
  name: string;
  priceCents: number;
}

export interface UpdateAdditionalInput {
  name?: string;
  priceCents?: number;
  active?: boolean;
}
