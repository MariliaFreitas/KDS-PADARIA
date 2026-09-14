import type { Order, OrderItem, OrderItemAdditional, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";
import type { CreateOrderInput } from "./order.types.js";
import { allocateServiceNumber } from "./service-number.service.js";

export type OrderWithItems = Order & {
  items: (OrderItem & { additionals: OrderItemAdditional[] })[];
};

// Quantas vezes tentar a transação inteira de novo quando duas criações
// concorrentes colidem no mesmo número operacional novo (violação da
// constraint @unique em ServiceNumberSlot.number).
const MAX_CREATE_ATTEMPTS = 8;

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Cria o cabeçalho do pedido e, na mesma transação, aloca o número
 * operacional (serviceNumber) que fica visível ao cliente/caixa/KDS. De
 * propósito, não há criação de OrderItem nesta função nem transação
 * envolvendo itens — isso é responsabilidade de outro módulo.
 *
 * Somente os campos abaixo são enviados ao Prisma: orderNumber é gerado
 * pelo banco (autoincrement), paymentStatus usa o default(PENDENTE) do
 * schema, createdAt usa o default(now()) do banco, e createdByUserId vem
 * do usuário autenticado (nunca do corpo da requisição). serviceNumber
 * nasce com o placeholder do schema e é sempre sobrescrito abaixo, antes
 * de a transação terminar — nenhum pedido fica visível de fora com o
 * placeholder.
 *
 * A alocação do número roda dentro de prisma.$transaction: se perder uma
 * corrida contra outra criação simultânea (violação de unicidade ao criar
 * um número novo), a transação inteira é abortada e tentada de novo do
 * zero — nunca calculamos o número fora de uma transação nem assumimos
 * que o primeiro candidato vai vencer.
 */
export async function createOrder(
  input: CreateOrderInput,
  createdByUserId: string,
): Promise<Order> {
  for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const order = await tx.order.create({
          data: {
            customerName: input.customerName,
            channel: input.channel,
            consumptionType: input.consumptionType,
            pickupTime: input.pickupTime,
            createdByUserId,
          },
        });

        const serviceNumber = await allocateServiceNumber(tx, order.id);

        return tx.order.update({
          where: { id: order.id },
          data: { serviceNumber },
        });
      });
    } catch (error) {
      const isLastAttempt = attempt === MAX_CREATE_ATTEMPTS;
      if (!isUniqueConstraintViolation(error) || isLastAttempt) {
        throw error;
      }
      // Colidiu com outra criação concorrente no mesmo número novo —
      // tenta de novo com uma transação nova do zero.
    }
  }

  // Inatingível: o loop acima sempre retorna com sucesso ou relança o
  // erro na última tentativa.
  throw new AppError(
    "Não foi possível gerar o número operacional do pedido. Tente novamente.",
    500,
    ErrorCode.INTERNAL_ERROR,
  );
}

/**
 * Busca um pedido pelo id, incluindo os itens reais (Etapa 9) ordenados
 * por includedAt asc (ordem de inclusão), cada um com seus adicionais.
 * Os nomes exibidos vêm dos snapshots do próprio item — não busca de novo
 * o nome atual do produto/adicional. Não calcula nenhum status
 * operacional: isso fica para etapas futuras.
 */
export async function getOrderById(id: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { includedAt: "asc" },
        include: { additionals: true },
      },
    },
  });

  if (!order) {
    throw new AppError("Pedido não encontrado.", 404, ErrorCode.ORDER_NOT_FOUND);
  }

  return order;
}
