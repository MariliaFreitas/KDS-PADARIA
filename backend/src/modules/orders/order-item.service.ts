import type { Order, OrderItem, OrderItemAdditional, Product, Station } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";
import type { CreateOrderItemInput } from "./order-item.types.js";

export type OrderItemWithAdditionals = OrderItem & { additionals: OrderItemAdditional[] };

type ProductWithStation = Product & { station: Station | null };

/**
 * Pedido precisa existir e estar "aberto" (nem cancelado, nem já
 * entregue) para aceitar item novo. paymentStatus é ignorado de propósito
 * aqui: pagamento é independente do andamento operacional (Etapa 9).
 */
async function getOpenOrder(orderId: string): Promise<Order> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) {
    throw new AppError("Pedido não encontrado.", 404, ErrorCode.ORDER_NOT_FOUND);
  }

  if (order.cancelledAt !== null || order.deliveredAt !== null) {
    throw new AppError(
      "Este pedido já está fechado (cancelado ou entregue) e não aceita novos itens.",
      409,
      ErrorCode.ORDER_NOT_OPEN,
    );
  }

  return order;
}

/** Produto precisa existir e estar vendável (active + available). */
async function getSellableProduct(productId: string): Promise<ProductWithStation> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { station: true },
  });

  if (!product) {
    throw new AppError("Produto não encontrado.", 404, ErrorCode.PRODUCT_NOT_FOUND);
  }

  if (!product.active || !product.available) {
    throw new AppError(
      "Produto não está disponível para venda no momento.",
      400,
      ErrorCode.PRODUCT_NOT_AVAILABLE,
    );
  }

  return product;
}

interface ResolvedSaleTypeFields {
  basePriceCentsSnapshot: number;
  quantity: number | null;
  weightGrams: number | null;
  variationId: string | null;
  variationNameSnapshot: string | null;
  subtotalBaseCents: number;
}

function rejectItemInput(message: string): never {
  throw new AppError(message, 400, ErrorCode.ORDER_ITEM_INPUT_INVALID);
}

/**
 * A forma de venda vem sempre de product.saleType — nunca do corpo da
 * requisição. Cada ramo exige/proíbe os campos certos e resolve o
 * preço-base congelado a partir do cadastro atual (Etapa 9/10).
 */
async function resolveSaleTypeFields(
  product: ProductWithStation,
  input: CreateOrderItemInput,
): Promise<ResolvedSaleTypeFields> {
  if (product.saleType === "UNIT") {
    if (input.quantity === undefined) {
      rejectItemInput("Produto por unidade exige quantity (inteiro maior que zero).");
    }
    if (input.weightGrams !== undefined) {
      rejectItemInput("Produto por unidade não aceita weightGrams.");
    }
    if (input.variationId !== undefined) {
      rejectItemInput("Produto por unidade não aceita variationId.");
    }
    if (product.unitPriceCents === null) {
      throw new AppError(
        "Produto está com cadastro inconsistente: falta o preço unitário.",
        400,
        ErrorCode.PRODUCT_CONFIGURATION_INVALID,
      );
    }

    return {
      basePriceCentsSnapshot: product.unitPriceCents,
      quantity: input.quantity,
      weightGrams: null,
      variationId: null,
      variationNameSnapshot: null,
      subtotalBaseCents: product.unitPriceCents * input.quantity,
    };
  }

  if (product.saleType === "VARIATION") {
    if (input.quantity === undefined) {
      rejectItemInput("Produto por variação exige quantity (inteiro maior que zero).");
    }
    if (input.variationId === undefined) {
      rejectItemInput("Produto por variação exige variationId.");
    }
    if (input.weightGrams !== undefined) {
      rejectItemInput("Produto por variação não aceita weightGrams.");
    }

    const variation = await prisma.productVariation.findUnique({
      where: { id: input.variationId },
    });

    // "Não existe" e "existe, mas é de outro produto" recebem a mesma
    // resposta de propósito — mesmo padrão de segurança da Etapa 6.
    if (!variation || variation.productId !== product.id) {
      throw new AppError("Variação não encontrada.", 404, ErrorCode.PRODUCT_VARIATION_NOT_FOUND);
    }

    return {
      basePriceCentsSnapshot: variation.priceCents,
      quantity: input.quantity,
      weightGrams: null,
      variationId: variation.id,
      variationNameSnapshot: variation.name,
      subtotalBaseCents: variation.priceCents * input.quantity,
    };
  }

  // WEIGHT
  if (input.weightGrams === undefined) {
    rejectItemInput("Produto por peso exige weightGrams (inteiro maior que zero).");
  }
  if (input.quantity !== undefined) {
    rejectItemInput("Produto por peso não aceita quantity.");
  }
  if (input.variationId !== undefined) {
    rejectItemInput("Produto por peso não aceita variationId.");
  }
  if (product.pricePerKgCents === null) {
    throw new AppError(
      "Produto está com cadastro inconsistente: falta o preço por kg.",
      400,
      ErrorCode.PRODUCT_CONFIGURATION_INVALID,
    );
  }

  return {
    basePriceCentsSnapshot: product.pricePerKgCents,
    quantity: null,
    weightGrams: input.weightGrams,
    variationId: null,
    variationNameSnapshot: null,
    // Armazenamento sempre em gramas inteiras; arredonda o total pro
    // centavo mais próximo (nunca opera com float de reais).
    subtotalBaseCents: Math.round((input.weightGrams * product.pricePerKgCents) / 1000),
  };
}

