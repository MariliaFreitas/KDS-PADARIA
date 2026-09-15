export type OrderChannel = "BALCAO" | "WHATSAPP";
export type ConsumptionType = "LOCAL" | "VIAGEM";
export type PaymentStatus = "PENDENTE" | "PAGO";
export type DeliveryItemStatus = "PENDENTE" | "EM_PREPARO" | "PRONTO" | "CANCELADO";

export interface DeliveryOrderItemAdditional {
  nameSnapshot: string;
  quantity: number;
}

export interface DeliveryOrderItem {
  id: string;
  productNameSnapshot: string;
  quantity: number | null;
  weightGrams: number | null;
  variationNameSnapshot: string | null;
  additionals: DeliveryOrderItemAdditional[];
  requiresProductionSnapshot: boolean;
  status: DeliveryItemStatus;
  deliveredAt: string | null;
}

export interface DeliveryOrder {
  id: string;
  serviceNumber: number;
  customerName: string;
  channel: OrderChannel;
  consumptionType: ConsumptionType;
  paymentStatus: PaymentStatus;
  createdAt: string;
  items: DeliveryOrderItem[];
}
