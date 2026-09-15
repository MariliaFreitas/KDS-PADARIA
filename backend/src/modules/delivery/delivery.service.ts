import type { Order, OrderItem, OrderItemAdditional, OrderItemStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";

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
  status: OrderItemStatus;
  deliveredAt: Date | null;
}

export interface DeliveryOrder {
  id: string;
  serviceNumber: number;
  customerName: string;
  channel: Order["channel"];
  consumptionType: Order["consumptionType"];
  paymentStatus: Order["paymentStatus"];
  createdAt: Date;
  items: DeliveryOrderItem[];
}

type ItemWithAdditionals = OrderItem & { additionals: OrderItemAdditional[] };

// Específico da listagem: a query de listPendingDeliveryOrders inclui
// items -> additionals, então os itens aqui têm additionals de verdade.
// Não é o mesmo formato retornado pela query de deliverItem abaixo — por
// isso os dois têm tipos próprios, em vez de um único tipo "genérico"
// reutilizado com include incompatível entre as duas funções.
type OrderWithItemsAndAdditionals = Order & { items: ItemWithAdditionals[] };

/**
 * Ao contrário do resumo do Caixa, aqui TODO item aparece — inclusive
 * CANCELADO — porque a tela de Retirada/Entrega precisa mostrá-lo riscado
 * e desabilitado, não escondê-lo (Etapa 14).
 */
function toDeliveryOrder(order: OrderWithItemsAndAdditionals): DeliveryOrder {
  return {
    id: order.id,
    serviceNumber: order.serviceNumber,
    customerName: order.customerName,
    channel: order.channel,
    consumptionType: order.consumptionType,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    items: order.items.map((item: ItemWithAdditionals) => ({
      id: item.id,
      productNameSnapshot: item.productNameSnapshot,
      quantity: item.quantity,
      weightGrams: item.weightGrams,
      variationNameSnapshot: item.variationNameSnapshot,
      additionals: item.additionals.map((additional: OrderItemAdditional) => ({
        nameSnapshot: additional.nameSnapshot,
        quantity: additional.quantity,
      })),
      requiresProductionSnapshot: item.requiresProductionSnapshot,
      status: item.status,
      deliveredAt: item.deliveredAt,
    })),
  };
}

/**
 * Lista os pedidos ainda com trabalho de retirada/entrega pendente:
 * pedido não cancelado, ainda não concluído operacionalmente
 * (Order.deliveredAt=null — preenchido automaticamente em deliverItem, não
 * por um endpoint separado), e com pelo menos um item válido (não
 * CANCELADO) ainda sem deliveredAt. Busca opcional por número operacional
 * (aceita "27"/"#27") ou nome do cliente — mesmo formato do Caixa, mas
 * reimplementado aqui de propósito: os dois módulos são independentes
 * (ver nota no topo do arquivo de rotas).
 */
export async function listPendingDeliveryOrders(search?: string): Promise<DeliveryOrder[]> {
  const where: Prisma.OrderWhereInput = {
    cancelledAt: null,
    deliveredAt: null,
    items: {
      some: {
        status: { not: "CANCELADO" },
        deliveredAt: null,
      },
    },
  };

  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    // Aceita "27" e "#27" como o mesmo número operacional — só o # inicial
    // é removido, então "#" sozinho ou "2#7" seguem como busca por nome.
    const withoutLeadingHash = trimmedSearch.startsWith("#")
      ? trimmedSearch.slice(1)
      : trimmedSearch;
    const asServiceNumber = Number(withoutLeadingHash);
    const matchesServiceNumber =
      withoutLeadingHash !== "" && Number.isInteger(asServiceNumber) && asServiceNumber > 0;

    where.OR = [
      { customerName: { contains: trimmedSearch, mode: "insensitive" } },
      ...(matchesServiceNumber ? [{ serviceNumber: asServiceNumber }] : []),
    ];
  }

  const orders: OrderWithItemsAndAdditionals[] = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      items: { orderBy: { includedAt: "asc" }, include: { additionals: true } },
    },
  });

  return orders.map(toDeliveryOrder);
}

/**
 * Trava a linha do pedido pelo resto da transação atual — mesmo mecanismo
 * usado por addOrderItem/confirmPayment (Etapa 13): serializa qualquer
 * outra operação que também trave a mesma linha (incluindo outra chamada
 * concorrente de deliverItem no mesmo pedido), então a checagem de
 * "item já entregue" abaixo é sempre sobre o estado real e mais recente,
 * nunca uma leitura que uma corrida já tornou obsoleta.
 */
