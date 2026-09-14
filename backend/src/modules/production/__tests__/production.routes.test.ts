import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../production.service.js", () => ({
  listProductionStations: vi.fn(),
  getStationQueue: vi.fn(),
  advanceItem: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { AppError } from "../../../lib/app-error.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import { env } from "../../../config/env.js";
import * as productionService from "../production.service.js";

const app = createApp("http://localhost:5173");

function tokenFor(role: "ADMIN" | "ATENDENTE" | "CAIXA" | "PRODUCAO"): string {
  return jwt.sign({ id: "user-1", username: "user", name: "Usuário", role }, env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

const atendenteToken = tokenFor("ATENDENTE");
const adminToken = tokenFor("ADMIN");
const producaoToken = tokenFor("PRODUCAO");
const caixaToken = tokenFor("CAIXA");

const queueItemFixture = {
  id: "item-1",
  productNameSnapshot: "Pão francês",
  saleType: "UNIT" as const,
  quantity: 2,
  weightGrams: null,
  variationNameSnapshot: null,
  status: "PENDENTE" as const,
  observation: null,
  includedAt: new Date("2026-01-01T10:00:00.000Z"),
  additionals: [],
  order: { orderNumber: 154, customerName: "Maria" },
};

const advancedItemFixture = {
  id: "item-1",
  orderId: "order-1",
  productId: "product-1",
  productNameSnapshot: "Pão francês",
  saleType: "UNIT" as const,
  basePriceCentsSnapshot: 500,
  requiresProductionSnapshot: true,
  quantity: 2,
  weightGrams: null,
  variationId: null,
  variationNameSnapshot: null,
  stationIdSnapshot: "station-1",
  stationNameSnapshot: "Estação 1",
  status: "EM_PREPARO" as const,
  totalCents: 1000,
  observation: null,
  includedAt: new Date("2026-01-01T10:00:00.000Z"),
  additionals: [],
};

describe("rotas de produção", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/production/stations", () => {
    it("retorna 401 sem autenticação", async () => {
      const response = await request(app).get("/api/production/stations");

      expect(response.status).toBe(401);
      expect(response.body.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    it("retorna 403 para ATENDENTE", async () => {
      const response = await request(app)
        .get("/api/production/stations")
        .set("Authorization", `Bearer ${atendenteToken}`);

      expect(response.status).toBe(403);
      expect(productionService.listProductionStations).not.toHaveBeenCalled();
    });

    it("retorna 403 para CAIXA", async () => {
      const response = await request(app)
        .get("/api/production/stations")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(403);
      expect(productionService.listProductionStations).not.toHaveBeenCalled();
    });

    it("permite PRODUCAO acessar", async () => {
      vi.mocked(productionService.listProductionStations).mockResolvedValue([]);

      const response = await request(app)
        .get("/api/production/stations")
        .set("Authorization", `Bearer ${producaoToken}`);

      expect(response.status).toBe(200);
    });

    it("permite ADMIN acessar", async () => {
      vi.mocked(productionService.listProductionStations).mockResolvedValue([]);

      const response = await request(app)
        .get("/api/production/stations")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe("GET /api/production/stations/:stationId/items", () => {
    it("retorna 403 para ATENDENTE", async () => {
      const response = await request(app)
        .get("/api/production/stations/station-1/items")
        .set("Authorization", `Bearer ${atendenteToken}`);

      expect(response.status).toBe(403);
      expect(productionService.getStationQueue).not.toHaveBeenCalled();
    });

    it("retorna 403 para CAIXA", async () => {
      const response = await request(app)
        .get("/api/production/stations/station-1/items")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(403);
      expect(productionService.getStationQueue).not.toHaveBeenCalled();
    });

    it("permite PRODUCAO consultar a fila", async () => {
      vi.mocked(productionService.getStationQueue).mockResolvedValue([queueItemFixture]);

      const response = await request(app)
        .get("/api/production/stations/station-1/items")
        .set("Authorization", `Bearer ${producaoToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(productionService.getStationQueue).toHaveBeenCalledWith("station-1");
    });

    it("permite ADMIN consultar a fila", async () => {
      vi.mocked(productionService.getStationQueue).mockResolvedValue([]);

      const response = await request(app)
        .get("/api/production/stations/station-1/items")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it("mapeia STATION_NOT_FOUND do service para 404", async () => {
      vi.mocked(productionService.getStationQueue).mockRejectedValue(
        new AppError("Estação não encontrada.", 404, ErrorCode.STATION_NOT_FOUND),
      );

      const response = await request(app)
        .get("/api/production/stations/inexistente/items")
        .set("Authorization", `Bearer ${producaoToken}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe(ErrorCode.STATION_NOT_FOUND);
    });
  });

  describe("PATCH /api/production/stations/:stationId/items/:itemId/advance", () => {
    it("retorna 403 para ATENDENTE", async () => {
      const response = await request(app)
        .patch("/api/production/stations/station-1/items/item-1/advance")
        .set("Authorization", `Bearer ${atendenteToken}`);

      expect(response.status).toBe(403);
      expect(productionService.advanceItem).not.toHaveBeenCalled();
    });

    it("retorna 403 para CAIXA", async () => {
      const response = await request(app)
        .patch("/api/production/stations/station-1/items/item-1/advance")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(403);
      expect(productionService.advanceItem).not.toHaveBeenCalled();
    });

    it("permite PRODUCAO avançar um item, sem aceitar status vindo do corpo", async () => {
      vi.mocked(productionService.advanceItem).mockResolvedValue(advancedItemFixture);

      const response = await request(app)
        .patch("/api/production/stations/station-1/items/item-1/advance")
        .set("Authorization", `Bearer ${producaoToken}`)
        .send({ status: "PRONTO" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("EM_PREPARO");
      expect(productionService.advanceItem).toHaveBeenCalledWith("station-1", "item-1");
    });

    it("permite ADMIN avançar um item", async () => {
      vi.mocked(productionService.advanceItem).mockResolvedValue(advancedItemFixture);

      const response = await request(app)
        .patch("/api/production/stations/station-1/items/item-1/advance")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it("mapeia ORDER_ITEM_NOT_FOUND do service para 404", async () => {
      vi.mocked(productionService.advanceItem).mockRejectedValue(
        new AppError("Item não encontrado nesta estação.", 404, ErrorCode.ORDER_ITEM_NOT_FOUND),
      );

      const response = await request(app)
        .patch("/api/production/stations/station-1/items/inexistente/advance")
        .set("Authorization", `Bearer ${producaoToken}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe(ErrorCode.ORDER_ITEM_NOT_FOUND);
    });

    it("mapeia ORDER_ITEM_ADVANCE_NOT_ALLOWED do service para 409", async () => {
      vi.mocked(productionService.advanceItem).mockRejectedValue(
        new AppError(
          "Não é possível avançar este item a partir do status atual.",
          409,
          ErrorCode.ORDER_ITEM_ADVANCE_NOT_ALLOWED,
        ),
      );

      const response = await request(app)
        .patch("/api/production/stations/station-1/items/item-1/advance")
        .set("Authorization", `Bearer ${producaoToken}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe(ErrorCode.ORDER_ITEM_ADVANCE_NOT_ALLOWED);
    });
  });
});
