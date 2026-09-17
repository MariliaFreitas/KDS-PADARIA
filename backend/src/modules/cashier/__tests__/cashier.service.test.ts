import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    serviceNumberSlot: {
      update: vi.fn(),
    },
    orderHistory: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("../../realtime/realtime.service.js", () => ({
  publishRealtimeEvent: vi.fn(),
}));

import { prisma } from "../../../lib/prisma.js";
import { confirmPayment, listOpenOrders } from "../cashier.service.js";
import { publishRealtimeEvent } from "../../realtime/realtime.service.js";

interface AdditionalFixture {
  id: string;
  orderItemId: string;
  additionalId: string;
  nameSnapshot: string;
  priceCentsSnapshot: number;
  quantity: number;
}

function additional(overrides: Partial<AdditionalFixture> & { id: string }): AdditionalFixture {
  return {
    orderItemId: "item-1",
    additionalId: "additional-1",
    nameSnapshot: "Queijo extra",
    priceCentsSnapshot: 200,
    quantity: 1,
    ...overrides,
  };
}

interface ItemFixture {
  id: string;
  orderId: string;
  productId: string;
  productNameSnapshot: string;
  saleType: "UNIT" | "VARIATION" | "WEIGHT";
  basePriceCentsSnapshot: number;
  requiresProductionSnapshot: boolean;
  quantity: number | null;
  weightGrams: number | null;
  variationId: string | null;
  variationNameSnapshot: string | null;
  stationIdSnapshot: string | null;
  stationNameSnapshot: string | null;
  status: "PENDENTE" | "EM_PREPARO" | "PRONTO" | "CANCELADO";
  totalCents: number;
  observation: string | null;
  includedAt: Date;
  additionals: AdditionalFixture[];
}

function item(overrides: Partial<ItemFixture> & { id: string; totalCents: number }): ItemFixture {
  return {
    orderId: "order-1",
    productId: "product-1",
    productNameSnapshot: "Pão francês",
    saleType: "UNIT",
    basePriceCentsSnapshot: overrides.totalCents,
    requiresProductionSnapshot: false,
    quantity: 1,
    weightGrams: null,
    variationId: null,
    variationNameSnapshot: null,
    stationIdSnapshot: null,
    stationNameSnapshot: null,
    status: "PENDENTE",
    observation: null,
    includedAt: new Date("2026-01-01T10:00:00.000Z"),
    additionals: [],
    ...overrides,
  };
}

interface OrderFixture {
  id: string;
  orderNumber: number;
  serviceNumber: number;
  customerName: string;
  channel: "BALCAO" | "WHATSAPP";
  consumptionType: "LOCAL" | "VIAGEM";
  pickupTime: Date | null;
  paymentStatus: "PENDENTE" | "PAGO";
  paidAt: Date | null;
  paidByUserId: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelledByUserId: string | null;
  deliveredAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  items: ItemFixture[];
}

function order(overrides: Partial<OrderFixture> & { id: string }): OrderFixture {
  return {
    orderNumber: 100,
    serviceNumber: 7,
    customerName: "Maria",
    channel: "BALCAO",
    consumptionType: "LOCAL",
    pickupTime: null,
    paymentStatus: "PENDENTE",
    paidAt: null,
    paidByUserId: null,
    cancelledAt: null,
    cancelReason: null,
    cancelledByUserId: null,
    deliveredAt: null,
    createdByUserId: "atendente-1",
    createdAt: new Date("2026-01-01T09:00:00.000Z"),
    items: [],
    ...overrides,
  };
}

