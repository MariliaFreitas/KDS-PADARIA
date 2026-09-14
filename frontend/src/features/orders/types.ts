export type OrderChannel = "BALCAO" | "WHATSAPP";
export type ConsumptionType = "LOCAL" | "VIAGEM";
export type PaymentStatus = "PENDENTE" | "PAGO";
export type SaleType = "UNIT" | "VARIATION" | "WEIGHT";
export type OrderItemStatus = "PENDENTE" | "EM_PREPARO" | "PRONTO" | "CANCELADO";

export interface Order {
  id: string;
  orderNumber: number;
  serviceNumber: number;
  customerName: string;
  channel: OrderChannel;
  consumptionType: ConsumptionType;
  pickupTime: string | null;
  paymentStatus: PaymentStatus;
  createdByUserId: string;
  createdAt: string;
}

export interface OrderItemAdditional {
  id: string;
  additionalId: string;
  nameSnapshot: string;
  priceCentsSnapshot: number;
  quantity: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productNameSnapshot: string;
  saleType: SaleType;
  basePriceCentsSnapshot: number;
  requiresProductionSnapshot: boolean;
  quantity: number | null;
  weightGrams: number | null;
  variationId: string | null;
  variationNameSnapshot: string | null;
  stationIdSnapshot: string | null;
  stationNameSnapshot: string | null;
  status: OrderItemStatus;
  totalCents: number;
  observation: string | null;
  includedAt: string;
  additionals: OrderItemAdditional[];
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface CreateOrderInput {
  customerName: string;
  channel: OrderChannel;
  consumptionType: ConsumptionType;
  pickupTime?: string | null;
}

// Catálogo operacional (Etapa 9) — só o necessário para montar um item.

export interface CatalogVariation {
  id: string;
  name: string;
  priceCents: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  active: boolean;
  available: boolean;
  saleType: SaleType;
  unitPriceCents: number | null;
  pricePerKgCents: number | null;
  requiresProduction: boolean;
  stationId: string | null;
  createdAt: string;
  variations: CatalogVariation[];
}

export interface CatalogAdditional {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
}

export interface Catalog {
  products: CatalogProduct[];
  additionals: CatalogAdditional[];
}

export interface AddOrderItemAdditionalInput {
  additionalId: string;
  quantity: number;
}

export interface AddOrderItemInput {
  productId: string;
  quantity?: number;
  weightGrams?: number;
  variationId?: string;
  additionals?: AddOrderItemAdditionalInput[];
  observation?: string | null;
}
