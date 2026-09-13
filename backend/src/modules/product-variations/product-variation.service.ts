import type { Product, ProductVariation } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";
import type { CreateVariationInput, UpdateVariationInput } from "./product-variation.types.js";

/**
 * Variações só existem para produtos saleType=VARIATION (Etapa 5). Toda
 * operação deste módulo passa por aqui primeiro: confere que o produto
 * existe e que ele realmente aceita variações antes de tocar em
 * ProductVariation.
 */
async function getVariationEligibleProduct(productId: string): Promise<Product> {
  const product = await prisma.product.findUnique({ where: { id: productId } });

  if (!product) {
    throw new AppError("Produto não encontrado.", 404, ErrorCode.PRODUCT_NOT_FOUND);
  }

  if (product.saleType !== "VARIATION") {
    throw new AppError(
      "Este produto não aceita variações (a forma de venda não é VARIATION).",
      400,
      ErrorCode.PRODUCT_DOES_NOT_ACCEPT_VARIATIONS,
    );
  }

  return product;
}

export async function listVariations(productId: string): Promise<ProductVariation[]> {
  await getVariationEligibleProduct(productId);

  return prisma.productVariation.findMany({
    where: { productId },
    orderBy: { name: "asc" },
  });
}

export async function createVariation(
  productId: string,
  input: CreateVariationInput,
): Promise<ProductVariation> {
  await getVariationEligibleProduct(productId);

  return prisma.productVariation.create({
    data: {
      productId,
      name: input.name,
      priceCents: input.priceCents,
    },
  });
}

export async function updateVariation(
  productId: string,
  variationId: string,
  input: UpdateVariationInput,
): Promise<ProductVariation> {
  await getVariationEligibleProduct(productId);

  const variation = await prisma.productVariation.findUnique({ where: { id: variationId } });

  // "Não existe" e "existe, mas é de outro produto" recebem a mesma resposta
  // de propósito: um 404 aqui não confirma nem nega que a variação exista
  // em outro produto, só que ela não pertence a este.
  if (!variation || variation.productId !== productId) {
    throw new AppError("Variação não encontrada.", 404, ErrorCode.PRODUCT_VARIATION_NOT_FOUND);
  }

  return prisma.productVariation.update({
    where: { id: variationId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
    },
  });
}
