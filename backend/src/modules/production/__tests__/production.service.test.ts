import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Prisma } from "@prisma/client";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    station: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    orderItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    orderHistory: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../../lib/prisma.js";
import { advanceItem, getStationQueue, listProductionStations } from "../production.service.js";

interface StationFixture {
  id: string;
  name: string;
  active: boolean;
}

function station(overrides: Partial<StationFixture> = {}): StationFixture {
  return { id: "station-1", name: "Estação 1", active: true, ...overrides };
}

type ItemStatus = "PENDENTE" | "EM_PREPARO" | "PRONTO" | "CANCELADO";

interface ItemAdditionalFixture {
  id: string;
  nameSnapshot: string;
  priceCentsSnapshot: number;
  quantity: number;
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
  additionals: ItemAdditionalFixture[];
  order: {
    serviceNumber: number;
    customerName: string;
    channel: "BALCAO" | "WHATSAPP";
    consumptionType: "LOCAL" | "VIAGEM";
    paymentStatus: "PENDENTE" | "PAGO";
  };
}

function item(overrides: Partial<ItemFixture> = {}): ItemFixture {
  return {
    id: "item-1",
    orderId: "order-1",
    productId: "product-1",
    productNameSnapshot: "Pão francês",
    saleType: "UNIT",
    basePriceCentsSnapshot: 500,
    requiresProductionSnapshot: true,
    quantity: 2,
    weightGrams: null,
    variationId: null,
    variationNameSnapshot: null,
    stationIdSnapshot: "station-1",
    stationNameSnapshot: "Estação 1",
    status: "PENDENTE",
    totalCents: 1000,
    observation: null,
    includedAt: new Date("2026-01-01T10:00:00.000Z"),
    deliveredAt: null,
    additionals: [],
    // BALCAO+PAGO por padrão: nenhum dos dois sozinho já impede a trava de
    // WHATSAPP+VIAGEM+PENDENTE de disparar, então os testes existentes que
    // não mexem nesses campos continuam alheios a ela.
    order: {
      serviceNumber: 154,
      customerName: "Maria",
      channel: "BALCAO",
      consumptionType: "LOCAL",
      paymentStatus: "PAGO",
    },
    ...overrides,
  };
}

// Tipo preciso do payload que getStationQueue de fato recebe do Prisma para
// esse cenário específico (item() sozinho carrega um "order" mais largo,
// usado pelos testes da trava WHATSAPP+VIAGEM abaixo) — reflete
// exatamente o include: { additionals: true, order: { select: {...} } }
// da query real em production.service.ts, sem inventar um "unknown"
// incompatível nem mascarar o tipo.
type StationQueueOrderItemRow = Prisma.OrderItemGetPayload<{
  include: {
    additionals: true;
    order: { select: { serviceNumber: true; customerName: true } };
  };
}>;

