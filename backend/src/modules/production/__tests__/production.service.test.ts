import { describe, it, expect, vi, beforeEach } from "vitest";

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
    },
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
  additionals: ItemAdditionalFixture[];
  order: { serviceNumber: number; customerName: string };
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
    additionals: [],
    order: { serviceNumber: 154, customerName: "Maria" },
    ...overrides,
  };
}

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

    it("consulta itens somente com requiresProductionSnapshot=true e status PENDENTE/EM_PREPARO", async () => {
      vi.mocked(prisma.station.findMany).mockResolvedValue([]);
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([]);

      await listProductionStations();

      expect(prisma.orderItem.findMany).toHaveBeenCalledWith({
        where: {
          requiresProductionSnapshot: true,
          status: { in: ["PENDENTE", "EM_PREPARO"] },
        },
      });
    });
  });

  describe("getStationQueue", () => {
    it("retorna item PENDENTE da estação, só com os dados operacionais", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(station());
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([item({ status: "PENDENTE" })]);

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

    it("consulta usando stationIdSnapshot, nunca o cadastro atual do produto", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(station());
      vi.mocked(prisma.orderItem.findMany).mockResolvedValue([]);

      await getStationQueue("station-1");

      expect(prisma.orderItem.findMany).toHaveBeenCalledWith({
        where: {
          stationIdSnapshot: "station-1",
          requiresProductionSnapshot: true,
          status: { in: ["PENDENTE", "EM_PREPARO"] },
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
    it("avança PENDENTE -> EM_PREPARO", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(item({ status: "PENDENTE" }));
      vi.mocked(prisma.orderItem.update).mockResolvedValue(item({ status: "EM_PREPARO" }));

      const result = await advanceItem("station-1", "item-1");

      expect(prisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: "item-1" },
        data: { status: "EM_PREPARO" },
        include: { additionals: true },
      });
      expect(result.status).toBe("EM_PREPARO");
    });

    it("avança EM_PREPARO -> PRONTO", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(item({ status: "EM_PREPARO" }));
      vi.mocked(prisma.orderItem.update).mockResolvedValue(item({ status: "PRONTO" }));

      const result = await advanceItem("station-1", "item-1");

      expect(prisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: "item-1" },
        data: { status: "PRONTO" },
        include: { additionals: true },
      });
      expect(result.status).toBe("PRONTO");
    });

    it("rejeita avanço de item PRONTO com 409 ORDER_ITEM_ADVANCE_NOT_ALLOWED", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(item({ status: "PRONTO" }));

      await expect(advanceItem("station-1", "item-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_ADVANCE_NOT_ALLOWED",
      });
      expect(prisma.orderItem.update).not.toHaveBeenCalled();
    });

    it("rejeita avanço de item CANCELADO com 409 ORDER_ITEM_ADVANCE_NOT_ALLOWED", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(item({ status: "CANCELADO" }));

      await expect(advanceItem("station-1", "item-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_ADVANCE_NOT_ALLOWED",
      });
      expect(prisma.orderItem.update).not.toHaveBeenCalled();
    });

    it("rejeita item inexistente com 404 ORDER_ITEM_NOT_FOUND", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(null);

      await expect(advanceItem("station-1", "inexistente")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_ITEM_NOT_FOUND",
      });
      expect(prisma.orderItem.update).not.toHaveBeenCalled();
    });

    it("rejeita item de outra estação com 404 ORDER_ITEM_NOT_FOUND", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ stationIdSnapshot: "station-2" }),
      );

      await expect(advanceItem("station-1", "item-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_ITEM_NOT_FOUND",
      });
      expect(prisma.orderItem.update).not.toHaveBeenCalled();
    });

    it("rejeita item sem preparo (requiresProductionSnapshot=false) com 404 ORDER_ITEM_NOT_FOUND", async () => {
      vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(
        item({ requiresProductionSnapshot: false, stationIdSnapshot: null }),
      );

      await expect(advanceItem("station-1", "item-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_ITEM_NOT_FOUND",
      });
      expect(prisma.orderItem.update).not.toHaveBeenCalled();
    });
  });
});
