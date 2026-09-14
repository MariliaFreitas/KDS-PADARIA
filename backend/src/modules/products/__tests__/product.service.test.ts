import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    station: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../../../lib/prisma.js";
import { createProduct, listProducts, updateProduct } from "../product.service.js";

const existingUnitProduct = {
  id: "p1",
  name: "Pão francês",
  active: true,
  available: true,
  saleType: "UNIT" as const,
  unitPriceCents: 50,
  pricePerKgCents: null,
  requiresProduction: false,
  stationId: null,
  createdAt: new Date(),
};

describe("product.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listProducts", () => {
    it("lista produtos ordenados por nome, com a estação incluída", async () => {
      const products = [{ ...existingUnitProduct, station: null }];
      vi.mocked(prisma.product.findMany).mockResolvedValue(products);

      const result = await listProducts();

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        orderBy: { name: "asc" },
        include: { station: true },
      });
      expect(result).toEqual(products);
    });
  });

  describe("createProduct — UNIT", () => {
    it("cria um produto UNIT com preço válido", async () => {
      const created = { ...existingUnitProduct, station: null };
      vi.mocked(prisma.product.create).mockResolvedValue(created);

      const result = await createProduct({ name: "Pão francês", saleType: "UNIT", unitPriceCents: 50 });

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: {
          name: "Pão francês",
          saleType: "UNIT",
          unitPriceCents: 50,
          pricePerKgCents: null,
          requiresProduction: false,
          stationId: null,
          active: true,
          available: true,
        },
        include: { station: true },
      });
      expect(result).toEqual(created);
    });

    it("rejeita UNIT sem unitPriceCents", async () => {
      await expect(
        createProduct({ name: "Pão francês", saleType: "UNIT" }),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_PRICE_FIELDS_INVALID" });
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it("rejeita UNIT com pricePerKgCents também informado (campos incompatíveis)", async () => {
      await expect(
        createProduct({
          name: "Pão francês",
          saleType: "UNIT",
          unitPriceCents: 50,
          pricePerKgCents: 30,
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_PRICE_FIELDS_INVALID" });
      expect(prisma.product.create).not.toHaveBeenCalled();
    });
  });

  describe("createProduct — WEIGHT", () => {
    it("cria um produto WEIGHT com preço por kg válido", async () => {
      const created = {
        ...existingUnitProduct,
        saleType: "WEIGHT" as const,
        unitPriceCents: null,
        pricePerKgCents: 4000,
        station: null,
      };
      vi.mocked(prisma.product.create).mockResolvedValue(created);

      const result = await createProduct({
        name: "Pão de queijo (kg)",
        saleType: "WEIGHT",
        pricePerKgCents: 4000,
      });

      expect(result.pricePerKgCents).toBe(4000);
      expect(result.unitPriceCents).toBeNull();
    });

    it("rejeita WEIGHT sem pricePerKgCents", async () => {
      await expect(
        createProduct({ name: "Pão de queijo (kg)", saleType: "WEIGHT" }),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_PRICE_FIELDS_INVALID" });
      expect(prisma.product.create).not.toHaveBeenCalled();
    });
  });

  describe("createProduct — VARIATION", () => {
    it("cria um produto VARIATION sem nenhum preço, sem exigir variações nesta etapa", async () => {
      const created = {
        ...existingUnitProduct,
        saleType: "VARIATION" as const,
        unitPriceCents: null,
        pricePerKgCents: null,
        station: null,
      };
      vi.mocked(prisma.product.create).mockResolvedValue(created);

      const result = await createProduct({ name: "Bolo", saleType: "VARIATION" });

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ unitPriceCents: null, pricePerKgCents: null }),
        include: { station: true },
      });
      expect(result.saleType).toBe("VARIATION");
    });
  });

  describe("createProduct — nome vazio", () => {
    // A validação de formato (trim/min length) roda no Zod, na camada de
    // controller/rotas — este teste garante que o service em si não
    // silenciosamente aceita nome vazio caso chamado diretamente.
    it("não impede nome vazio no service (responsabilidade do Zod), mas cria como veio", async () => {
      const created = { ...existingUnitProduct, name: "", station: null };
      vi.mocked(prisma.product.create).mockResolvedValue(created);

      await createProduct({ name: "", saleType: "UNIT", unitPriceCents: 50 });

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: "" }) }),
      );
    });
  });

  describe("createProduct — produção", () => {
    it("rejeita requiresProduction=true sem stationId", async () => {
      await expect(
        createProduct({
          name: "Pão francês",
          saleType: "UNIT",
          unitPriceCents: 50,
          requiresProduction: true,
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_STATION_REQUIRED" });
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it("rejeita estação inexistente", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(null);

      await expect(
        createProduct({
          name: "Pão francês",
          saleType: "UNIT",
          unitPriceCents: 50,
          requiresProduction: true,
          stationId: "estacao-inexistente",
        }),
      ).rejects.toMatchObject({ statusCode: 404, code: "STATION_NOT_FOUND" });
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it("cria com requiresProduction=true e estação existente", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue({
        id: "st1",
        name: "Forno",
        active: true,
      });
      const created = {
        ...existingUnitProduct,
        requiresProduction: true,
        stationId: "st1",
        station: { id: "st1", name: "Forno", active: true },
      };
      vi.mocked(prisma.product.create).mockResolvedValue(created);

      const result = await createProduct({
        name: "Pão francês",
        saleType: "UNIT",
        unitPriceCents: 50,
        requiresProduction: true,
        stationId: "st1",
      });

      expect(result.station).toEqual({ id: "st1", name: "Forno", active: true });
    });

    it("rejeita estação inativa com 400 STATION_NOT_AVAILABLE", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue({
        id: "st1",
        name: "Forno",
        active: false,
      });

      await expect(
        createProduct({
          name: "Pão francês",
          saleType: "UNIT",
          unitPriceCents: 50,
          requiresProduction: true,
          stationId: "st1",
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: "STATION_NOT_AVAILABLE" });
      expect(prisma.product.create).not.toHaveBeenCalled();
    });
  });

  describe("updateProduct", () => {
    it("edita o nome sem tocar nos demais campos", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(existingUnitProduct);
      const updated = { ...existingUnitProduct, name: "Pão francês grande", station: null };
      vi.mocked(prisma.product.update).mockResolvedValue(updated);

      const result = await updateProduct("p1", { name: "Pão francês grande" });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: expect.objectContaining({
          name: "Pão francês grande",
          saleType: "UNIT",
          unitPriceCents: 50,
          pricePerKgCents: null,
        }),
        include: { station: true },
      });
      expect(result.name).toBe("Pão francês grande");
    });

    it("muda saleType de UNIT para WEIGHT e normaliza unitPriceCents para null automaticamente", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(existingUnitProduct);
      const updated = {
        ...existingUnitProduct,
        saleType: "WEIGHT" as const,
        unitPriceCents: null,
        pricePerKgCents: 6000,
        station: null,
      };
      vi.mocked(prisma.product.update).mockResolvedValue(updated);

      const result = await updateProduct("p1", { saleType: "WEIGHT", pricePerKgCents: 6000 });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: expect.objectContaining({
          saleType: "WEIGHT",
          unitPriceCents: null,
          pricePerKgCents: 6000,
        }),
        include: { station: true },
      });
      expect(result.unitPriceCents).toBeNull();
    });

    it("rejeita mudar para WEIGHT sem informar pricePerKgCents (nada herdado supre isso)", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(existingUnitProduct);

      await expect(updateProduct("p1", { saleType: "WEIGHT" })).rejects.toMatchObject({
        statusCode: 400,
        code: "PRODUCT_PRICE_FIELDS_INVALID",
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it("ativa/desativa (active=false)", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(existingUnitProduct);
      const updated = { ...existingUnitProduct, active: false, station: null };
      vi.mocked(prisma.product.update).mockResolvedValue(updated);

      const result = await updateProduct("p1", { active: false });

      expect(result.active).toBe(false);
    });

    it("marca disponível/indisponível (available=false) sem alterar active", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(existingUnitProduct);
      const updated = { ...existingUnitProduct, available: false, station: null };
      vi.mocked(prisma.product.update).mockResolvedValue(updated);

      const result = await updateProduct("p1", { available: false });

      expect(result.available).toBe(false);
      const updateCall = vi.mocked(prisma.product.update).mock.calls[0][0];
      expect(updateCall.data).toMatchObject({ available: false });
      expect(updateCall.data).not.toHaveProperty("active");
    });

    it("requiresProduction=false limpa stationId mesmo que existisse antes", async () => {
      const productWithStation = {
        ...existingUnitProduct,
        requiresProduction: true,
        stationId: "st1",
      };
      vi.mocked(prisma.product.findUnique).mockResolvedValue(productWithStation);
      const updated = {
        ...productWithStation,
        requiresProduction: false,
        stationId: null,
        station: null,
      };
      vi.mocked(prisma.product.update).mockResolvedValue(updated);

      const result = await updateProduct("p1", { requiresProduction: false });

      expect(result.stationId).toBeNull();
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requiresProduction: false, stationId: null }),
        }),
      );
    });

    it("rejeita produto inexistente com 404", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

      await expect(updateProduct("inexistente", { active: false })).rejects.toMatchObject({
        statusCode: 404,
        code: "PRODUCT_NOT_FOUND",
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it("permite mudar para requiresProduction=true apontando para estação ativa", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(existingUnitProduct);
      vi.mocked(prisma.station.findUnique).mockResolvedValue({
        id: "st1",
        name: "Forno",
        active: true,
      });
      const updated = {
        ...existingUnitProduct,
        requiresProduction: true,
        stationId: "st1",
        station: { id: "st1", name: "Forno", active: true },
      };
      vi.mocked(prisma.product.update).mockResolvedValue(updated);

      const result = await updateProduct("p1", { requiresProduction: true, stationId: "st1" });

      expect(result.stationId).toBe("st1");
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requiresProduction: true, stationId: "st1" }),
        }),
      );
    });

    it("rejeita trocar stationId para uma estação inativa", async () => {
      const productWithStation = {
        ...existingUnitProduct,
        requiresProduction: true,
        stationId: "st1",
      };
      vi.mocked(prisma.product.findUnique).mockResolvedValue(productWithStation);
      vi.mocked(prisma.station.findUnique).mockResolvedValue({
        id: "st2",
        name: "Confeitaria",
        active: false,
      });

      await expect(
        updateProduct("p1", { stationId: "st2" }),
      ).rejects.toMatchObject({ statusCode: 400, code: "STATION_NOT_AVAILABLE" });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });
});
