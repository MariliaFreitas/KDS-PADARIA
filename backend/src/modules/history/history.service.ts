import type {
  Order,
  OrderChannel,
  OrderItem,
  OrderItemAdditional,
  OrderItemStatus,
  OrderHistory,
  PaymentStatus,
  Prisma,
  SaleType,
  User,
  UserRole,
  ConsumptionType,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";

// ---------------------------------------------------------------------------
// Formatos de resposta
// ---------------------------------------------------------------------------

export interface HistoryOrderSummary {
  id: string;
  serviceNumber: number;
  customerName: string;
  channel: OrderChannel;
  consumptionType: ConsumptionType;
  createdAt: Date;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  totalCents: number;
}

export interface ListHistoryOrdersParams {
  search?: string;
  status?: "ENTREGUE" | "CANCELADO";
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
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
  status: OrderItemStatus;
  totalCents: number;
  observation: string | null;
  includedAt: Date;
  deliveredAt: Date | null;
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
  createdAt: Date;
  user: HistoryEventUser;
  item: HistoryEventItemRef | null;
}

export interface HistoryOrderDetail {
  id: string;
  serviceNumber: number;
  customerName: string;
  channel: OrderChannel;
  consumptionType: ConsumptionType;
  pickupTime: Date | null;
  createdAt: Date;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  totalCents: number;
  items: HistoryOrderItem[];
  history: HistoryEvent[];
}

// ---------------------------------------------------------------------------
// Total — sempre recalculado no backend, nunca confiado do frontend
// ---------------------------------------------------------------------------

/** Soma só os itens não cancelados — item CANCELADO nunca conta no total, mesmo no histórico. */
function billableTotalCents(items: Pick<OrderItem, "status" | "totalCents">[]): number {
  return items
    .filter((item) => item.status !== "CANCELADO")
    .reduce((sum, item) => sum + item.totalCents, 0);
}

// ---------------------------------------------------------------------------
// Listagem
// ---------------------------------------------------------------------------

type OrderWithItemsOnly = Order & { items: Pick<OrderItem, "status" | "totalCents">[] };

function toHistorySummary(order: OrderWithItemsOnly): HistoryOrderSummary {
  return {
    id: order.id,
    serviceNumber: order.serviceNumber,
    customerName: order.customerName,
    channel: order.channel,
    consumptionType: order.consumptionType,
    createdAt: order.createdAt,
    paymentStatus: order.paymentStatus,
    paidAt: order.paidAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    totalCents: billableTotalCents(order.items),
  };
}

/**
 * Lista pedidos já fechados operacionalmente — entregues (deliveredAt !=
 * null) ou cancelados (cancelledAt != null). Pagamento PAGO sozinho NUNCA
 * define histórico: um pedido pago mas ainda em aberto (nem entregue nem
 * cancelado) continua fora daqui, porque ainda pode mudar (novo item,
 * entrega pendente) — ver Caixa/Retirada para esse estado.
 *
 * Busca opcional por nome (substring, sem diferenciar maiúsculas/
 * minúsculas) ou número operacional exato (aceita "27"/"#27") — como o
 * número é reutilizável, esse match pode legitimamente casar com vários
 * pedidos históricos diferentes; a consulta abaixo já devolve todos eles
 * naturalmente, sem nenhuma lógica de "achar o primeiro".
 *
 * Ordenação por createdAt desc (mais recente primeiro), com id desc como
 * desempate determinístico — createdAt é sempre preenchido e nunca muda
 * depois de criado o pedido, ao contrário de deliveredAt/cancelledAt (que
 * têm semânticas diferentes entre si e tornariam a ordenação ambígua entre
 * ENTREGUE e CANCELADO).
 */
export async function listHistoryOrders(
  params: ListHistoryOrdersParams,
): Promise<ListHistoryOrdersResult> {
  const where: Prisma.OrderWhereInput = {
    OR: [{ deliveredAt: { not: null } }, { cancelledAt: { not: null } }],
  };

  if (params.status === "ENTREGUE") {
    where.deliveredAt = { not: null };
  } else if (params.status === "CANCELADO") {
    where.cancelledAt = { not: null };
  }

  if (params.from || params.to) {
    where.createdAt = {
      ...(params.from ? { gte: params.from } : {}),
      ...(params.to ? { lte: params.to } : {}),
    };
  }

  const trimmedSearch = params.search?.trim();
  if (trimmedSearch) {
    const withoutLeadingHash = trimmedSearch.startsWith("#")
      ? trimmedSearch.slice(1)
      : trimmedSearch;
    const asServiceNumber = Number(withoutLeadingHash);
    const matchesServiceNumber =
      withoutLeadingHash !== "" && Number.isInteger(asServiceNumber) && asServiceNumber > 0;

    where.AND = [
      {
        OR: [
          { customerName: { contains: trimmedSearch, mode: "insensitive" } },
          ...(matchesServiceNumber ? [{ serviceNumber: asServiceNumber }] : []),
        ],
      },
    ];
  }

  const skip = (params.page - 1) * params.pageSize;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: params.pageSize,
      include: { items: { select: { status: true, totalCents: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map(toHistorySummary),
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / params.pageSize),
  };
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

type ItemWithAdditionals = OrderItem & { additionals: OrderItemAdditional[] };

type HistoryEntryWithRelations = OrderHistory & {
  user: Pick<User, "id" | "name" | "role">;
  orderItem: Pick<OrderItem, "id" | "productNameSnapshot"> | null;
};

type OrderWithFullDetail = Order & {
  items: ItemWithAdditionals[];
  history: HistoryEntryWithRelations[];
};

function toHistoryOrderItem(item: ItemWithAdditionals): HistoryOrderItem {
  return {
    id: item.id,
    productNameSnapshot: item.productNameSnapshot,
    saleType: item.saleType,
    basePriceCentsSnapshot: item.basePriceCentsSnapshot,
    quantity: item.quantity,
    weightGrams: item.weightGrams,
    variationNameSnapshot: item.variationNameSnapshot,
    status: item.status,
    totalCents: item.totalCents,
    observation: item.observation,
    includedAt: item.includedAt,
    deliveredAt: item.deliveredAt,
    additionals: item.additionals.map((additional: OrderItemAdditional) => ({
      nameSnapshot: additional.nameSnapshot,
      priceCentsSnapshot: additional.priceCentsSnapshot,
      quantity: additional.quantity,
    })),
  };
}

function toHistoryEvent(entry: HistoryEntryWithRelations): HistoryEvent {
  return {
    id: entry.id,
    action: entry.action,
    previousState: entry.previousState,
    newState: entry.newState,
    reason: entry.reason,
    createdAt: entry.createdAt,
    user: {
      id: entry.user.id,
      name: entry.user.name,
      role: entry.user.role,
    },
    item: entry.orderItem
      ? { id: entry.orderItem.id, productNameSnapshot: entry.orderItem.productNameSnapshot }
      : null,
  };
}

function toHistoryOrderDetail(order: OrderWithFullDetail): HistoryOrderDetail {
  return {
    id: order.id,
    serviceNumber: order.serviceNumber,
    customerName: order.customerName,
    channel: order.channel,
    consumptionType: order.consumptionType,
    pickupTime: order.pickupTime,
    createdAt: order.createdAt,
    paymentStatus: order.paymentStatus,
    paidAt: order.paidAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
    totalCents: billableTotalCents(order.items),
    items: order.items.map(toHistoryOrderItem),
    history: order.history.map(toHistoryEvent),
  };
}

/**
 * Detalhe de um pedido já fechado operacionalmente. "Pedido inexistente" e
 * "pedido existe mas ainda não fechou operacionalmente" recebem a mesma
 * resposta de propósito (404 ORDER_NOT_FOUND) — mesmo padrão de segurança
 * já usado em outros módulos (ex: produção) para não vazar em qual estado
 * exato um pedido fora de escopo está.
 *
 * Itens CANCELADO aparecem normalmente na lista de itens (não somem) — só
 * não entram no total recalculado. O histórico vem ordenado por createdAt
 * ASC (ordem cronológica real dos eventos), cada entrada com o responsável
 * (nome + perfil) e, quando orderItemId não é nulo, o item relacionado.
 * Pedidos antigos, de antes da Etapa 15, podem legitimamente ter uma
 * timeline vazia ou parcial — nada aqui inventa eventos que não foram
 * persistidos de verdade.
 */
export async function getHistoryOrderDetail(orderId: string): Promise<HistoryOrderDetail> {
  const order: OrderWithFullDetail | null = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        orderBy: { includedAt: "asc" },
        include: { additionals: true },
      },
      history: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, role: true } },
          orderItem: { select: { id: true, productNameSnapshot: true } },
        },
      },
    },
  });

  if (!order || (order.deliveredAt === null && order.cancelledAt === null)) {
    throw new AppError("Pedido não encontrado.", 404, ErrorCode.ORDER_NOT_FOUND);
  }

  return toHistoryOrderDetail(order);
}
