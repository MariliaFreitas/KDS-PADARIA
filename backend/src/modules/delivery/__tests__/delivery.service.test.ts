import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    orderItem: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    orderHistory: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "../../../lib/prisma.js";
import { deliverItem, listPendingDeliveryOrders } from "../delivery.service.js";

type ItemStatus = "PENDENTE" | "EM_PREPARO" | "PRONTO" | "CANCELADO";

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
  status: ItemStatus;
  totalCents: number;
  observation: string | null;
  includedAt: Date;
  deliveredAt: Date | null;
  additionals: AdditionalFixture[];
}

function item(overrides: Partial<ItemFixture> & { id: string }): ItemFixture {
  return {
    orderId: "order-1",
    productId: "product-1",
    productNameSnapshot: "Pão francês",
    saleType: "UNIT",
    basePriceCentsSnapshot: 500,
    requiresProductionSnapshot: false,
    quantity: 1,
    weightGrams: null,
    variationId: null,
    variationNameSnapshot: null,
    stationIdSnapshot: null,
    stationNameSnapshot: null,
    status: "PENDENTE",
    totalCents: 500,
    observation: null,
    includedAt: new Date("2026-01-01T10:00:00.000Z"),
    deliveredAt: null,
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

describe("delivery.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      Promise.resolve(callback(prisma)),
    );
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: "order-1" }]);
    vi.mocked(prisma.orderItem.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.orderHistory.create).mockResolvedValue({
      id: "history-1",
      orderId: "order-1",
      orderItemId: "item-1",
      action: "ITEM_DELIVERED",
      previousState: null,
      newState: "ENTREGUE",
      reason: null,
      userId: "caixa-1",
      createdAt: new Date(),
    });
  });

  describe("listPendingDeliveryOrders", () => {
    it("consulta pedidos não cancelados, ainda não concluídos, com ao menos um item válido não entregue", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await listPendingDeliveryOrders();

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: {
          cancelledAt: null,
          deliveredAt: null,
          items: { some: { status: { not: "CANCELADO" }, deliveredAt: null } },
        },
        orderBy: { createdAt: "asc" },
        include: { items: { orderBy: { includedAt: "asc" }, include: { additionals: true } } },
      });
    });

    it("expõe serviceNumber (não orderNumber), situação de pagamento e canal/consumo", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([
        order({ id: "order-1", serviceNumber: 27, orderNumber: 999, paymentStatus: "PAGO" }),
      ]);

      const result = await listPendingDeliveryOrders();

      expect(result[0]).toEqual({
        id: "order-1",
        serviceNumber: 27,
        customerName: "Maria",
        channel: "BALCAO",
        consumptionType: "LOCAL",
        paymentStatus: "PAGO",
        createdAt: new Date("2026-01-01T09:00:00.000Z"),
        items: [],
      });
      expect(result[0]).not.toHaveProperty("orderNumber");
    });

    it("inclui item CANCELADO na lista de itens, marcado com seu status — não some da resposta", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([
        order({
          id: "order-1",
          items: [
            item({ id: "item-1", status: "PENDENTE" }),
            item({ id: "item-2", status: "CANCELADO", productNameSnapshot: "Café" }),
          ],
        }),
      ]);

      const result = await listPendingDeliveryOrders();

      expect(result[0].items).toHaveLength(2);
      expect(result[0].items.find((i) => i.id === "item-2")).toMatchObject({
        status: "CANCELADO",
        productNameSnapshot: "Café",
      });
    });

    it("expõe requiresProductionSnapshot e deliveredAt por item, para a tela decidir o que habilitar", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([
        order({
          id: "order-1",
          items: [
            item({
              id: "item-1",
              requiresProductionSnapshot: true,
              status: "PRONTO",
              deliveredAt: null,
              additionals: [additional({ id: "add-1" })],
            }),
          ],
        }),
      ]);

      const result = await listPendingDeliveryOrders();

      expect(result[0].items[0]).toMatchObject({
        requiresProductionSnapshot: true,
        status: "PRONTO",
        deliveredAt: null,
        additionals: [{ nameSnapshot: "Queijo extra", quantity: 1 }],
      });
    });

    it('busca por "#27" normaliza o # e interpreta como número operacional', async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await listPendingDeliveryOrders("#27");

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.arrayContaining([{ serviceNumber: 27 }]) }),
        }),
      );
    });

    it("busca por nome do cliente (substring, sem diferenciar caixa) quando o texto não é um inteiro", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await listPendingDeliveryOrders("mar");

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ customerName: { contains: "mar", mode: "insensitive" } }],
          }),
        }),
      );
    });
  });

  describe("deliverItem", () => {
    it("rejeita pedido inexistente com 404 ORDER_NOT_FOUND", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

      await expect(deliverItem("inexistente", "item-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    });

    it("rejeita pedido cancelado com 409 ORDER_CANCELLED", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          cancelledAt: new Date("2026-01-02T00:00:00.000Z"),
          items: [item({ id: "item-1" })],
        }),
      );

      await expect(deliverItem("order-1", "item-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_CANCELLED",
      });
      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it("rejeita item inexistente neste pedido com 404 ORDER_ITEM_NOT_FOUND", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({ id: "order-1", items: [item({ id: "item-1" })] }),
      );

      await expect(deliverItem("order-1", "inexistente", "caixa-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_ITEM_NOT_FOUND",
      });
    });

    it("rejeita item CANCELADO com 409 ORDER_ITEM_CANCELLED", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({ id: "order-1", items: [item({ id: "item-1", status: "CANCELADO" })] }),
      );

      await expect(deliverItem("order-1", "item-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_CANCELLED",
      });
      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it("rejeita item já entregue com 409 ORDER_ITEM_ALREADY_DELIVERED, de forma determinística", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [
            item({ id: "item-1", status: "PENDENTE", deliveredAt: new Date("2026-01-02T00:00:00.000Z") }),
          ],
        }),
      );

      await expect(deliverItem("order-1", "item-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_ALREADY_DELIVERED",
      });
      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it("item de produção PENDENTE não entrega — 409 ORDER_ITEM_NOT_READY_FOR_DELIVERY", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [item({ id: "item-1", requiresProductionSnapshot: true, status: "PENDENTE" })],
        }),
      );

      await expect(deliverItem("order-1", "item-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_NOT_READY_FOR_DELIVERY",
      });
      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it("item de produção EM_PREPARO não entrega — 409 ORDER_ITEM_NOT_READY_FOR_DELIVERY", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [item({ id: "item-1", requiresProductionSnapshot: true, status: "EM_PREPARO" })],
        }),
      );

      await expect(deliverItem("order-1", "item-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_NOT_READY_FOR_DELIVERY",
      });
      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it("item de produção PRONTO entrega normalmente", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [item({ id: "item-1", requiresProductionSnapshot: true, status: "PRONTO" })],
        }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", requiresProductionSnapshot: true, status: "PRONTO", deliveredAt: new Date() }),
      );

      const result = await deliverItem("order-1", "item-1", "caixa-1");

      expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({
        where: { id: "item-1", deliveredAt: null },
        data: { deliveredAt: expect.any(Date) },
      });
      expect(result.deliveredAt).not.toBeNull();
    });

    it("item sem produção entrega sem precisar virar PRONTO", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [item({ id: "item-1", requiresProductionSnapshot: false, status: "PENDENTE" })],
        }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", requiresProductionSnapshot: false, status: "PENDENTE", deliveredAt: new Date() }),
      );

      const result = await deliverItem("order-1", "item-1", "caixa-1");

      expect(result.deliveredAt).not.toBeNull();
      expect(prisma.orderItem.updateMany).toHaveBeenCalled();
    });

    it("LOCAL PENDENTE pode entregar item pronto — pagamento não é exigido para LOCAL", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          consumptionType: "LOCAL",
          paymentStatus: "PENDENTE",
          items: [item({ id: "item-1", requiresProductionSnapshot: true, status: "PRONTO" })],
        }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", status: "PRONTO", deliveredAt: new Date() }),
      );

      const result = await deliverItem("order-1", "item-1", "caixa-1");

      expect(result.deliveredAt).not.toBeNull();
    });

    it("VIAGEM PENDENTE não pode entregar — 409 PAYMENT_REQUIRED_FOR_DELIVERY", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          consumptionType: "VIAGEM",
          paymentStatus: "PENDENTE",
          items: [item({ id: "item-1", requiresProductionSnapshot: true, status: "PRONTO" })],
        }),
      );

      await expect(deliverItem("order-1", "item-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "PAYMENT_REQUIRED_FOR_DELIVERY",
      });
      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it("VIAGEM PAGO pode entregar", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          consumptionType: "VIAGEM",
          paymentStatus: "PAGO",
          items: [item({ id: "item-1", requiresProductionSnapshot: true, status: "PRONTO" })],
        }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", status: "PRONTO", deliveredAt: new Date() }),
      );

      const result = await deliverItem("order-1", "item-1", "caixa-1");

      expect(result.deliveredAt).not.toBeNull();
    });

    it("registra a entrega no OrderHistory com action=ITEM_DELIVERED e o userId autenticado", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({ id: "order-1", items: [item({ id: "item-1" })] }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", deliveredAt: new Date() }),
      );

      await deliverItem("order-1", "item-1", "caixa-1");

      expect(prisma.orderHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: "order-1",
          orderItemId: "item-1",
          action: "ITEM_DELIVERED",
          newState: "ENTREGUE",
          userId: "caixa-1",
        },
      });
    });

    it("último item válido entregue preenche Order.deliveredAt", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [
            item({ id: "item-1", status: "PENDENTE" }),
            item({ id: "item-2", status: "PENDENTE", deliveredAt: new Date("2026-01-02T00:00:00.000Z") }),
          ],
        }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", deliveredAt: new Date() }),
      );

      await deliverItem("order-1", "item-1", "caixa-1");

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: "order-1", deliveredAt: null },
        data: { deliveredAt: expect.any(Date) },
      });
    });

    it("registra ORDER_DELIVERED quando o último item válido é entregue e a reivindicação do fechamento é bem-sucedida (Etapa 15)", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [
            item({ id: "item-1", status: "PENDENTE" }),
            item({ id: "item-2", status: "PENDENTE", deliveredAt: new Date("2026-01-02T00:00:00.000Z") }),
          ],
        }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", deliveredAt: new Date() }),
      );
      vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });

      await deliverItem("order-1", "item-1", "caixa-1");

      expect(prisma.orderHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: "order-1",
          orderItemId: null,
          action: "ORDER_DELIVERED",
          userId: "caixa-1",
        },
      });
      // Exatamente um ITEM_DELIVERED e um ORDER_DELIVERED — nunca mais.
      expect(prisma.orderHistory.create).toHaveBeenCalledTimes(2);
    });

    it("não registra ORDER_DELIVERED quando a reivindicação do fechamento não encontra mais Order.deliveredAt=null (perdeu a corrida)", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [
            item({ id: "item-1", status: "PENDENTE" }),
            item({ id: "item-2", status: "PENDENTE", deliveredAt: new Date("2026-01-02T00:00:00.000Z") }),
          ],
        }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", deliveredAt: new Date() }),
      );
      // Outra transação concorrente já fechou o pedido entre a leitura e a
      // atualização — o updateMany condicional não encontra mais
      // deliveredAt=null.
      vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });

      await deliverItem("order-1", "item-1", "caixa-1");

      const orderDeliveredCalls = vi
        .mocked(prisma.orderHistory.create)
        .mock.calls.filter((call: [{ data: { action: string } }]) => call[0].data.action === "ORDER_DELIVERED");
      expect(orderDeliveredCalls).toHaveLength(0);
      // O item continua sendo entregue normalmente — só o registro de
      // fechamento do pedido é que não é criado.
      expect(prisma.orderHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: "order-1",
          orderItemId: "item-1",
          action: "ITEM_DELIVERED",
          newState: "ENTREGUE",
          userId: "caixa-1",
        },
      });
    });

    it("não registra ORDER_DELIVERED quando ainda sobra item válido pendente", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [
            item({ id: "item-1", status: "PENDENTE" }),
            item({ id: "item-2", status: "PENDENTE", deliveredAt: null }),
          ],
        }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", deliveredAt: new Date() }),
      );

      await deliverItem("order-1", "item-1", "caixa-1");

      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      const orderDeliveredCalls = vi
        .mocked(prisma.orderHistory.create)
        .mock.calls.filter((call: [{ data: { action: string } }]) => call[0].data.action === "ORDER_DELIVERED");
      expect(orderDeliveredCalls).toHaveLength(0);
    });

    it("item CANCELADO não bloqueia o fechamento do pedido", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [
            item({ id: "item-1", status: "PENDENTE" }),
            item({ id: "item-2", status: "CANCELADO" }),
          ],
        }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", deliveredAt: new Date() }),
      );

      await deliverItem("order-1", "item-1", "caixa-1");

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: "order-1", deliveredAt: null },
        data: { deliveredAt: expect.any(Date) },
      });
    });

    it("não fecha o pedido enquanto sobrar item válido ainda não entregue", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({
          id: "order-1",
          items: [
            item({ id: "item-1", status: "PENDENTE" }),
            item({ id: "item-2", status: "PENDENTE", deliveredAt: null }),
          ],
        }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", deliveredAt: new Date() }),
      );

      await deliverItem("order-1", "item-1", "caixa-1");

      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it("rejeita com 409 ORDER_ITEM_ALREADY_DELIVERED quando perde a corrida para outra entrega concorrente", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({ id: "order-1", items: [item({ id: "item-1" })] }),
      );
      // Sob a trava de linha isso não deveria acontecer de verdade, mas a
      // segunda camada de defesa (updateMany condicional) é testada aqui
      // como se tivesse perdido a corrida mesmo assim.
      vi.mocked(prisma.orderItem.updateMany).mockResolvedValue({ count: 0 });

      await expect(deliverItem("order-1", "item-1", "caixa-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_ALREADY_DELIVERED",
      });
      expect(prisma.orderHistory.create).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it("trava a linha do pedido (SELECT ... FOR UPDATE) antes de ler qualquer coisa", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        order({ id: "order-1", items: [item({ id: "item-1" })] }),
      );
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ id: "item-1", deliveredAt: new Date() }),
      );

      await deliverItem("order-1", "item-1", "caixa-1");

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });
});
