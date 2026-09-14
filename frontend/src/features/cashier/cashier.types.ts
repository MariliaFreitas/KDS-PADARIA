export type OrderChannel = "BALCAO" | "WHATSAPP";
export type ConsumptionType = "LOCAL" | "VIAGEM";

export interface CashierOrderItemAdditional {
  nameSnapshot: string;
  quantity: number;
}

export interface CashierOrderItem {
  id: string;
  productNameSnapshot: string;
  quantity: number | null;
  weightGrams: number | null;
  variationNameSnapshot: string | null;
  additionals: CashierOrderItemAdditional[];
}

export interface CashierOrder {
  id: string;
  serviceNumber: number;
  customerName: string;
  channel: OrderChannel;
  consumptionType: ConsumptionType;
  createdAt: string;
  items: CashierOrderItem[];
  totalCents: number;
}
