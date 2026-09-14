import type { Additional, Product, ProductVariation } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export type CatalogProduct = Product & { variations: ProductVariation[] };

export interface Catalog {
  products: CatalogProduct[];
  additionals: Additional[];
}

/**
 * Catálogo operacional (Etapa 9): só o que a tela de atendimento precisa
 * para montar um item — produtos vendáveis (active+available) com suas
 * variações, e adicionais ativos. Não altera nem reaproveita os endpoints
 * administrativos existentes (GET /api/products, /api/additionals
 * continuam retornando tudo, inclusive inativos, para o cadastro).
 */
export async function getCatalog(): Promise<Catalog> {
  const [products, additionals] = await Promise.all([
    prisma.product.findMany({
      where: { active: true, available: true },
      orderBy: { name: "asc" },
      include: {
        variations: { orderBy: { name: "asc" } },
      },
    }),
    prisma.additional.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { products, additionals };
}
