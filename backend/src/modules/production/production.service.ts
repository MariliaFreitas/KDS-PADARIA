import type { OrderItem, OrderItemAdditional, OrderItemStatus, Prisma, Station } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";

const QUEUE_STATUSES: OrderItemStatus[] = ["PENDENTE", "EM_PREPARO"];

/** Próximo status a partir do atual; ausente = terminal, não avança mais. */
const NEXT_STATUS: Partial<Record<OrderItemStatus, OrderItemStatus>> = {
  PENDENTE: "EM_PREPARO",
  EM_PREPARO: "PRONTO",
};

/**
 * BALCAO+LOCAL, BALCAO+VIAGEM e WHATSAPP+LOCAL sempre preparam antes de
 * pagar — só WHATSAPP+VIAGEM é diferente (Etapa 14): enquanto o pedido
 * estiver com paymentStatus=PENDENTE, um item que exige produção nem
 * aparece como trabalho pendente para a estação. Não é uma trava geral de
 * VIAGEM: BALCAO+VIAGEM continua preparando normalmente antes do
 * pagamento.
 */
const BLOCKED_BY_UNPAID_WHATSAPP_TRAVEL: Prisma.OrderItemWhereInput = {
  NOT: {
    order: {
      channel: "WHATSAPP",
      consumptionType: "VIAGEM",
      paymentStatus: "PENDENTE",
    },
  },
};

export interface ProductionStation {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Estações oferecidas na tela de seleção do preparo. Uma estação ativa
 * sempre aparece. Uma inativa só aparece enquanto ainda tiver item
 * PENDENTE ou EM_PREPARO nela — depois que o trabalho acaba, ela some da
 * lista sem precisar de nenhuma coluna nova, só olhando os próprios itens.
 */
export async function listProductionStations(): Promise<ProductionStation[]> {
  const [stations, pendingItems] = await Promise.all([
    prisma.station.findMany({ orderBy: { name: "asc" } }),
    prisma.orderItem.findMany({
      where: {
        requiresProductionSnapshot: true,
        status: { in: QUEUE_STATUSES },
        ...BLOCKED_BY_UNPAID_WHATSAPP_TRAVEL,
      },
    }),
  ]);

  const stationsWithPendingWork = new Set(
    pendingItems
      .map((item: OrderItem) => item.stationIdSnapshot)
      .filter((stationId: string | null): stationId is string => stationId !== null),
  );

  return stations
    .filter((station: Station) => station.active || stationsWithPendingWork.has(station.id))
    .map((station: Station) => ({ id: station.id, name: station.name, active: station.active }));
}

export interface ProductionQueueItem {
  id: string;
  productNameSnapshot: string;
  saleType: OrderItem["saleType"];
  quantity: number | null;
  weightGrams: number | null;
  variationNameSnapshot: string | null;
  status: OrderItemStatus;
  observation: string | null;
  includedAt: Date;
  additionals: Pick<OrderItemAdditional, "id" | "nameSnapshot" | "quantity">[];
  order: { serviceNumber: number; customerName: string };
}

/**
 * Fila de uma estação: só itens que exigem preparo, roteados para ESTA
 * estação via stationIdSnapshot (nunca via Product.stationId atual) e
 * ainda não chegaram a um status final. Ordem fixa por includedAt — o
 * horário de retirada do pedido não entra na priorização. A resposta só
 * carrega o que a tela operacional precisa, sem preço nem dado de
 * pagamento.
 */
export async function getStationQueue(stationId: string): Promise<ProductionQueueItem[]> {
  const station = await prisma.station.findUnique({ where: { id: stationId } });
  if (!station) {
    throw new AppError("Estação não encontrada.", 404, ErrorCode.STATION_NOT_FOUND);
  }

  type QueueItemRow = OrderItem & {
    additionals: OrderItemAdditional[];
    order: { serviceNumber: number; customerName: string };
  };

  const items: QueueItemRow[] = await prisma.orderItem.findMany({
    where: {
      stationIdSnapshot: stationId,
      requiresProductionSnapshot: true,
      status: { in: QUEUE_STATUSES },
      ...BLOCKED_BY_UNPAID_WHATSAPP_TRAVEL,
    },
    orderBy: { includedAt: "asc" },
    include: {
      additionals: true,
      order: { select: { serviceNumber: true, customerName: true } },
    },
  });

  return items.map((item: QueueItemRow) => ({
    id: item.id,
    productNameSnapshot: item.productNameSnapshot,
    saleType: item.saleType,
    quantity: item.quantity,
    weightGrams: item.weightGrams,
    variationNameSnapshot: item.variationNameSnapshot,
    status: item.status,
    observation: item.observation,
    includedAt: item.includedAt,
    additionals: item.additionals.map((additional: OrderItemAdditional) => ({
      id: additional.id,
      nameSnapshot: additional.nameSnapshot,
      quantity: additional.quantity,
    })),
    order: item.order,
  }));
}

/**
 * Avança um item para o próximo status do preparo. O backend decide o
 * próximo estado — o frontend nunca envia um status.
 *
 * "Item inexistente", "item de outra estação" e "item sem preparo"
 * recebem a mesma resposta de propósito: do ponto de vista desta estação,
 * nenhum desses itens faz parte da sua fila.
 *
 * Não basta esconder um item WHATSAPP+VIAGEM+PENDENTE da fila (Etapa 14):
 * uma chamada direta a este endpoint também precisa ser barrada tentando
 * transformá-lo de PENDENTE para EM_PREPARO enquanto o pedido não for
 * pago. Depois de paymentStatus=PAGO, o fluxo normal volta a valer sem
 * nenhuma trava — e nenhuma outra combinação de canal/consumo é afetada.
 */
export async function advanceItem(
  stationId: string,
  itemId: string,
): Promise<OrderItem & { additionals: OrderItemAdditional[] }> {
  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: {
      additionals: true,
      order: { select: { channel: true, consumptionType: true, paymentStatus: true } },
    },
  });

  if (!item || !item.requiresProductionSnapshot || item.stationIdSnapshot !== stationId) {
    throw new AppError("Item não encontrado nesta estação.", 404, ErrorCode.ORDER_ITEM_NOT_FOUND);
  }

  if (
    item.status === "PENDENTE" &&
    item.order.channel === "WHATSAPP" &&
    item.order.consumptionType === "VIAGEM" &&
    item.order.paymentStatus === "PENDENTE"
  ) {
    throw new AppError(
      "Pedido feito por WhatsApp para viagem só entra em preparo depois de pago.",
      409,
      ErrorCode.PRODUCTION_BLOCKED_UNTIL_PAID,
    );
  }

  const nextStatus = NEXT_STATUS[item.status];
  if (!nextStatus) {
    throw new AppError(
      "Não é possível avançar este item a partir do status atual.",
      409,
      ErrorCode.ORDER_ITEM_ADVANCE_NOT_ALLOWED,
    );
  }

  return prisma.orderItem.update({
    where: { id: itemId },
    data: { status: nextStatus },
    include: { additionals: true },
  });
}
