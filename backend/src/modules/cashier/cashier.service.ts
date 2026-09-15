import type { Order, OrderItem, OrderItemAdditional, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";
import { scheduleServiceNumberReuse } from "../orders/service-number.service.js";

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
  channel: Order["channel"];
  consumptionType: Order["consumptionType"];
  createdAt: Date;
  items: CashierOrderItem[];
  totalCents: number;
}

type ItemWithAdditionals = OrderItem & { additionals: OrderItemAdditional[] };
type OrderWithItems = Order & { items: ItemWithAdditionals[] };
type OrderWithBillableItems = Order & { items: OrderItem[] };

function billableItems<T extends OrderItem>(items: T[]): T[] {
  return items.filter((item) => item.status !== "CANCELADO");
}

/** Soma só os itens que ainda contam para o total — item cancelado não entra na conta. */
function billableTotalCents(items: OrderItem[]): number {
  return billableItems(items).reduce((sum, item) => sum + item.totalCents, 0);
}

function toCashierOrder(order: OrderWithItems): CashierOrder {
  const billable = billableItems(order.items);

  return {
    id: order.id,
    serviceNumber: order.serviceNumber,
    customerName: order.customerName,
    channel: order.channel,
    consumptionType: order.consumptionType,
    createdAt: order.createdAt,
    items: billable.map((item) => ({
      id: item.id,
      productNameSnapshot: item.productNameSnapshot,
      quantity: item.quantity,
      weightGrams: item.weightGrams,
      variationNameSnapshot: item.variationNameSnapshot,
      additionals: item.additionals.map((additional: OrderItemAdditional) => ({
        nameSnapshot: additional.nameSnapshot,
        quantity: additional.quantity,
      })),
    })),
    totalCents: billable.reduce((sum, item) => sum + item.totalCents, 0),
  };
}

/**
 * Lista os pedidos com conta aberta (paymentStatus=PENDENTE, não
 * cancelados) — é exatamente essa consulta que define "conta aberta":
 * não existe nenhuma coluna nova para esse conceito. Busca opcional por
 * número operacional (match exato, quando o texto é um inteiro) ou nome
 * do cliente (substring, sem diferenciar caixa). Ordenado por createdAt
 * asc — quem chegou primeiro aparece primeiro para o caixa.
 */
export async function listOpenOrders(search?: string): Promise<CashierOrder[]> {
  const where: Prisma.OrderWhereInput = {
    paymentStatus: "PENDENTE",
    cancelledAt: null,
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

  const orders: OrderWithItems[] = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: { items: { include: { additionals: true } } },
  });

  return orders.map(toCashierOrder);
}

/**
 * Confirma o pagamento de um pedido: total é sempre recalculado no
 * servidor a partir dos itens não cancelados (nunca aceita total vindo do
 * cliente), paymentStatus passa a PAGO, e o número operacional é agendado
 * para voltar ao pool só 7h depois.
 *
 * Antes de ler qualquer coisa, trava a mesma linha do pedido que
 * addOrderItem trava (SELECT ... FOR UPDATE) — é essa trava, e não a
 * checagem de paymentStatus sozinha, que impede um item de ser criado
 * depois do fechamento financeiro por causa de uma corrida: quem travar
 * primeiro decide a ordem real dos dois eventos, o outro só continua
 * depois do commit.
 *
 * A checagem final ainda usa updateMany com a mesma condição (paymentStatus
 * ainda PENDENTE, ainda não cancelado) em vez de um update direto, como
 * segunda camada de defesa — mas com a trava de linha, essa condição já
 * não deveria falhar por corrida com addOrderItem; ela cobre o caso de
 * outra confirmação de pagamento concorrente.
 */
export async function confirmPayment(orderId: string, userId: string): Promise<Order> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM "orders" WHERE id = ${orderId} FOR UPDATE`;

    const order: OrderWithBillableItems | null = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new AppError("Pedido não encontrado.", 404, ErrorCode.ORDER_NOT_FOUND);
    }

    if (order.cancelledAt !== null) {
      throw new AppError(
        "Pedido cancelado não pode ter pagamento confirmado.",
        409,
        ErrorCode.ORDER_CANCELLED,
      );
    }

    if (order.paymentStatus === "PAGO") {
      throw new AppError(
        "Pagamento já havia sido confirmado para este pedido.",
        409,
        ErrorCode.PAYMENT_ALREADY_CONFIRMED,
      );
    }

    const totalCents = billableTotalCents(order.items);
    if (totalCents <= 0) {
      throw new AppError(
        "Este pedido não tem nenhum item cobrável.",
        409,
        ErrorCode.PAYMENT_NOTHING_TO_CHARGE,
      );
    }

    const paidAt = new Date();
    const claim = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "PENDENTE", cancelledAt: null },
      data: { paymentStatus: "PAGO", paidAt, paidByUserId: userId },
    });

    if (claim.count !== 1) {
      throw new AppError(
        "Pagamento já havia sido confirmado para este pedido.",
        409,
        ErrorCode.PAYMENT_ALREADY_CONFIRMED,
      );
    }

    // Etapa 15: só grava PAYMENT_CONFIRMED depois que a reivindicação
    // condicional acima confirmou que ESTA chamada foi quem realmente
    // mudou paymentStatus PENDENTE -> PAGO — uma segunda confirmação
    // concorrente/duplicada já teria sido rejeitada pelo claim.count acima
    // e nunca chega aqui, então nunca duplica este registro de histórico.
    await tx.orderHistory.create({
      data: {
        orderId,
        orderItemId: null,
        action: "PAYMENT_CONFIRMED",
        previousState: "PENDENTE",
        newState: "PAGO",
        userId,
      },
    });

    await scheduleServiceNumberReuse(tx, orderId, paidAt);

    const updated: Order | null = await tx.order.findUnique({ where: { id: orderId } });
    if (!updated) {
      // Não deveria acontecer: acabamos de confirmar o update acima, na
      // mesma transação — mantido como defesa explícita, não como cast.
      throw new AppError(
        "Falha inesperada ao confirmar o pagamento.",
        500,
        ErrorCode.INTERNAL_ERROR,
      );
    }

    return updated;
  });
}
