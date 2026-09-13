import type { Order, OrderItem } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";
import type { CreateOrderInput } from "./order.types.js";

export type OrderWithItems = Order & { items: OrderItem[] };

/**
 * Cria apenas o cabeçalho do pedido (Etapa 8). Itens entram na Etapa 9 —
 * de propósito, não há criação de OrderItem nesta função nem transação
 * envolvendo itens.
 *
 * Somente os campos abaixo são enviados ao Prisma: orderNumber é gerado
 * pelo banco (autoincrement), paymentStatus usa o default(PENDENTE) do
 * schema, createdAt usa o default(now()) do banco, e createdByUserId vem
 * do usuário autenticado (nunca do corpo da requisição).
 */
export async function createOrder(
  input: CreateOrderInput,
  createdByUserId: string,
): Promise<Order> {
  return prisma.order.create({
    data: {
      customerName: input.customerName,
      channel: input.channel,
      consumptionType: input.consumptionType,
      pickupTime: input.pickupTime,
      createdByUserId,
    },
  });
}

/**
 * Busca um pedido pelo id, incluindo os itens (vazios nesta etapa — a
 * Etapa 9 é quem passa a populá-los). Não calcula nenhum status
 * operacional: isso fica para etapas futuras.
 */
export async function getOrderById(id: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!order) {
    throw new AppError("Pedido não encontrado.", 404, ErrorCode.ORDER_NOT_FOUND);
  }

  return order;
}
