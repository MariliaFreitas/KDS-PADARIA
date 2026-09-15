import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    order: { findUnique: vi.fn() },
    product: { findUnique: vi.fn() },
    productVariation: { findUnique: vi.fn() },
    additional: { findUnique: vi.fn() },
    orderItem: { create: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma.js";
import { addOrderItem } from "../order-item.service.js";
import type { CreateOrderItemInput } from "../order-item.types.js";

/**
 * Constrói um input válido para addOrderItem já com observation: null (a
 * própria função de service, chamada diretamente aqui sem passar pelo
 * Zod, exige o campo — o parse do controller é quem normalmente
 * preenche isso). Evita repetir `observation: null` em todo teste.
 */
function item(
  overrides: Partial<CreateOrderItemInput> & { productId: string },
): CreateOrderItemInput {
  return { observation: null, ...overrides };
}

// Fixtures com todos os campos reais dos models envolvidos.

const openOrder = {
  id: "order-1",
  orderNumber: 154,
  serviceNumber: 12,
  customerName: "Maria",
  channel: "BALCAO" as const,
  consumptionType: "LOCAL" as const,
  pickupTime: null,
  paymentStatus: "PENDENTE" as const,
  paidAt: null,
  paidByUserId: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledByUserId: null,
  deliveredAt: null,
  createdByUserId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const cancelledOrder = {
  ...openOrder,
  id: "order-cancelled",
  cancelledAt: new Date("2026-01-02T00:00:00.000Z"),
  cancelReason: "Cliente desistiu",
  cancelledByUserId: "user-2",
};

const deliveredOrder = {
  ...openOrder,
  id: "order-delivered",
  deliveredAt: new Date("2026-01-02T00:00:00.000Z"),
};

const paidOrder = {
  ...openOrder,
  id: "order-paid",
  paymentStatus: "PAGO" as const,
  paidAt: new Date("2026-01-02T00:00:00.000Z"),
  paidByUserId: "caixa-1",
};

const unitProduct = {
  id: "product-unit",
  name: "Pão francês",
  active: true,
  available: true,
  saleType: "UNIT" as const,
  unitPriceCents: 500,
  pricePerKgCents: null,
  requiresProduction: false,
  stationId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  station: null,
};

const variationProduct = {
  id: "product-variation",
  name: "Bolo",
  active: true,
  available: true,
  saleType: "VARIATION" as const,
  unitPriceCents: null,
  pricePerKgCents: null,
  requiresProduction: true,
  stationId: "station-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  station: { id: "station-1", name: "Confeitaria", active: true },
};

const weightProduct = {
  id: "product-weight",
  name: "Bolo por peso",
  active: true,
  available: true,
  saleType: "WEIGHT" as const,
  unitPriceCents: null,
  pricePerKgCents: 4000,
  requiresProduction: false,
  stationId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  station: null,
};

const variationFixture = {
  id: "variation-1",
  productId: "product-variation",
  name: "Grande",
  priceCents: 800,
};

const additionalFixture = {
  id: "additional-1",
  name: "Manteiga",
  priceCents: 150,
  active: true,
};

const inactiveAdditionalFixture = { ...additionalFixture, id: "additional-2", active: false };

const createdOrderItemFixture = {
  id: "item-1",
  orderId: "order-1",
  productId: "product-unit",
  productNameSnapshot: "Pão francês",
  saleType: "UNIT" as const,
  basePriceCentsSnapshot: 500,
  requiresProductionSnapshot: false,
  quantity: 2,
  weightGrams: null,
  variationId: null,
  variationNameSnapshot: null,
  stationIdSnapshot: null,
  stationNameSnapshot: null,
  status: "PENDENTE" as const,
  totalCents: 1000,
  observation: null,
  includedAt: new Date("2026-01-01T00:00:00.000Z"),
  deliveredAt: null,
  additionals: [],
};

describe("order-item.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // addOrderItem roda tudo dentro de prisma.$transaction; como os mocks
    // abaixo são os mesmos objetos vi.fn() tanto em prisma.* quanto no "tx"
    // recebido pelo callback, nenhuma asserção existente muda — só passamos
    // o mock inteiro como se fosse o client da transação.
    vi.mocked(prisma.$transaction).mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      Promise.resolve(callback(prisma)),
    );
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: "order-1" }]);
    vi.mocked(prisma.order.findUnique).mockResolvedValue(openOrder);
    vi.mocked(prisma.orderItem.create).mockResolvedValue(createdOrderItemFixture);
  });

  describe("pedido", () => {
    it("rejeita pedido inexistente com 404 ORDER_NOT_FOUND", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

      await expect(
        addOrderItem("inexistente", item({ productId: "product-unit", quantity: 1 })),
      ).rejects.toMatchObject({ statusCode: 404, code: "ORDER_NOT_FOUND" });
    });

    it("rejeita pedido cancelado com 409 ORDER_NOT_OPEN", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(cancelledOrder);

      await expect(
        addOrderItem("order-cancelled", item({ productId: "product-unit", quantity: 1 })),
      ).rejects.toMatchObject({ statusCode: 409, code: "ORDER_NOT_OPEN" });
    });

    it("rejeita pedido já entregue com 409 ORDER_NOT_OPEN", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(deliveredOrder);

      await expect(
        addOrderItem("order-delivered", item({ productId: "product-unit", quantity: 1 })),
      ).rejects.toMatchObject({ statusCode: 409, code: "ORDER_NOT_OPEN" });
    });

    it("rejeita pedido já pago com 409 ORDER_ALREADY_PAID", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(paidOrder);

      await expect(
        addOrderItem("order-paid", item({ productId: "product-unit", quantity: 1 })),
      ).rejects.toMatchObject({ statusCode: 409, code: "ORDER_ALREADY_PAID" });
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("produto", () => {
    it("rejeita produto inexistente com 404 PRODUCT_NOT_FOUND", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

      await expect(
        addOrderItem("order-1", item({ productId: "inexistente", quantity: 1 })),
      ).rejects.toMatchObject({ statusCode: 404, code: "PRODUCT_NOT_FOUND" });
    });

    it("rejeita produto inativo com 400 PRODUCT_NOT_AVAILABLE", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...unitProduct, active: false });

      await expect(
        addOrderItem("order-1", item({ productId: "product-unit", quantity: 1 })),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_NOT_AVAILABLE" });
    });

    it("rejeita produto indisponível com 400 PRODUCT_NOT_AVAILABLE", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue({
        ...unitProduct,
        available: false,
      });

      await expect(
        addOrderItem("order-1", item({ productId: "product-unit", quantity: 1 })),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_NOT_AVAILABLE" });
    });
  });

  describe("UNIT", () => {
    beforeEach(() => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(unitProduct);
    });

    it("cria item válido com preço/snapshot/total corretos", async () => {
      await addOrderItem("order-1", item({ productId: "product-unit", quantity: 2 }));

      expect(prisma.orderItem.create).toHaveBeenCalledWith({
        data: {
          orderId: "order-1",
          productId: "product-unit",
          productNameSnapshot: "Pão francês",
          saleType: "UNIT",
          basePriceCentsSnapshot: 500,
          requiresProductionSnapshot: false,
          quantity: 2,
          weightGrams: null,
          variationId: null,
          variationNameSnapshot: null,
          stationIdSnapshot: null,
          stationNameSnapshot: null,
          totalCents: 1000,
          observation: null,
          additionals: { create: [] },
        },
        include: { additionals: true },
      });
    });

    it("rejeita quantity ausente com ORDER_ITEM_INPUT_INVALID", async () => {
      await expect(
        addOrderItem("order-1", item({ productId: "product-unit" })),
      ).rejects.toMatchObject({ statusCode: 400, code: "ORDER_ITEM_INPUT_INVALID" });
    });

    it("rejeita weightGrams para produto UNIT", async () => {
      await expect(
        addOrderItem(
          "order-1",
          item({ productId: "product-unit", quantity: 1, weightGrams: 100 }),
        ),
      ).rejects.toMatchObject({ code: "ORDER_ITEM_INPUT_INVALID" });
    });

    it("rejeita variationId para produto UNIT", async () => {
      await expect(
        addOrderItem(
          "order-1",
          item({ productId: "product-unit", quantity: 1, variationId: "variation-1" }),
        ),
      ).rejects.toMatchObject({ code: "ORDER_ITEM_INPUT_INVALID" });
    });

    it("rejeita produto UNIT sem unitPriceCents com PRODUCT_CONFIGURATION_INVALID", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue({
        ...unitProduct,
        unitPriceCents: null,
      });

      await expect(
        addOrderItem("order-1", item({ productId: "product-unit", quantity: 1 })),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_CONFIGURATION_INVALID" });
    });
  });

  describe("VARIATION", () => {
    beforeEach(() => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(variationProduct);
      vi.mocked(prisma.productVariation.findUnique).mockResolvedValue(variationFixture);
    });

    it("cria item válido com snapshot de nome/preço e total corretos", async () => {
      await addOrderItem(
        "order-1",
        item({ productId: "product-variation", quantity: 2, variationId: "variation-1" }),
      );

      expect(prisma.orderItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          saleType: "VARIATION",
          basePriceCentsSnapshot: 800,
          variationId: "variation-1",
          variationNameSnapshot: "Grande",
          quantity: 2,
          weightGrams: null,
          totalCents: 1600,
          requiresProductionSnapshot: true,
          stationIdSnapshot: "station-1",
          stationNameSnapshot: "Confeitaria",
        }),
        include: { additionals: true },
      });
    });

    it("rejeita variationId ausente", async () => {
      await expect(
        addOrderItem("order-1", item({ productId: "product-variation", quantity: 1 })),
      ).rejects.toMatchObject({ code: "ORDER_ITEM_INPUT_INVALID" });
    });

    it("rejeita quantity ausente", async () => {
      await expect(
        addOrderItem(
          "order-1",
          item({ productId: "product-variation", variationId: "variation-1" }),
        ),
      ).rejects.toMatchObject({ code: "ORDER_ITEM_INPUT_INVALID" });
    });

    it("rejeita weightGrams para produto VARIATION", async () => {
      await expect(
        addOrderItem(
          "order-1",
          item({
            productId: "product-variation",
            quantity: 1,
            variationId: "variation-1",
            weightGrams: 100,
          }),
        ),
      ).rejects.toMatchObject({ code: "ORDER_ITEM_INPUT_INVALID" });
    });

    it("rejeita variação inexistente com 404 PRODUCT_VARIATION_NOT_FOUND", async () => {
      vi.mocked(prisma.productVariation.findUnique).mockResolvedValue(null);

      await expect(
        addOrderItem(
          "order-1",
          item({ productId: "product-variation", quantity: 1, variationId: "inexistente" }),
        ),
      ).rejects.toMatchObject({ statusCode: 404, code: "PRODUCT_VARIATION_NOT_FOUND" });
    });

    it("rejeita variação de outro produto com o mesmo 404 PRODUCT_VARIATION_NOT_FOUND", async () => {
      vi.mocked(prisma.productVariation.findUnique).mockResolvedValue({
        ...variationFixture,
        productId: "outro-produto",
      });

      await expect(
        addOrderItem(
          "order-1",
          item({ productId: "product-variation", quantity: 1, variationId: "variation-1" }),
        ),
      ).rejects.toMatchObject({ statusCode: 404, code: "PRODUCT_VARIATION_NOT_FOUND" });
    });
  });

  describe("WEIGHT", () => {
    beforeEach(() => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(weightProduct);
    });

    it("cria item válido com fórmula e arredondamento corretos", async () => {
      // 250g a R$40,00/kg (4000 centavos/kg): round(250 * 4000 / 1000) = 1000
      await addOrderItem("order-1", item({ productId: "product-weight", weightGrams: 250 }));

      expect(prisma.orderItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          saleType: "WEIGHT",
          basePriceCentsSnapshot: 4000,
          weightGrams: 250,
          quantity: null,
          totalCents: 1000,
        }),
        include: { additionals: true },
      });
    });

    it("arredonda corretamente pesos que gerariam centavos fracionários", async () => {
      // 333g a R$40,00/kg: 333*4000/1000 = 1332 (já inteiro, mas testa a
      // fórmula com um valor não redondo)
      await addOrderItem("order-1", item({ productId: "product-weight", weightGrams: 333 }));

      const call = vi.mocked(prisma.orderItem.create).mock.calls[0][0];
      expect(call.data.totalCents).toBe(Math.round((333 * 4000) / 1000));
    });

    it("rejeita weightGrams ausente", async () => {
      await expect(
        addOrderItem("order-1", item({ productId: "product-weight" })),
      ).rejects.toMatchObject({ code: "ORDER_ITEM_INPUT_INVALID" });
    });

    it("rejeita quantity para produto WEIGHT", async () => {
      await expect(
        addOrderItem(
          "order-1",
          item({ productId: "product-weight", weightGrams: 100, quantity: 1 }),
        ),
      ).rejects.toMatchObject({ code: "ORDER_ITEM_INPUT_INVALID" });
    });

    it("rejeita variationId para produto WEIGHT", async () => {
      await expect(
        addOrderItem(
          "order-1",
          item({ productId: "product-weight", weightGrams: 100, variationId: "variation-1" }),
        ),
      ).rejects.toMatchObject({ code: "ORDER_ITEM_INPUT_INVALID" });
    });

    it("rejeita produto WEIGHT sem pricePerKgCents com PRODUCT_CONFIGURATION_INVALID", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue({
        ...weightProduct,
        pricePerKgCents: null,
      });

      await expect(
        addOrderItem("order-1", item({ productId: "product-weight", weightGrams: 100 })),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_CONFIGURATION_INVALID" });
    });
  });

  describe("adicionais", () => {
    beforeEach(() => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(unitProduct);
    });

    it("cria item sem nenhum adicional", async () => {
      await addOrderItem("order-1", item({ productId: "product-unit", quantity: 1 }));

      const call = vi.mocked(prisma.orderItem.create).mock.calls[0][0];
      expect(call.data.additionals).toEqual({ create: [] });
      expect(call.data.totalCents).toBe(500);
    });

    it("cria item com um adicional, somando ao total", async () => {
      vi.mocked(prisma.additional.findUnique).mockResolvedValue(additionalFixture);

      await addOrderItem(
        "order-1",
        item({
          productId: "product-unit",
          quantity: 1,
          additionals: [{ additionalId: "additional-1", quantity: 1 }],
        }),
      );

      expect(prisma.orderItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          totalCents: 650, // 500 + 150
          additionals: {
            create: [
              {
                additionalId: "additional-1",
                nameSnapshot: "Manteiga",
                priceCentsSnapshot: 150,
                quantity: 1,
              },
            ],
          },
        }),
        include: { additionals: true },
      });
    });

    it("cria item com múltiplos adicionais e quantity > 1", async () => {
      vi.mocked(prisma.additional.findUnique)
        .mockResolvedValueOnce(additionalFixture)
        .mockResolvedValueOnce({
          ...additionalFixture,
          id: "additional-2",
          name: "Chocolate",
          priceCents: 200,
        });

      await addOrderItem(
        "order-1",
        item({
          productId: "product-unit",
          quantity: 1,
          additionals: [
            { additionalId: "additional-1", quantity: 2 },
            { additionalId: "additional-2", quantity: 3 },
          ],
        }),
      );

      const call = vi.mocked(prisma.orderItem.create).mock.calls[0][0];
      // base 500 + (150*2) + (200*3) = 500 + 300 + 600 = 1400
      expect(call.data.totalCents).toBe(1400);
    });

    it("rejeita adicional inexistente com 404 ADDITIONAL_NOT_FOUND", async () => {
      vi.mocked(prisma.additional.findUnique).mockResolvedValue(null);

      await expect(
        addOrderItem(
          "order-1",
          item({
            productId: "product-unit",
            quantity: 1,
            additionals: [{ additionalId: "inexistente", quantity: 1 }],
          }),
        ),
      ).rejects.toMatchObject({ statusCode: 404, code: "ADDITIONAL_NOT_FOUND" });
    });

    it("rejeita adicional inativo com 400 ADDITIONAL_NOT_AVAILABLE", async () => {
      vi.mocked(prisma.additional.findUnique).mockResolvedValue(inactiveAdditionalFixture);

      await expect(
        addOrderItem(
          "order-1",
          item({
            productId: "product-unit",
            quantity: 1,
            additionals: [{ additionalId: "additional-2", quantity: 1 }],
          }),
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: "ADDITIONAL_NOT_AVAILABLE" });
    });
  });

  describe("snapshots", () => {
    it("congela nome do produto, saleType e requiresProduction", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(unitProduct);

      await addOrderItem("order-1", item({ productId: "product-unit", quantity: 1 }));

      expect(prisma.orderItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productNameSnapshot: "Pão francês",
          saleType: "UNIT",
          requiresProductionSnapshot: false,
        }),
        include: { additionals: true },
      });
    });

    it("congela id/nome da estação quando o produto tem estação", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(variationProduct);
      vi.mocked(prisma.productVariation.findUnique).mockResolvedValue(variationFixture);

      await addOrderItem(
        "order-1",
        item({ productId: "product-variation", quantity: 1, variationId: "variation-1" }),
      );

      expect(prisma.orderItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stationIdSnapshot: "station-1",
          stationNameSnapshot: "Confeitaria",
        }),
        include: { additionals: true },
      });
    });

    it("não congela estação quando o produto não tem uma", async () => {
      vi.mocked(prisma.product.findUnique).mockResolvedValue(unitProduct);

      await addOrderItem("order-1", item({ productId: "product-unit", quantity: 1 }));

      expect(prisma.orderItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stationIdSnapshot: null,
          stationNameSnapshot: null,
        }),
        include: { additionals: true },
      });
    });
  });

  describe("roteamento para estação", () => {
    it("produto sem produção nunca roteia, mesmo com stationId residual/inconsistente", async () => {
      const productWithResidualStation = {
        ...unitProduct,
        requiresProduction: false,
        stationId: "station-residual",
        station: { id: "station-residual", name: "Estação antiga", active: true },
      };

      vi.mocked(prisma.product.findUnique).mockResolvedValue(productWithResidualStation);

      await addOrderItem("order-1", item({ productId: "product-unit", quantity: 1 }));

      expect(prisma.orderItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requiresProductionSnapshot: false,
          stationIdSnapshot: null,
          stationNameSnapshot: null,
        }),
        include: { additionals: true },
      });
    });

    it("produto com produção e estação ativa roteia com id/nome corretos", async () => {
      const productWithActiveStation = {
        ...unitProduct,
        requiresProduction: true,
        stationId: "station-1",
        station: { id: "station-1", name: "Confeitaria", active: true },
      };

      vi.mocked(prisma.product.findUnique).mockResolvedValue(productWithActiveStation);

      await addOrderItem("order-1", item({ productId: "product-unit", quantity: 1 }));

      expect(prisma.orderItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requiresProductionSnapshot: true,
          stationIdSnapshot: "station-1",
          stationNameSnapshot: "Confeitaria",
        }),
        include: { additionals: true },
      });
    });

    it("rejeita com 400 PRODUCT_ROUTING_INVALID quando requiresProduction=true sem stationId", async () => {
      const productWithoutStation = {
        ...unitProduct,
        requiresProduction: true,
        stationId: null,
        station: null,
      };

      vi.mocked(prisma.product.findUnique).mockResolvedValue(productWithoutStation);

      await expect(
        addOrderItem("order-1", item({ productId: "product-unit", quantity: 1 })),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_ROUTING_INVALID" });
      expect(prisma.orderItem.create).not.toHaveBeenCalled();
    });

    it("rejeita com 400 PRODUCT_ROUTING_INVALID quando a relação station não existe (stationId órfão)", async () => {
      const productWithOrphanStation = {
        ...unitProduct,
        requiresProduction: true,
        stationId: "station-fantasma",
        station: null,
      };

      vi.mocked(prisma.product.findUnique).mockResolvedValue(productWithOrphanStation);

      await expect(
        addOrderItem("order-1", item({ productId: "product-unit", quantity: 1 })),
      ).rejects.toMatchObject({ statusCode: 400, code: "PRODUCT_ROUTING_INVALID" });
      expect(prisma.orderItem.create).not.toHaveBeenCalled();
    });

    it("rejeita com 400 STATION_NOT_AVAILABLE quando a estação configurada está inativa", async () => {
      const productWithInactiveStation = {
        ...unitProduct,
        requiresProduction: true,
        stationId: "station-2",
        station: { id: "station-2", name: "Confeitaria", active: false },
      };

      vi.mocked(prisma.product.findUnique).mockResolvedValue(productWithInactiveStation);

      await expect(
        addOrderItem("order-1", item({ productId: "product-unit", quantity: 1 })),
      ).rejects.toMatchObject({ statusCode: 400, code: "STATION_NOT_AVAILABLE" });
      expect(prisma.orderItem.create).not.toHaveBeenCalled();
    });
  });
});
