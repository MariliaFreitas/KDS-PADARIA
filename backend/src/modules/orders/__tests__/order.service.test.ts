import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    order: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../../../lib/prisma.js";
import { createOrder, getOrderById } from "../order.service.js";

// Fixture com todos os campos reais do model Order — os de pagamento,
// cancelamento e entrega começam nulos, conforme o cabeçalho recém-criado
// (Etapa 8 não implementa nenhuma dessas funcionalidades ainda).
const baseOrder = {
  id: "order-1",
  orderNumber: 154,
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

describe("order.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createOrder", () => {
    it("cria o cabeçalho do pedido com os dados informados e o usuário autenticado", async () => {
      vi.mocked(prisma.order.create).mockResolvedValue(baseOrder);

      const result = await createOrder(
        {
          customerName: "Maria",
          channel: "BALCAO",
          consumptionType: "LOCAL",
          pickupTime: null,
        },
        "user-1",
      );

      expect(prisma.order.create).toHaveBeenCalledWith({
        data: {
          customerName: "Maria",
          channel: "BALCAO",
          consumptionType: "LOCAL",
          pickupTime: null,
          createdByUserId: "user-1",
        },
      });
      expect(result).toEqual(baseOrder);
    });

    it("não envia orderNumber, paymentStatus ou createdAt ao Prisma", async () => {
      vi.mocked(prisma.order.create).mockResolvedValue(baseOrder);

      await createOrder(
        { customerName: "João", channel: "WHATSAPP", consumptionType: "VIAGEM", pickupTime: null },
        "user-2",
      );

      const call = vi.mocked(prisma.order.create).mock.calls[0][0];
      expect(call.data).not.toHaveProperty("orderNumber");
      expect(call.data).not.toHaveProperty("paymentStatus");
      expect(call.data).not.toHaveProperty("createdAt");
      expect(call.data).not.toHaveProperty("id");
    });

    it("repassa o horário de retirada quando informado", async () => {
      const pickupTime = new Date("2026-02-01T18:00:00.000Z");
      vi.mocked(prisma.order.create).mockResolvedValue({ ...baseOrder, pickupTime });

      await createOrder(
        {
          customerName: "Ana",
          channel: "WHATSAPP",
          consumptionType: "LOCAL",
          pickupTime,
        },
        "user-1",
      );

      expect(prisma.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ pickupTime }),
      });
    });
  });

  describe("getOrderById", () => {
    it("retorna o pedido sem itens (pedido novo, antes da Etapa 9 adicionar algum)", async () => {
      const orderWithItems = { ...baseOrder, items: [] };
      vi.mocked(prisma.order.findUnique).mockResolvedValue(orderWithItems);

      const result = await getOrderById("order-1");

      expect(prisma.order.findUnique).toHaveBeenCalledWith({
        where: { id: "order-1" },
        include: {
          items: {
            orderBy: { includedAt: "asc" },
            include: { additionals: true },
          },
        },
      });
      expect(result.items).toEqual([]);
    });

    it("retorna os itens reais ordenados por includedAt, cada um com seus additionals", async () => {
      const item1 = {
        id: "item-1",
        orderId: "order-1",
        productId: "product-1",
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
        includedAt: new Date("2026-01-01T10:00:00.000Z"),
        additionals: [
          {
            id: "add-1",
            orderItemId: "item-1",
            additionalId: "additional-1",
            nameSnapshot: "Manteiga",
            priceCentsSnapshot: 150,
            quantity: 1,
          },
        ],
      };
      const orderWithItems = { ...baseOrder, items: [item1] };
      vi.mocked(prisma.order.findUnique).mockResolvedValue(orderWithItems);

      const result = await getOrderById("order-1");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].additionals).toHaveLength(1);
      expect(result.items[0].additionals[0].nameSnapshot).toBe("Manteiga");
    });

    it("rejeita pedido inexistente com 404 ORDER_NOT_FOUND", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

      await expect(getOrderById("inexistente")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    });
  });
});
