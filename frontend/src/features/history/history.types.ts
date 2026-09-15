export type OrderChannel = "BALCAO" | "WHATSAPP";
export type ConsumptionType = "LOCAL" | "VIAGEM";
export type PaymentStatus = "PENDENTE" | "PAGO";
export type HistoryItemStatus = "PENDENTE" | "EM_PREPARO" | "PRONTO" | "CANCELADO";
export type SaleType = "UNIT" | "VARIATION" | "WEIGHT";
export type UserRole = "ATENDENTE" | "PRODUCAO" | "CAIXA" | "ADMIN";
export type HistoryStatusFilter = "ENTREGUE" | "CANCELADO";

export interface HistoryOrderSummary {
  id: string;
  serviceNumber: number;
  customerName: string;
  channel: OrderChannel;
  consumptionType: ConsumptionType;
  createdAt: string;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  totalCents: number;
}

export interface ListHistoryOrdersResult {
  orders: HistoryOrderSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface HistoryOrderItemAdditional {
  nameSnapshot: string;
  priceCentsSnapshot: number;
  quantity: number;
}

export interface HistoryOrderItem {
  id: string;
  productNameSnapshot: string;
  saleType: SaleType;
  basePriceCentsSnapshot: number;
  quantity: number | null;
  weightGrams: number | null;
  variationNameSnapshot: string | null;
  status: HistoryItemStatus;
  totalCents: number;
  observation: string | null;
  includedAt: string;
  deliveredAt: string | null;
  additionals: HistoryOrderItemAdditional[];
}

export interface HistoryEventUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface HistoryEventItemRef {
  id: string;
  productNameSnapshot: string;
}

export interface HistoryEvent {
  id: string;
  action: string;
  previousState: string | null;
  newState: string | null;
  reason: string | null;
  createdAt: string;
  user: HistoryEventUser;
  item: HistoryEventItemRef | null;
}

export interface HistoryOrderDetail {
  id: string;
  serviceNumber: number;
  customerName: string;
  channel: OrderChannel;
  consumptionType: ConsumptionType;
  pickupTime: string | null;
  createdAt: string;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  totalCents: number;
  items: HistoryOrderItem[];
  history: HistoryEvent[];
}
