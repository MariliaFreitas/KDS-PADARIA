import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
    },
    productVariation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../../../lib/prisma.js";
import {
  createVariation,
  listVariations,
  updateVariation,
} from "../product-variation.service.js";

// Fixtures completas dos campos reais do model Product (Prisma) — inclui
// createdAt de propósito: um mock incompleto passa no Vitest mas quebra o
// `tsc` num ambiente com o Prisma Client gerado de verdade.
const variationProduct = {
  id: "prod-1",
  name: "Bolo personalizado",
  active: true,
  available: true,
  saleType: "VARIATION" as const,
  unitPriceCents: null,
  pricePerKgCents: null,
  requiresProduction: false,
  stationId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const unitProduct = {
  ...variationProduct,
  id: "prod-2",
  saleType: "UNIT" as const,
  unitPriceCents: 500,
};

const weightProduct = {
  ...variationProduct,
  id: "prod-3",
  saleType: "WEIGHT" as const,
  pricePerKgCents: 3000,
};

const existingVariation = {
  id: "var-1",
  productId: "prod-1",
  name: "Grande",
  priceCents: 2500,
};

describe("product-variation.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listVariations", () => {
    it("lista variações de um produto VARIATION, ordenadas por nome", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(variationProduct);
      const variations = [existingVariation];
      vi.mocked(prisma.productVariation.findMany).mockResolvedValue(variations);

      const result = await listVariations("prod-1");

      expect(prisma.productVariation.findMany).toHaveBeenCalledWith({
        where: { productId: "prod-1" },
        orderBy: { name: "asc" },
      });
      expect(result).toEqual(variations);
    });

    it("rejeita produto inexistente (404 PRODUCT_NOT_FOUND)", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

      await expect(listVariations("inexistente")).rejects.toMatchObject({
        statusCode: 404,
        code: "PRODUCT_NOT_FOUND",
      });
      expect(prisma.productVariation.findMany).not.toHaveBeenCalled();
    });

    it("rejeita produto UNIT (400 PRODUCT_DOES_NOT_ACCEPT_VARIATIONS)", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(unitProduct);

      await expect(listVariations("prod-2")).rejects.toMatchObject({
        statusCode: 400,
        code: "PRODUCT_DOES_NOT_ACCEPT_VARIATIONS",
      });
      expect(prisma.productVariation.findMany).not.toHaveBeenCalled();
    });

    it("rejeita produto WEIGHT (400 PRODUCT_DOES_NOT_ACCEPT_VARIATIONS)", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(weightProduct);

      await expect(listVariations("prod-3")).rejects.toMatchObject({
        statusCode: 400,
        code: "PRODUCT_DOES_NOT_ACCEPT_VARIATIONS",
      });
      expect(prisma.productVariation.findMany).not.toHaveBeenCalled();
    });
  });

  describe("createVariation", () => {
    it("cria uma variação para um produto VARIATION", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(variationProduct);
      vi.mocked(prisma.productVariation.create).mockResolvedValue(existingVariation);

      const result = await createVariation("prod-1", { name: "Grande", priceCents: 2500 });

      expect(prisma.productVariation.create).toHaveBeenCalledWith({
        data: { productId: "prod-1", name: "Grande", priceCents: 2500 },
      });
      expect(result).toEqual(existingVariation);
    });

    it("rejeita produto inexistente", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

      await expect(
        createVariation("inexistente", { name: "Grande", priceCents: 2500 }),
      ).rejects.toMatchObject({ statusCode: 404, code: "PRODUCT_NOT_FOUND" });
      expect(prisma.productVariation.create).not.toHaveBeenCalled();
    });

    it("rejeita produto UNIT tentando receber variação", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(unitProduct);

      await expect(
        createVariation("prod-2", { name: "Grande", priceCents: 2500 }),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_DOES_NOT_ACCEPT_VARIATIONS" });
      expect(prisma.productVariation.create).not.toHaveBeenCalled();
    });

    it("rejeita produto WEIGHT tentando receber variação", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(weightProduct);

      await expect(
        createVariation("prod-3", { name: "Grande", priceCents: 2500 }),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_DOES_NOT_ACCEPT_VARIATIONS" });
      expect(prisma.productVariation.create).not.toHaveBeenCalled();
    });
  });

  describe("updateVariation", () => {
    it("edita o nome de uma variação", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(variationProduct);
      vi.mocked(prisma.productVariation.findUnique).mockResolvedValue(existingVariation);
      const updated = { ...existingVariation, name: "Família" };
      vi.mocked(prisma.productVariation.update).mockResolvedValue(updated);

      const result = await updateVariation("prod-1", "var-1", { name: "Família" });

      expect(prisma.productVariation.update).toHaveBeenCalledWith({
        where: { id: "var-1" },
        data: { name: "Família" },
      });
      expect(result.name).toBe("Família");
    });

    it("edita o preço de uma variação", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(variationProduct);
      vi.mocked(prisma.productVariation.findUnique).mockResolvedValue(existingVariation);
      const updated = { ...existingVariation, priceCents: 3200 };
      vi.mocked(prisma.productVariation.update).mockResolvedValue(updated);

      const result = await updateVariation("prod-1", "var-1", { priceCents: 3200 });

      expect(prisma.productVariation.update).toHaveBeenCalledWith({
        where: { id: "var-1" },
        data: { priceCents: 3200 },
      });
      expect(result.priceCents).toBe(3200);
    });

    it("rejeita quando o produto (da URL) não existe", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

      await expect(
        updateVariation("inexistente", "var-1", { priceCents: 3200 }),
      ).rejects.toMatchObject({ statusCode: 404, code: "PRODUCT_NOT_FOUND" });
      expect(prisma.productVariation.findUnique).not.toHaveBeenCalled();
    });

    it("rejeita quando o produto (da URL) não é VARIATION", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(unitProduct);

      await expect(
        updateVariation("prod-2", "var-1", { priceCents: 3200 }),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_DOES_NOT_ACCEPT_VARIATIONS" });
      expect(prisma.productVariation.findUnique).not.toHaveBeenCalled();
    });

    it("rejeita variação inexistente (404 PRODUCT_VARIATION_NOT_FOUND)", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(variationProduct);
      vi.mocked(prisma.productVariation.findUnique).mockResolvedValue(null);

      await expect(
        updateVariation("prod-1", "inexistente", { priceCents: 3200 }),
      ).rejects.toMatchObject({ statusCode: 404, code: "PRODUCT_VARIATION_NOT_FOUND" });
      expect(prisma.productVariation.update).not.toHaveBeenCalled();
    });

    it("rejeita editar uma variação que pertence a outro produto", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(variationProduct);
      vi.mocked(prisma.productVariation.findUnique).mockResolvedValue({
        ...existingVariation,
        productId: "outro-produto",
      });

      await expect(
        updateVariation("prod-1", "var-1", { priceCents: 3200 }),
      ).rejects.toMatchObject({ statusCode: 404, code: "PRODUCT_VARIATION_NOT_FOUND" });
      expect(prisma.productVariation.update).not.toHaveBeenCalled();
    });
  });
});