describe("production.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listProductionStations", () => {
    it("inclui estação ativa mesmo sem nenhum item pendente", async () => {
      vi.mocked(prisma.station.findMany).mockResolvedValue([station({ active: true })]);
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([]);

      const result = await listProductionStations();

      expect(result).toEqual([{ id: "station-1", name: "Estação 1", active: true }]);
    });

    it("não inclui estação inativa sem trabalho restante", async () => {
      vi.mocked(prisma.station.findMany).mockResolvedValue([station({ active: false })]);
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([]);

      const result = await listProductionStations();

      expect(result).toEqual([]);
    });

    it("inclui estação inativa que ainda tem item PENDENTE", async () => {
      vi.mocked(prisma.station.findMany).mockResolvedValue([station({ active: false })]);
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([
        item({ status: "PENDENTE", stationIdSnapshot: "station-1" }),
      ]);

      const result = await listProductionStations();

      expect(result).toEqual([{ id: "station-1", name: "Estação 1", active: false }]);
    });

    it("inclui estação inativa que ainda tem item EM_PREPARO", async () => {
      vi.mocked(prisma.station.findMany).mockResolvedValue([
        station({ id: "station-2", name: "Estação 2", active: false }),
      ]);
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([
        item({ status: "EM_PREPARO", stationIdSnapshot: "station-2" }),
      ]);

      const result = await listProductionStations();

      expect(result).toEqual([{ id: "station-2", name: "Estação 2", active: false }]);
    });

    it("consulta itens somente com requiresProductionSnapshot=true e status PENDENTE/EM_PREPARO, excluindo WHATSAPP+VIAGEM+PENDENTE", async () => {
      vi.mocked(prisma.station.findMany).mockResolvedValue([]);
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([]);

      await listProductionStations();

      expect(prisma.orderItem.findMany).toHaveBeenCalledWith({
        where: {
          requiresProductionSnapshot: true,
          status: { in: ["PENDENTE", "EM_PREPARO"] },
          NOT: {
            order: { channel: "WHATSAPP", consumptionType: "VIAGEM", paymentStatus: "PENDENTE" },
          },
        },
      });
    });

    it("não inclui estação inativa cujo único trabalho pendente é de um pedido WHATSAPP+VIAGEM ainda não pago", async () => {
      vi.mocked(prisma.station.findMany).mockResolvedValue([station({ active: false })]);
      // O filtro NOT do where (verificado no teste acima) é quem garante,
      // contra o banco real, que esse item nunca chega aqui — o mock abaixo
      // simula exatamente esse resultado já filtrado.
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([]);

      const result = await listProductionStations();

      expect(result).toEqual([]);
    });
  });

  describe("getStationQueue", () => {
    it("retorna item PENDENTE da estação, só com os dados operacionais", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(station());
      // order aqui é só {serviceNumber, customerName} de propósito: é
      // exatamente o que o include:{order:{select:{...}}} da query real
      // devolveria — diferente do fixture padrão de item(), que carrega
      // channel/consumptionType/paymentStatus só para os testes da trava
      // de WHATSAPP+VIAGEM (ver describe mais abaixo). Tipado explicitamente
      // como o payload real (Prisma.OrderItemGetPayload), não como o
      // ItemFixture local — que tem um "order" mais largo.
      const queueRow: StationQueueOrderItemRow = {
        ...item({ status: "PENDENTE" }),
        additionals: [],
        order: { serviceNumber: 154, customerName: "Maria" },
      };
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([queueRow]);

      const result = await getStationQueue("station-1");

      expect(result).toEqual([
        {
          id: "item-1",
          productNameSnapshot: "Pão francês",
          saleType: "UNIT",
          quantity: 2,
          weightGrams: null,
          variationNameSnapshot: null,
          status: "PENDENTE",
          observation: null,
          includedAt: new Date("2026-01-01T10:00:00.000Z"),
          additionals: [],
          order: { serviceNumber: 154, customerName: "Maria" },
        },
      ]);
      expect(result[0]).not.toHaveProperty("basePriceCentsSnapshot");
      expect(result[0]).not.toHaveProperty("totalCents");
      expect(result[0]).not.toHaveProperty("stationIdSnapshot");
    });

    it("retorna item EM_PREPARO da estação", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(station());
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([item({ status: "EM_PREPARO" })]);

      const result = await getStationQueue("station-1");

      expect(result[0].status).toBe("EM_PREPARO");
    });

    it("não expõe o preço dos adicionais, só nome e quantidade", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(station());
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([
        item({
          additionals: [
            { id: "add-1", nameSnapshot: "Manteiga", priceCentsSnapshot: 150, quantity: 1 },
          ],
        }),
      ]);

      const result = await getStationQueue("station-1");

      expect(result[0].additionals).toEqual([
        { id: "add-1", nameSnapshot: "Manteiga", quantity: 1 },
      ]);
    });

    it("consulta usando stationIdSnapshot, nunca o cadastro atual do produto, excluindo WHATSAPP+VIAGEM+PENDENTE", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(station());
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([]);

      await getStationQueue("station-1");

      expect(prisma.orderItem.findMany).toHaveBeenCalledWith({
        where: {
          stationIdSnapshot: "station-1",
          requiresProductionSnapshot: true,
          status: { in: ["PENDENTE", "EM_PREPARO"] },
          NOT: {
            order: { channel: "WHATSAPP", consumptionType: "VIAGEM", paymentStatus: "PENDENTE" },
          },
        },
        orderBy: { includedAt: "asc" },
        include: {
          additionals: true,
          order: { select: { serviceNumber: true, customerName: true } },
        },
      });
    });

    it("ordena por includedAt asc", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(station());
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([]);

      await getStationQueue("station-1");

      expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { includedAt: "asc" } }),
      );
    });

    it("não retorna item de outra estação, sem preparo, ou PRONTO/CANCELADO — via filtro do where", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(station());
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([]);

      const result = await getStationQueue("station-1");

      expect(result).toEqual([]);
    });

    it("rejeita estação inexistente com 404 STATION_NOT_FOUND", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(null);

      await expect(getStationQueue("inexistente")).rejects.toMatchObject({
        statusCode: 404,
        code: "STATION_NOT_FOUND",
      });
      expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
    });
  });

  describe("advanceItem", () => {
    beforeEach(() => {
      // advanceItem roda tudo dentro de prisma.$transaction (Etapa 15); como
      // os mocks abaixo são os mesmos objetos vi.fn() tanto em prisma.* quanto
      // no "tx" recebido pelo callback, nenhuma asserção muda — só passamos o
      // mock inteiro como se fosse o client da transação (mesmo padrão de
      // order.service.test.ts / order-item.service.test.ts).
      vi.mocked(prisma.$transaction).mockImplementation((callback: (tx: typeof prisma) => unknown) =>
        Promise.resolve(callback(prisma)),
      );
      vi.mocked(prisma.orderItem.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.orderHistory.create).mockResolvedValue({
        id: "history-1",
        orderId: "order-1",
        orderItemId: "item-1",
        action: "ITEM_STATUS_CHANGED",
        previousState: "PENDENTE",
        newState: "EM_PREPARO",
        reason: null,
        userId: "producao-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      });
    });

    it("avança PENDENTE -> EM_PREPARO", async () => {
      vi.mocked(prisma.orderItem.findUnique)
        .mockResolvedValueOnce(item({ status: "PENDENTE" }))
        .mockResolvedValueOnce(item({ status: "EM_PREPARO" }));

      const result = await advanceItem("station-1", "item-1", "producao-1");

      expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({
        where: { id: "item-1", status: "PENDENTE" },
        data: { status: "EM_PREPARO" },
      });
      expect(result.status).toBe("EM_PREPARO");
    });

    it("avança EM_PREPARO -> PRONTO", async () => {
      vi.mocked(prisma.orderItem.findUnique)
        .mockResolvedValueOnce(item({ status: "EM_PREPARO" }))
        .mockResolvedValueOnce(item({ status: "PRONTO" }));

      const result = await advanceItem("station-1", "item-1", "producao-1");

      expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({
        where: { id: "item-1", status: "EM_PREPARO" },
        data: { status: "PRONTO" },
      });
      expect(result.status).toBe("PRONTO");
    });

    it("registra ITEM_STATUS_CHANGED com previousState/newState e o usuário autenticado (Etapa 15)", async () => {
      vi.mocked(prisma.orderItem.findUnique)
        .mockResolvedValueOnce(item({ status: "PENDENTE" }))
        .mockResolvedValueOnce(item({ status: "EM_PREPARO" }));

      await advanceItem("station-1", "item-1", "producao-1");

      expect(prisma.orderHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: "order-1",
          orderItemId: "item-1",
          action: "ITEM_STATUS_CHANGED",
          previousState: "PENDENTE",
          newState: "EM_PREPARO",
          userId: "producao-1",
        },
      });
      expect(prisma.orderHistory.create).toHaveBeenCalledTimes(1);
    });

    it("rejeita avanço de item PRONTO com 409 ORDER_ITEM_ADVANCE_NOT_ALLOWED", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(item({ status: "PRONTO" }));

      await expect(advanceItem("station-1", "item-1", "producao-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_ADVANCE_NOT_ALLOWED",
      });
      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
      expect(prisma.orderHistory.create).not.toHaveBeenCalled();
    });

    it("rejeita avanço de item CANCELADO com 409 ORDER_ITEM_ADVANCE_NOT_ALLOWED", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(item({ status: "CANCELADO" }));

      await expect(advanceItem("station-1", "item-1", "producao-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_ADVANCE_NOT_ALLOWED",
      });
      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it("rejeita item inexistente com 404 ORDER_ITEM_NOT_FOUND", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(null);

      await expect(advanceItem("station-1", "inexistente", "producao-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_ITEM_NOT_FOUND",
      });
      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it("rejeita item de outra estação com 404 ORDER_ITEM_NOT_FOUND", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ stationIdSnapshot: "station-2" }),
      );

      await expect(advanceItem("station-1", "item-1", "producao-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_ITEM_NOT_FOUND",
      });
      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it("rejeita item sem preparo (requiresProductionSnapshot=false) com 404 ORDER_ITEM_NOT_FOUND", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ requiresProductionSnapshot: false, stationIdSnapshot: null }),
      );

      await expect(advanceItem("station-1", "item-1", "producao-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_ITEM_NOT_FOUND",
      });
      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it("rejeita com 409 ORDER_ITEM_ADVANCE_NOT_ALLOWED quando a reivindicação condicional não casa mais nenhuma linha (corrida perdida)", async () => {
      // Simula duas chamadas concorrentes na mesma transição: a leitura
      // ainda vê PENDENTE (a outra chamada já commitou e mudou o status),
      // mas o updateMany condicional não encontra mais nenhuma linha com
      // status=PENDENTE — count=0. Mesma resposta de "não é possível
      // avançar", sem duplicar histórico.
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValueOnce(item({ status: "PENDENTE" }));
      vi.mocked(prisma.orderItem.updateMany).mockResolvedValue({ count: 0 });

      await expect(advanceItem("station-1", "item-1", "producao-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_ADVANCE_NOT_ALLOWED",
      });
      expect(prisma.orderHistory.create).not.toHaveBeenCalled();
    });

    describe("trava WHATSAPP+VIAGEM ainda não pago (Etapa 14)", () => {
      it("bloqueia PENDENTE -> EM_PREPARO com 409 PRODUCTION_BLOCKED_UNTIL_PAID quando o pedido é WHATSAPP+VIAGEM+PENDENTE", async () => {
        vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
          item({
            status: "PENDENTE",
            order: {
              serviceNumber: 154,
              customerName: "Maria",
              channel: "WHATSAPP",
              consumptionType: "VIAGEM",
              paymentStatus: "PENDENTE",
            },
          }),
        );

        await expect(advanceItem("station-1", "item-1", "producao-1")).rejects.toMatchObject({
          statusCode: 409,
          code: "PRODUCTION_BLOCKED_UNTIL_PAID",
        });
        expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
      });

      it("permite PENDENTE -> EM_PREPARO de item WHATSAPP+VIAGEM normalmente depois que paymentStatus=PAGO", async () => {
        vi.mocked(prisma.orderItem.findUnique)
          .mockResolvedValueOnce(
            item({
              status: "PENDENTE",
              order: {
                serviceNumber: 154,
                customerName: "Maria",
                channel: "WHATSAPP",
                consumptionType: "VIAGEM",
                paymentStatus: "PAGO",
              },
            }),
          )
          .mockResolvedValueOnce(item({ status: "EM_PREPARO" }));

        const result = await advanceItem("station-1", "item-1", "producao-1");

        expect(result.status).toBe("EM_PREPARO");
        expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({
          where: { id: "item-1", status: "PENDENTE" },
          data: { status: "EM_PREPARO" },
        });
      });

      it("continua permitindo BALCAO+VIAGEM preparar antes de pagar — a trava não é geral para VIAGEM", async () => {
        vi.mocked(prisma.orderItem.findUnique)
          .mockResolvedValueOnce(
            item({
              status: "PENDENTE",
              order: {
                serviceNumber: 154,
                customerName: "Maria",
                channel: "BALCAO",
                consumptionType: "VIAGEM",
                paymentStatus: "PENDENTE",
              },
            }),
          )
          .mockResolvedValueOnce(item({ status: "EM_PREPARO" }));

        const result = await advanceItem("station-1", "item-1", "producao-1");

        expect(result.status).toBe("EM_PREPARO");
      });

      it("continua permitindo WHATSAPP+LOCAL preparar antes de pagar", async () => {
        vi.mocked(prisma.orderItem.findUnique)
          .mockResolvedValueOnce(
            item({
              status: "PENDENTE",
              order: {
                serviceNumber: 154,
                customerName: "Maria",
                channel: "WHATSAPP",
                consumptionType: "LOCAL",
                paymentStatus: "PENDENTE",
              },
            }),
          )
          .mockResolvedValueOnce(item({ status: "EM_PREPARO" }));

        const result = await advanceItem("station-1", "item-1", "producao-1");

        expect(result.status).toBe("EM_PREPARO");
      });
    });
  });
});
