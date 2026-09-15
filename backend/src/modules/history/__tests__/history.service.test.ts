import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../../../lib/prisma.js";
import { getHistoryOrderDetail, listHistoryOrders } from "../history.service.js";

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
  deliveredAt: Date | null;
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
    paymentStatus: "PAGO",
    paidAt: new Date("2026-01-01T09:30:00.000Z"),
    paidByUserId: "caixa-1",
    cancelledAt: null,
    cancelReason: null,
    cancelledByUserId: null,
    deliveredAt: new Date("2026-01-01T10:00:00.000Z"),
    createdByUserId: "atendente-1",
    createdAt: new Date("2026-01-01T09:00:00.000Z"),
    items: [],
    ...overrides,
  };
}

interface HistoryEntryFixture {
  id: string;
  orderId: string;
  orderItemId: string | null;
  action: string;
  previousState: string | null;
  newState: string | null;
  reason: string | null;
  userId: string;
  createdAt: Date;
  user: { id: string; name: string; role: "ATENDENTE" | "PRODUCAO" | "CAIXA" | "ADMIN" };
  orderItem: { id: string; productNameSnapshot: string } | null;
}

function historyEntry(
  overrides: Partial<HistoryEntryFixture> & { id: string; action: string },
): HistoryEntryFixture {
  return {
    orderId: "order-1",
    orderItemId: null,
    previousState: null,
    newState: null,
    reason: null,
    userId: "user-1",
    createdAt: new Date("2026-01-01T09:00:00.000Z"),
    user: { id: "user-1", name: "Ana", role: "ATENDENTE" },
    orderItem: null,
    ...overrides,
  };
}

function orderDetail(
  overrides: Partial<OrderFixture> & { id: string },
  history: HistoryEntryFixture[] = [],
): OrderFixture & { history: HistoryEntryFixture[] } {
  return { ...order(overrides), history };
}