async function lockOrderForUpdate(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "orders" WHERE id = ${orderId} FOR UPDATE`;
}

/**
 * Marca um item como entregue e, se esse era o último item válido (não
 * cancelado) ainda pendente do pedido, fecha o pedido operacionalmente
 * (Order.deliveredAt) na mesma transação — nunca por um endpoint separado
 * que o frontend chama para declarar o pedido inteiro entregue.
 *
 * Nenhuma das regras abaixo é decidida pelo frontend: tudo é reconferido
 * aqui, depois de travar a linha do pedido.
 *
 *   - pedido inexistente -> 404 ORDER_NOT_FOUND
 *   - pedido cancelado -> 409 ORDER_CANCELLED
 *   - item inexistente neste pedido -> 404 ORDER_ITEM_NOT_FOUND
 *   - item CANCELADO -> 409 ORDER_ITEM_CANCELLED
 *   - item já entregue -> 409 ORDER_ITEM_ALREADY_DELIVERED (sempre rejeitado
 *     de forma determinística, nunca tratado como sucesso silencioso)
 *   - item exige produção mas status != PRONTO -> 409 ORDER_ITEM_NOT_READY_FOR_DELIVERY
 *   - pedido VIAGEM ainda não pago -> 409 PAYMENT_REQUIRED_FOR_DELIVERY
 *     (pedido LOCAL pode entregar mesmo com paymentStatus=PENDENTE)
 */
export async function deliverItem(
  orderId: string,
  itemId: string,
  userId: string,
): Promise<OrderItem> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await lockOrderForUpdate(tx, orderId);

    // Aqui a query só inclui items (sem additionals) — deliverItem nunca
    // usa adicionais, então o tipo reflete exatamente esse include, em vez
    // de reaproveitar o tipo da listagem (que inclui additionals e não
    // corresponderia ao formato real retornado aqui).
    const order: (Order & { items: OrderItem[] }) | null = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new AppError("Pedido não encontrado.", 404, ErrorCode.ORDER_NOT_FOUND);
    }

    if (order.cancelledAt !== null) {
      throw new AppError(
        "Pedido cancelado não pode ter item entregue.",
        409,
        ErrorCode.ORDER_CANCELLED,
      );
    }

    const item = order.items.find((candidate: OrderItem) => candidate.id === itemId);
    if (!item) {
      throw new AppError("Item não encontrado neste pedido.", 404, ErrorCode.ORDER_ITEM_NOT_FOUND);
    }

    if (item.status === "CANCELADO") {
      throw new AppError(
        "Item cancelado não pode ser entregue.",
        409,
        ErrorCode.ORDER_ITEM_CANCELLED,
      );
    }

    if (item.deliveredAt !== null) {
      throw new AppError("Este item já foi entregue.", 409, ErrorCode.ORDER_ITEM_ALREADY_DELIVERED);
    }

    if (item.requiresProductionSnapshot && item.status !== "PRONTO") {
      throw new AppError(
        "Item ainda não está pronto — aguarde o preparo terminar antes de entregar.",
        409,
        ErrorCode.ORDER_ITEM_NOT_READY_FOR_DELIVERY,
      );
    }

    if (order.consumptionType === "VIAGEM" && order.paymentStatus !== "PAGO") {
      throw new AppError(
        "Pedido para viagem só pode ser entregue depois do pagamento confirmado.",
        409,
        ErrorCode.PAYMENT_REQUIRED_FOR_DELIVERY,
      );
    }

    const deliveredAt = new Date();

    // updateMany condicional como segunda camada de defesa (mesmo padrão
    // de confirmPayment): sob a trava de linha acima não deveria haver
    // corrida real chegando aqui, mas garante a mesma resposta
    // determinística em vez de sobrescrever silenciosamente.
    const claim = await tx.orderItem.updateMany({
      where: { id: itemId, deliveredAt: null },
      data: { deliveredAt },
    });

    if (claim.count !== 1) {
      throw new AppError("Este item já foi entregue.", 409, ErrorCode.ORDER_ITEM_ALREADY_DELIVERED);
    }

    await tx.orderHistory.create({
      data: {
        orderId,
        orderItemId: itemId,
        action: "ITEM_DELIVERED",
        newState: "ENTREGUE",
        userId,
      },
    });

    // Fecha o pedido quando não sobrar nenhum item válido ainda pendente.
    // Usa a lista de itens já lida dentro desta mesma transação travada —
    // com o item recém-entregue contado como entregue mesmo sem
    // reconsultar o banco — porque, sob a trava de linha do pedido,
    // nenhuma outra transação pode ter alterado outro item deste pedido
    // nesse meio-tempo. Item CANCELADO nunca bloqueia esse fechamento.
    const hasRemainingUndeliveredItem = order.items.some(
      (candidate: OrderItem) =>
        candidate.id !== itemId &&
        candidate.status !== "CANCELADO" &&
        candidate.deliveredAt === null,
    );

    if (!hasRemainingUndeliveredItem) {
      // updateMany condicional (where: deliveredAt: null) como reivindicação
      // de quem realmente fecha o pedido: sob concorrência, só uma chamada
      // encontra Order.deliveredAt ainda null e consegue de fato transicioná-lo
      // — count=1 só para essa chamada. É exatamente essa reivindicação, e
      // não apenas "hasRemainingUndeliveredItem", que decide quem grava
      // ORDER_DELIVERED (Etapa 15): garante o evento exatamente uma vez,
      // mesmo que duas entregas do último item concorram entre si.
      const orderClosedClaim = await tx.order.updateMany({
        where: { id: orderId, deliveredAt: null },
        data: { deliveredAt },
      });

      if (orderClosedClaim.count === 1) {
        await tx.orderHistory.create({
          data: {
            orderId,
            orderItemId: null,
            action: "ORDER_DELIVERED",
            userId,
          },
        });
      }
    }

    const updated = await tx.orderItem.findUnique({ where: { id: itemId } });
    if (!updated) {
      // Não deveria acontecer: acabamos de confirmar o update acima, na
      // mesma transação — mantido como defesa explícita, não como cast.
      throw new AppError("Falha inesperada ao entregar o item.", 500, ErrorCode.INTERNAL_ERROR);
    }

    return updated;
  });
}
