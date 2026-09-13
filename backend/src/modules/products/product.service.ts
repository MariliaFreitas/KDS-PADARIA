import type { Product, SaleType, Station } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";
import type { CreateProductInput, UpdateProductInput } from "./product.types.js";

export type ProductWithStation = Product & { station: Station | null };

const PRODUCT_INCLUDE = { station: true } as const;

interface PriceInput {
  unitPriceCents?: number | null;
  pricePerKgCents?: number | null;
}

interface PriceExisting {
  unitPriceCents: number | null;
  pricePerKgCents: number | null;
}

interface ProductionInput {
  requiresProduction?: boolean;
  stationId?: string | null;
}

interface ProductionExisting {
  requiresProduction: boolean;
  stationId: string | null;
}

/**
 * Resolve o valor final de unitPriceCents/pricePerKgCents dado o saleType
 * final (o que o produto vai ter depois da operação) e o que foi realmente
 * enviado nesta requisição.
 *
 * Duas situações são tratadas de forma diferente de propósito:
 *
 * 1. O cliente ENVIOU um preço incompatível com o saleType final (ex: manda
 *    pricePerKgCents num produto UNIT). Isso é erro do cliente — rejeitamos
 *    com PRODUCT_PRICE_FIELDS_INVALID, não normalizamos silenciosamente algo
 *    que foi explicitamente pedido.
 * 2. Um campo incompatível ficou para trás no banco por causa de um saleType
 *    ANTERIOR (ex: produto era WEIGHT, tinha pricePerKgCents, e o PATCH está
 *    mudando para UNIT sem tocar em pricePerKgCents). Nesse caso o cliente
 *    não pediu nada de errado — ele só não é obrigado a limpar manualmente
 *    um campo que deixou de fazer sentido. Isso é normalizado para null,
 *    conforme decidido para a Etapa 5.
 */
function resolvePriceFields(
  finalSaleType: SaleType,
  input: PriceInput,
  existing: PriceExisting | null,
): { unitPriceCents: number | null; pricePerKgCents: number | null } {
  const unitProvided = input.unitPriceCents !== undefined;
  const kgProvided = input.pricePerKgCents !== undefined;

  if (unitProvided && input.unitPriceCents !== null && finalSaleType !== "UNIT") {
    throw new AppError(
      "unitPriceCents só pode ser informado quando a forma de venda é UNIT.",
      400,
      ErrorCode.PRODUCT_PRICE_FIELDS_INVALID,
    );
  }
  if (kgProvided && input.pricePerKgCents !== null && finalSaleType !== "WEIGHT") {
    throw new AppError(
      "pricePerKgCents só pode ser informado quando a forma de venda é WEIGHT.",
      400,
      ErrorCode.PRODUCT_PRICE_FIELDS_INVALID,
    );
  }

  const unitPriceCents = unitProvided
    ? (input.unitPriceCents ?? null)
    : (existing?.unitPriceCents ?? null);
  const pricePerKgCents = kgProvided
    ? (input.pricePerKgCents ?? null)
    : (existing?.pricePerKgCents ?? null);

  return {
    // Normalização final: qualquer campo que não pertence ao saleType
    // resultante sai como null, mesmo que tenha sobrevivido do estado
    // anterior (caso 2 acima).
    unitPriceCents: finalSaleType === "UNIT" ? unitPriceCents : null,
    pricePerKgCents: finalSaleType === "WEIGHT" ? pricePerKgCents : null,
  };
}

function assertRequiredPrice(
  saleType: SaleType,
  fields: { unitPriceCents: number | null; pricePerKgCents: number | null },
): void {
  if (saleType === "UNIT" && fields.unitPriceCents === null) {
    throw new AppError(
      "Produto por unidade exige preço unitário (unitPriceCents).",
      400,
      ErrorCode.PRODUCT_PRICE_FIELDS_INVALID,
    );
  }
  if (saleType === "WEIGHT" && fields.pricePerKgCents === null) {
    throw new AppError(
      "Produto por peso exige preço por kg (pricePerKgCents).",
      400,
      ErrorCode.PRODUCT_PRICE_FIELDS_INVALID,
    );
  }
}

/**
 * Resolve requiresProduction/stationId. Ao contrário dos preços, uma estação
 * "sobrando" de antes NÃO é tratada como erro em nenhum caso — a regra pede
 * explicitamente para limpar stationId sempre que requiresProduction vira
 * false, então isso é sempre normalização, nunca rejeição.
 */
function resolveProductionFields(
  input: ProductionInput,
  existing: ProductionExisting | null,
): { requiresProduction: boolean; stationId: string | null } {
  const requiresProduction = input.requiresProduction ?? existing?.requiresProduction ?? false;

  if (!requiresProduction) {
    return { requiresProduction: false, stationId: null };
  }

  const stationIdProvided = input.stationId !== undefined;
  const stationId = stationIdProvided ? (input.stationId ?? null) : (existing?.stationId ?? null);

  if (!stationId) {
    throw new AppError(
      "Produto que exige produção precisa de uma estação (stationId).",
      400,
      ErrorCode.PRODUCT_STATION_REQUIRED,
    );
  }

  return { requiresProduction: true, stationId };
}

async function assertStationExists(stationId: string | null): Promise<void> {
  if (!stationId) return;

  const station = await prisma.station.findUnique({ where: { id: stationId } });
  if (!station) {
    throw new AppError("Estação não encontrada.", 404, ErrorCode.STATION_NOT_FOUND);
  }
}

export async function listProducts(): Promise<ProductWithStation[]> {
  return prisma.product.findMany({
    orderBy: { name: "asc" },
    include: PRODUCT_INCLUDE,
  });
}

export async function createProduct(input: CreateProductInput): Promise<ProductWithStation> {
  const priceFields = resolvePriceFields(input.saleType, input, null);
  assertRequiredPrice(input.saleType, priceFields);

  const productionFields = resolveProductionFields(input, null);
  await assertStationExists(productionFields.stationId);

  return prisma.product.create({
    data: {
      name: input.name,
      saleType: input.saleType,
      unitPriceCents: priceFields.unitPriceCents,
      pricePerKgCents: priceFields.pricePerKgCents,
      requiresProduction: productionFields.requiresProduction,
      stationId: productionFields.stationId,
      active: input.active ?? true,
      available: input.available ?? true,
    },
    include: PRODUCT_INCLUDE,
  });
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<ProductWithStation> {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Produto não encontrado.", 404, ErrorCode.PRODUCT_NOT_FOUND);
  }

  const finalSaleType = input.saleType ?? existing.saleType;
  const priceFields = resolvePriceFields(finalSaleType, input, existing);
  assertRequiredPrice(finalSaleType, priceFields);

  const productionFields = resolveProductionFields(input, existing);
  await assertStationExists(productionFields.stationId);

  return prisma.product.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      saleType: finalSaleType,
      unitPriceCents: priceFields.unitPriceCents,
      pricePerKgCents: priceFields.pricePerKgCents,
      requiresProduction: productionFields.requiresProduction,
      stationId: productionFields.stationId,
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.available !== undefined ? { available: input.available } : {}),
    },
    include: PRODUCT_INCLUDE,
  });
}