describe("history.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listHistoryOrders", () => {
    it("consulta só pedidos fechados operacionalmente (deliveredAt != null OR cancelledAt != null)", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);
      vi.mocked(prisma.order.count).mockResolvedValue(0);

      await listHistoryOrders({ page: 1, pageSize: 20 });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ deliveredAt: { not: null } }, { cancelledAt: { not: null } }],
          }),
        }),
      );
      expect(prisma.order.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ deliveredAt: { not: null } }, { cancelledAt: { not: null } }],
          }),
        }),
      );
    });

    it("pagamento PAGO sozinho não é suficiente — a condição de fechamento nunca inclui paymentStatus", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);
      vi.mocked(prisma.order.count).mockResolvedValue(0);

      await listHistoryOrders({ page: 1, pageSize: 20 });

      const firstCall = vi.mocked(prisma.order.findMany).mock.calls[0];
      if (!firstCall) {
        throw new Error("Era esperada uma chamada a prisma.order.findMany.");
      }

      const firstArgs = firstCall[0];
      if (!firstArgs) {
        throw new Error("Era esperado um argumento na chamada a prisma.order.findMany.");
      }

      expect(firstArgs.where).not.toHaveProperty("paymentStatus");
    });

    it("filtra por status=ENTREGUE restringindo a deliveredAt != null", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);
      vi.mocked(prisma.order.count).mockResolvedValue(0);

      await listHistoryOrders({ page: 1, pageSize: 20, status: "ENTREGUE" });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deliveredAt: { not: null } }),
        }),
      );
    });

    it("filtra por status=CANCELADO restringindo a cancelledAt != null", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);
      vi.mocked(prisma.order.count).mockResolvedValue(0);

      await listHistoryOrders({ page: 1, pageSize: 20, status: "CANCELADO" });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cancelledAt: { not: null } }),
        }),
      );
    });

    it("filtra por período (from/to) usando createdAt", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);
      vi.mocked(prisma.order.count).mockResolvedValue(0);
      const from = new Date("2026-01-01T00:00:00.000Z");
      const to = new Date("2026-01-31T23:59:59.999Z");

      await listHistoryOrders({ page: 1, pageSize: 20, from, to });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdAt: { gte: from, lte: to } }),
        }),
      );
    });

    it('busca por "#27" normaliza o # e interpreta como número operacional, combinado por AND à condição de fechamento', async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);
      vi.mocked(prisma.order.count).mockResolvedValue(0);

      await listHistoryOrders({ page: 1, pageSize: 20, search: "#27" });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ deliveredAt: { not: null } }, { cancelledAt: { not: null } }],
            AND: [
              {
                OR: [
                  { customerName: { contains: "#27", mode: "insensitive" } },
                  { serviceNumber: 27 },
                ],
              },
            ],
          }),
        }),
      );
    });

    it("busca por nome (substring, sem diferenciar caixa) quando o texto não é um número operacional", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);
      vi.mocked(prisma.order.count).mockResolvedValue(0);

      await listHistoryOrders({ page: 1, pageSize: 20, search: "mar" });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{ OR: [{ customerName: { contains: "mar", mode: "insensitive" } }] }],
          }),
        }),
      );
    });

    it("número operacional reutilizado pode retornar mais de um pedido histórico", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([
        order({ id: "order-old", serviceNumber: 27, customerName: "Ana" }),
        order({ id: "order-new", serviceNumber: 27, customerName: "Bruno" }),
      ]);
      vi.mocked(prisma.order.count).mockResolvedValue(2);

      const result = await listHistoryOrders({ page: 1, pageSize: 20, search: "27" });

      expect(result.orders).toHaveLength(2);
      expect(result.orders.map((o) => o.id)).toEqual(["order-old", "order-new"]);
    });

    it("pagina com page/pageSize convertidos em skip/take, ordenado por createdAt desc e id desc", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);
      vi.mocked(prisma.order.count).mockResolvedValue(0);

      await listHistoryOrders({ page: 3, pageSize: 10 });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
      );
    });

    it("calcula total/totalPages a partir do count", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);
      vi.mocked(prisma.order.count).mockResolvedValue(45);

      const result = await listHistoryOrders({ page: 1, pageSize: 20 });

      expect(result.total).toBe(45);
      expect(result.totalPages).toBe(3);
    });

    it("totalPages é 0 quando não há nenhum resultado", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);
      vi.mocked(prisma.order.count).mockResolvedValue(0);

      const result = await listHistoryOrders({ page: 1, pageSize: 20 });

      expect(result.totalPages).toBe(0);
    });

    it("totalCents no resumo soma só itens não cancelados", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([
        order({
          id: "order-1",
          items: [
            item({ id: "item-1", totalCents: 1000, status: "PRONTO" }),
            item({ id: "item-2", totalCents: 500, status: "CANCELADO" }),
          ],
        }),
      ]);
      vi.mocked(prisma.order.count).mockResolvedValue(1);

      const result = await listHistoryOrders({ page: 1, pageSize: 20 });

      expect(result.orders[0].totalCents).toBe(1000);
    });

    it("expõe serviceNumber, não orderNumber, no resumo", async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([
        order({ id: "order-1", serviceNumber: 42, orderNumber: 999 }),
      ]);
      vi.mocked(prisma.order.count).mockResolvedValue(1);

      const result = await listHistoryOrders({ page: 1, pageSize: 20 });

      expect(result.orders[0].serviceNumber).toBe(42);
      expect(result.orders[0]).not.toHaveProperty("orderNumber");
    });
  });

  describe("getHistoryOrderDetail", () => {
    it("rejeita pedido inexistente com 404 ORDER_NOT_FOUND", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

      await expect(getHistoryOrderDetail("inexistente")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    });

    it("rejeita pedido pago mas ainda aberto (nem entregue nem cancelado) com 404 ORDER_NOT_FOUND", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        orderDetail({ id: "order-1", deliveredAt: null, cancelledAt: null }),
      );

      await expect(getHistoryOrderDetail("order-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    });

    it("retorna pedido entregue com itens (inclusive CANCELADO) e total recalculado excluindo cancelados", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        orderDetail({
          id: "order-1",
          items: [
            item({ id: "item-1", totalCents: 1000, status: "PRONTO", deliveredAt: new Date() }),
            item({ id: "item-2", totalCents: 500, status: "CANCELADO" }),
          ],
        }),
      );

      const result = await getHistoryOrderDetail("order-1");

      expect(result.items).toHaveLength(2);
      expect(result.items.map((i) => i.id)).toEqual(["item-1", "item-2"]);
      expect(result.totalCents).toBe(1000);
    });

    it("retorna pedido cancelado (deliveredAt null, cancelledAt preenchido)", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        orderDetail({
          id: "order-1",
          deliveredAt: null,
          cancelledAt: new Date("2026-01-02T00:00:00.000Z"),
          cancelReason: "Cliente desistiu",
          items: [item({ id: "item-1", totalCents: 1000, status: "CANCELADO" })],
        }),
      );

      const result = await getHistoryOrderDetail("order-1");

      expect(result.cancelledAt).not.toBeNull();
      expect(result.cancelReason).toBe("Cliente desistiu");
      expect(result.totalCents).toBe(0);
    });

    it("inclui adicionais de cada item, com nome/preço/quantidade congelados", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        orderDetail({
          id: "order-1",
          items: [
            item({
              id: "item-1",
              totalCents: 1200,
              additionals: [additional({ id: "add-1", nameSnapshot: "Catupiry" })],
            }),
          ],
        }),
      );

      const result = await getHistoryOrderDetail("order-1");

      expect(result.items[0].additionals).toEqual([
        { nameSnapshot: "Catupiry", priceCentsSnapshot: 200, quantity: 1 },
      ]);
    });

    it("retorna a timeline ordenada por createdAt asc, com o responsável (nome + perfil) de cada evento", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        orderDetail({ id: "order-1" }, [
          historyEntry({
            id: "h1",
            action: "ORDER_CREATED",
            userId: "atendente-1",
            user: { id: "atendente-1", name: "Ana", role: "ATENDENTE" },
            createdAt: new Date("2026-01-01T09:00:00.000Z"),
          }),
          historyEntry({
            id: "h2",
            action: "PAYMENT_CONFIRMED",
            userId: "caixa-1",
            user: { id: "caixa-1", name: "Bruno", role: "CAIXA" },
            createdAt: new Date("2026-01-01T09:30:00.000Z"),
            previousState: "PENDENTE",
            newState: "PAGO",
          }),
        ]),
      );

      const result = await getHistoryOrderDetail("order-1");

      expect(result.history).toHaveLength(2);
      expect(result.history[0]).toMatchObject({
        action: "ORDER_CREATED",
        user: { id: "atendente-1", name: "Ana", role: "ATENDENTE" },
        item: null,
      });
      expect(result.history[1]).toMatchObject({
        action: "PAYMENT_CONFIRMED",
        previousState: "PENDENTE",
        newState: "PAGO",
        user: { id: "caixa-1", name: "Bruno", role: "CAIXA" },
      });
      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            history: expect.objectContaining({ orderBy: { createdAt: "asc" } }),
          }),
        }),
      );
    });

    it("inclui o item relacionado quando orderItemId não é nulo", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        orderDetail({ id: "order-1" }, [
          historyEntry({
            id: "h1",
            action: "ITEM_ADDED",
            orderItemId: "item-1",
            orderItem: { id: "item-1", productNameSnapshot: "Coxinha" },
          }),
        ]),
      );

      const result = await getHistoryOrderDetail("order-1");

      expect(result.history[0].item).toEqual({ id: "item-1", productNameSnapshot: "Coxinha" });
    });

    it("pedido antigo sem nenhum evento persistido tem timeline vazia, sem inventar histórico", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(orderDetail({ id: "order-1" }));

      const result = await getHistoryOrderDetail("order-1");

      expect(result.history).toEqual([]);
    });

    it("não confia em nenhum total vindo de fora — sempre recalcula a partir dos itens", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(
        orderDetail({
          id: "order-1",
          items: [item({ id: "item-1", totalCents: 700, status: "PRONTO" })],
        }),
      );

      const result = await getHistoryOrderDetail("order-1");

      expect(result.totalCents).toBe(700);
    });
  });
});