interface ResolvedProductionRoute {
  requiresProductionSnapshot: boolean;
  stationIdSnapshot: string | null;
  stationNameSnapshot: string | null;
}

/**
 * O roteamento para estação é sempre derivado do cadastro atual do
 * produto — nunca do corpo da requisição ou do frontend (Etapa 11).
 *
 * Produto sem produção nunca recebe estação no item, mesmo que sobre
 * algum stationId inconsistente no cadastro: a regra é requiresProduction,
 * não a mera presença de stationId. Produto com produção exige uma
 * estação configurada e ativa; sem isso o item não é criado — nada de
 * estação padrão, primeira disponível ou preenchimento artificial.
 */
function resolveProductionRoute(product: ProductWithStation): ResolvedProductionRoute {
  if (!product.requiresProduction) {
    return {
      requiresProductionSnapshot: false,
      stationIdSnapshot: null,
      stationNameSnapshot: null,
    };
  }

  if (!product.stationId || !product.station) {
    throw new AppError(
      "Produto exige produção, mas não possui uma estação válida configurada.",
      400,
      ErrorCode.PRODUCT_ROUTING_INVALID,
    );
  }

  if (!product.station.active) {
    throw new AppError(
      "A estação configurada para este produto está inativa.",
      400,
      ErrorCode.STATION_NOT_AVAILABLE,
    );
  }

  return {
    requiresProductionSnapshot: true,
    stationIdSnapshot: product.station.id,
    stationNameSnapshot: product.station.name,
  };
}

interface ResolvedAdditional {
  additionalId: string;
  nameSnapshot: string;
  priceCentsSnapshot: number;
  quantity: number;
}

/** Adicionais são globais — cada um é resolvido e congelado individualmente. */
async function resolveAdditionals(
  input: CreateOrderItemInput["additionals"],
): Promise<{ additionals: ResolvedAdditional[]; subtotalCents: number }> {
  if (!input || input.length === 0) {
    return { additionals: [], subtotalCents: 0 };
  }

  const additionals: ResolvedAdditional[] = [];
  let subtotalCents = 0;

  for (const item of input) {
    const additional = await prisma.additional.findUnique({ where: { id: item.additionalId } });

    if (!additional) {
      throw new AppError("Adicional não encontrado.", 404, ErrorCode.ADDITIONAL_NOT_FOUND);
    }
    if (!additional.active) {
      throw new AppError(
        "Adicional não está disponível no momento.",
        400,
        ErrorCode.ADDITIONAL_NOT_AVAILABLE,
      );
    }

    additionals.push({
      additionalId: additional.id,
      nameSnapshot: additional.name,
      priceCentsSnapshot: additional.priceCents,
      quantity: item.quantity,
    });
    subtotalCents += additional.priceCents * item.quantity;
  }

  return { additionals, subtotalCents };
}

/**
 * Adiciona um item ao pedido (Etapas 9+10 juntas: OrderItem exige preço e
 * total já congelados na criação, então não dá para separar "criar item"
 * de "calcular preço"). Sequência: pedido aberto -> produto vendável ->
 * forma de venda -> adicionais -> roteamento para estação (Etapa 11) ->
 * total -> persistência. Item e seus OrderItemAdditional são criados de
 * forma atômica via nested create do Prisma — nada é persistido se
 * qualquer validação de produto/variação/adicional/roteamento falhar
 * antes.
 */
export async function addOrderItem(
  orderId: string,
  input: CreateOrderItemInput,
): Promise<OrderItemWithAdditionals> {
  const order = await getOpenOrder(orderId);
  const product = await getSellableProduct(input.productId);

  const saleTypeFields = await resolveSaleTypeFields(product, input);
  const { additionals, subtotalCents: additionalsSubtotalCents } = await resolveAdditionals(
    input.additionals,
  );
  const productionRoute = resolveProductionRoute(product);

  const totalCents = saleTypeFields.subtotalBaseCents + additionalsSubtotalCents;

  return prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: product.id,
      productNameSnapshot: product.name,
      saleType: product.saleType,
      basePriceCentsSnapshot: saleTypeFields.basePriceCentsSnapshot,
      requiresProductionSnapshot: productionRoute.requiresProductionSnapshot,
      quantity: saleTypeFields.quantity,
      weightGrams: saleTypeFields.weightGrams,
      variationId: saleTypeFields.variationId,
      variationNameSnapshot: saleTypeFields.variationNameSnapshot,
      stationIdSnapshot: productionRoute.stationIdSnapshot,
      stationNameSnapshot: productionRoute.stationNameSnapshot,
      totalCents,
      observation: input.observation,
      additionals: {
        create: additionals,
      },
    },
    include: { additionals: true },
  });
}
