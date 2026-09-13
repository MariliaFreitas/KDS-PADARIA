export type OrderChannel = "BALCAO" | "WHATSAPP";
export type ConsumptionType = "LOCAL" | "VIAGEM";
export type PaymentStatus = "PENDENTE" | "PAGO";

export interface Order {
  id: string;
  orderNumber: number;
  customerName: string;
  channel: OrderChannel;
  consumptionType: ConsumptionType;
  pickupTime: string | null;
  paymentStatus: PaymentStatus;
  createdByUserId: string;
  createdAt: string;
}

export interface OrderWithItems extends Order {
  // Vazio nesta etapa — a Etapa 9 passa a preencher os itens do pedido.
  items: unknown[];
}

export interface CreateOrderInput {
  customerName: string;
  channel: OrderChannel;
  consumptionType: ConsumptionType;
  pickupTime?: string | null;
}