describe("cashier.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      Promise.resolve(callback(prisma)),
    );
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: "order-1" }]);
    vi.mocked(prisma.orderHistory.create).mockResolvedValue({
      id: "history-1",
      orderId: "order-1",
      orderItemId: null,
      action: "PAYMENT_CONFIRMED",
      previousState: "PENDENTE",
      newState: "PAGO",
      reason: null,
      userId: "caixa-1",
      createdAt: new Date("2026-01-05T12:00:00.000Z"),
    });
  });

  describe("listOpenOrders", () => {
    it("consulta só pedidos com paymentStatus=PENDENTE e não cancelados, ordenados por createdAt asc", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await listOpenOrders();

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: { paymentStatus: "PENDENTE", cancelledAt: null },
        orderBy: { createdAt: "asc" },
        include: { items: { include: { additionals: true } } },
      });
    });

    it("soma só os itens não cancelados no totalCents", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([
        order({
          id: "order-1",
          items: [
            item({ id: "item-1", totalCents: 1000, status: "PENDENTE" }),
            item({ id: "item-2", totalCents: 500, status: "CANCELADO" }),
            item({ id: "item-3", totalCents: 300, status: "PRONTO" }),
          ],
        }),
      ]);

      const result = await listOpenOrders();

      expect(result).toHaveLength(1);
      expect(result[0].totalCents).toBe(1300);
    });

    it("expõe serviceNumber, não orderNumber, no resultado", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([
        order({ id: "order-1", serviceNumber: 42, orderNumber: 999 }),
      ]);

      const result = await listOpenOrders();

      expect(result[0]).toEqual({
        id: "order-1",
        serviceNumber: 42,
        customerName: "Maria",
        channel: "BALCAO",
        consumptionType: "LOCAL",
        createdAt: new Date("2026-01-01T09:00:00.000Z"),
        items: [],
        totalCents: 0,
      });
      expect(result[0]).not.toHaveProperty("orderNumber");
    });

    it("retorna o resumo dos itens cobráveis: nome, quantidade, variação e adicionais", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([
        order({
          id: "order-1",
          items: [
            item({
              id: "item-1",
              totalCents: 1200,
              productNameSnapshot: "Coxinha",
              quantity: 2,
              additionals: [additional({ id: "add-1", nameSnapshot: "Catupiry", quantity: 1 })],
            }),
            item({
              id: "item-2",
              totalCents: 800,
              productNameSnapshot: "Suco",
              saleType: "VARIATION",
              quantity: 1,
              variationNameSnapshot: "Laranja",
            }),
          ],
        }),
      ]);

      const result = await listOpenOrders();

      expect(result[0].items).toEqual([
        {
          id: "item-1",
          productNameSnapshot: "Coxinha",
          quantity: 2,
          weightGrams: null,
          variationNameSnapshot: null,
          additionals: [{ nameSnapshot: "Catupiry", quantity: 1 }],
        },
        {
          id: "item-2",
          productNameSnapshot: "Suco",
          quantity: 1,
          weightGrams: null,
          variationNameSnapshot: "Laranja",
          additionals: [],
        },
      ]);
    });

    it("exclui item CANCELADO do resumo de itens, não só do total", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([
        order({
          id: "order-1",
          items: [
            item({ id: "item-1", totalCents: 1000, status: "PENDENTE" }),
            item({ id: "item-2", totalCents: 500, status: "CANCELADO", productNameSnapshot: "Café" }),
          ],
        }),
      ]);

      const result = await listOpenOrders();

      expect(result[0].items).toHaveLength(1);
      expect(result[0].items.map((cashierItem) => cashierItem.id)).toEqual(["item-1"]);
    });

    it("busca por número operacional exato quando o texto é um inteiro", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await listOpenOrders("42");

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ serviceNumber: 42 }]),
          }),
        }),
      );
    });

    it('busca por "27" encontra o pedido pelo número operacional', async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await listOpenOrders("27");

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ serviceNumber: 27 }]),
          }),
        }),
      );
    });

    it('busca por "#27" normaliza o # antes de interpretar como número operacional', async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await listOpenOrders("#27");

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ serviceNumber: 27 }]),
          }),
        }),
      );
    });

    it("busca por nome do cliente (substring, sem diferenciar caixa) quando o texto não é um inteiro", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await listOpenOrders("mar");

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ customerName: { contains: "mar", mode: "insensitive" } }],
          }),
        }),
      );
    });

    it("ignora busca vazia ou só espaços", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await listOpenOrders("   ");

      const call = vi.mocked(prisma.order.findMany).mock.calls[0]?.[0];

      if (!call) {
        throw new Error("order.findMany não foi chamado");
      }

      expect(call.where).not.toHaveProperty("OR");
    });
  });

  describe("confirmPayment", () => {
    it("rejeita pedido inexistente com 404 ORDER_NOT_FOUND", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

      await expect(confirmPayment("inexistente", "caixa-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    });

    it("rejeita pedido cancelado com 409 ORDER_CANCELLED", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          cancelledAt: new Date("2026-01-02T00:00:00.000Z"),
          items: [item({ id: "item-1", totalCents: 1000 })],
        }),
      );

      await expect(confirmPayment("order-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_CANCELLED",
      });
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it("rejeita pedido já pago com 409 PAYMENT_ALREADY_CONFIRMED", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          paymentStatus: "PAGO",
          paidAt: new Date("2026-01-02T00:00:00.000Z"),
          items: [item({ id: "item-1", totalCents: 1000 })],
        }),
      );

      await expect(confirmPayment("order-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "PAYMENT_ALREADY_CONFIRMED",
      });
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it("rejeita pedido sem nenhum item cobrável com 409 PAYMENT_NOTHING_TO_CHARGE", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [item({ id: "item-1", totalCents: 1000, status: "CANCELADO" })],
        }),
      );

      await expect(confirmPayment("order-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "PAYMENT_NOTHING_TO_CHARGE",
      });
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it("rejeita pedido sem nenhum item com 409 PAYMENT_NOTHING_TO_CHARGE", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(order({ id: "order-1", items: [] }));

      await expect(confirmPayment("order-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "PAYMENT_NOTHING_TO_CHARGE",
      });
    });

    it("confirma o pagamento: total recalculado no servidor, paymentStatus/paidAt/paidByUserId corretos", async () => {
      const pendingOrder = order({
        id: "order-1",
        items: [
          item({ id: "item-1", totalCents: 1000, status: "PRONTO" }),
          item({ id: "item-2", totalCents: 500, status: "CANCELADO" }),
        ],
      });
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(pendingOrder).mockResolvedValueOnce({
        ...pendingOrder,
        paymentStatus: "PAGO",
        paidAt: new Date("2026-01-05T12:00:00.000Z"),
        paidByUserId: "caixa-1",
      });
      vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.serviceNumberSlot.update).mockResolvedValue({
        id: "slot-1",
        number: 7,
        orderId: "order-1",
        reusableAt: new Date(),
      });

      const result = await confirmPayment("order-1", "caixa-1");

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: "order-1", paymentStatus: "PENDENTE", cancelledAt: null },
        data: {
          paymentStatus: "PAGO",
          paidAt: expect.any(Date),
          paidByUserId: "caixa-1",
        },
      });
      expect(result.paymentStatus).toBe("PAGO");
      expect(result.paidByUserId).toBe("caixa-1");
    });

    it("registra PAYMENT_CONFIRMED no histórico depois de reivindicar a confirmação (Etapa 15)", async () => {
      const pendingOrder = order({
        id: "order-1",
        items: [item({ id: "item-1", totalCents: 1000, status: "PRONTO" })],
      });
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(pendingOrder).mockResolvedValueOnce({
        ...pendingOrder,
        paymentStatus: "PAGO",
        paidAt: new Date("2026-01-05T12:00:00.000Z"),
        paidByUserId: "caixa-1",
      });
      vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.serviceNumberSlot.update).mockResolvedValue({
        id: "slot-1",
        number: 7,
        orderId: "order-1",
        reusableAt: new Date(),
      });

      await confirmPayment("order-1", "caixa-1");

      expect(prisma.orderHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: "order-1",
          orderItemId: null,
          action: "PAYMENT_CONFIRMED",
          previousState: "PENDENTE",
          newState: "PAGO",
          userId: "caixa-1",
        },
      });
      expect(prisma.orderHistory.create).toHaveBeenCalledTimes(1);
    });

    it("não registra um segundo PAYMENT_CONFIRMED quando a confirmação já havia acontecido (dupla confirmação)", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          paymentStatus: "PAGO",
          paidAt: new Date("2026-01-02T00:00:00.000Z"),
          items: [item({ id: "item-1", totalCents: 1000 })],
        }),
      );

      await expect(confirmPayment("order-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "PAYMENT_ALREADY_CONFIRMED",
      });
      expect(prisma.orderHistory.create).not.toHaveBeenCalled();
    });

    it("ignora itens PENDENTE/EM_PREPARO/PRONTO igualmente no total — só CANCELADO é excluído", async () => {
      const pendingOrder = order({
        id: "order-1",
        items: [
          item({ id: "item-1", totalCents: 400, status: "PENDENTE" }),
          item({ id: "item-2", totalCents: 600, status: "EM_PREPARO" }),
          item({ id: "item-3", totalCents: 200, status: "PRONTO" }),
        ],
      });
      vi.mocked(prisma.order.findUnique)
        .mockResolvedValueOnce(pendingOrder)
        .mockResolvedValueOnce({ ...pendingOrder, paymentStatus: "PAGO" });
      vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.serviceNumberSlot.update).mockResolvedValue({
        id: "slot-1",
        number: 7,
        orderId: "order-1",
        reusableAt: new Date(),
      });

      await confirmPayment("order-1", "caixa-1");

      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "order-1", paymentStatus: "PENDENTE", cancelledAt: null } }),
      );
    });

    it("agenda a liberação do número operacional para 7h depois de paidAt", async () => {
      const pendingOrder = order({
        id: "order-1",
        items: [item({ id: "item-1", totalCents: 1000, status: "PRONTO" })],
      });
      vi.mocked(prisma.order.findUnique)
        .mockResolvedValueOnce(pendingOrder)
        .mockResolvedValueOnce({ ...pendingOrder, paymentStatus: "PAGO" });
      vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.serviceNumberSlot.update).mockResolvedValue({
        id: "slot-1",
        number: 7,
        orderId: "order-1",
        reusableAt: new Date(),
      });

      await confirmPayment("order-1", "caixa-1");

      expect(prisma.serviceNumberSlot.update).toHaveBeenCalledWith({
        where: { orderId: "order-1" },
        data: { reusableAt: expect.any(Date) },
      });
      const call = vi.mocked(prisma.serviceNumberSlot.update).mock.calls[0][0];
      const updateManyCall = vi.mocked(prisma.order.updateMany).mock.calls[0][0];
      const paidAt = updateManyCall.data.paidAt as Date;
      expect((call.data.reusableAt as Date).getTime() - paidAt.getTime()).toBe(7 * 60 * 60 * 1000);
    });

    it("rejeita com 409 PAYMENT_ALREADY_CONFIRMED quando perde a corrida para outra confirmação concorrente", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [item({ id: "item-1", totalCents: 1000, status: "PRONTO" })],
        }),
      );
      // Outra transação concorrente já fechou o pedido entre a leitura e
      // a atualização — o updateMany condicional não encontra mais o
      // paymentStatus=PENDENTE esperado.
      vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });

      await expect(confirmPayment("order-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "PAYMENT_ALREADY_CONFIRMED",
      });
      expect(prisma.serviceNumberSlot.update).not.toHaveBeenCalled();
      expect(prisma.orderHistory.create).not.toHaveBeenCalled();
    });

    describe("eventos de tempo real", () => {
      beforeEach(() => {
        vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(prisma.serviceNumberSlot.update).mockResolvedValue({
          id: "slot-1",
          number: 7,
          orderId: "order-1",
          reusableAt: new Date(),
        });
      });

      it("publica cashier+orders+delivery depois que o pagamento é confirmado", async () => {
        const pendingOrder = order({
          id: "order-1",
          items: [item({ id: "item-1", totalCents: 1000, status: "PRONTO" })],
        });
        vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(pendingOrder).mockResolvedValueOnce({
          ...pendingOrder,
          paymentStatus: "PAGO",
          paidAt: new Date("2026-01-05T12:00:00.000Z"),
          paidByUserId: "caixa-1",
        });

        await confirmPayment("order-1", "caixa-1");

        expect(publishRealtimeEvent).toHaveBeenCalledTimes(1);
        expect(publishRealtimeEvent).toHaveBeenCalledWith({
          scopes: ["cashier", "orders", "delivery"],
          orderId: "order-1",
        });
      });

      it("publica production ao confirmar pagamento de um pedido WHATSAPP+VIAGEM com item de produção travado", async () => {
        const pendingOrder = order({
          id: "order-1",
          channel: "WHATSAPP",
          consumptionType: "VIAGEM",
          items: [
            item({
              id: "item-1",
              totalCents: 1000,
              status: "PENDENTE",
              requiresProductionSnapshot: true,
            }),
          ],
        });
        vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(pendingOrder).mockResolvedValueOnce({
          ...pendingOrder,
          paymentStatus: "PAGO",
          paidAt: new Date("2026-01-05T12:00:00.000Z"),
          paidByUserId: "caixa-1",
        });

        await confirmPayment("order-1", "caixa-1");

        expect(publishRealtimeEvent).toHaveBeenCalledWith({
          scopes: ["cashier", "orders", "delivery", "production"],
          orderId: "order-1",
        });
      });

      it("não publica production para WHATSAPP+VIAGEM sem nenhum item de produção pendente", async () => {
        const pendingOrder = order({
          id: "order-1",
          channel: "WHATSAPP",
          consumptionType: "VIAGEM",
          items: [item({ id: "item-1", totalCents: 1000, status: "PENDENTE", requiresProductionSnapshot: false })],
        });
        vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(pendingOrder).mockResolvedValueOnce({
          ...pendingOrder,
          paymentStatus: "PAGO",
        });

        await confirmPayment("order-1", "caixa-1");

        expect(publishRealtimeEvent).toHaveBeenCalledWith({
          scopes: ["cashier", "orders", "delivery"],
          orderId: "order-1",
        });
      });

      it("não publica production para BALCAO+VIAGEM (a trava de pagamento só existe pra WHATSAPP+VIAGEM)", async () => {
        const pendingOrder = order({
          id: "order-1",
          channel: "BALCAO",
          consumptionType: "VIAGEM",
          items: [
            item({
              id: "item-1",
              totalCents: 1000,
              status: "PENDENTE",
              requiresProductionSnapshot: true,
            }),
          ],
        });
        vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(pendingOrder).mockResolvedValueOnce({
          ...pendingOrder,
          paymentStatus: "PAGO",
        });

        await confirmPayment("order-1", "caixa-1");

        expect(publishRealtimeEvent).toHaveBeenCalledWith({
          scopes: ["cashier", "orders", "delivery"],
          orderId: "order-1",
        });
      });

      it("não publica nada quando a confirmação é rejeitada (pedido já pago)", async () => {
        vi.mocked(prisma.order.findUnique).mockResolvedValue(
          order({
            id: "order-1",
            paymentStatus: "PAGO",
            paidAt: new Date("2026-01-02T00:00:00.000Z"),
            items: [item({ id: "item-1", totalCents: 1000 })],
          }),
        );

        await expect(confirmPayment("order-1", "caixa-1")).rejects.toMatchObject({
          code: "PAYMENT_ALREADY_CONFIRMED",
        });

        expect(publishRealtimeEvent).not.toHaveBeenCalled();
      });

      it("não publica nada quando perde a corrida da confirmação condicional", async () => {
        vi.mocked(prisma.order.findUnique).mockResolvedValue(
          order({
            id: "order-1",
            items: [item({ id: "item-1", totalCents: 1000, status: "PRONTO" })],
          }),
        );
        vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });

        await expect(confirmPayment("order-1", "caixa-1")).rejects.toMatchObject({
          code: "PAYMENT_ALREADY_CONFIRMED",
        });

        expect(publishRealtimeEvent).not.toHaveBeenCalled();
      });
    });
  });
});
