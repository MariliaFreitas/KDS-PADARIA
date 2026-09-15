import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../history.service.js", () => ({
  listHistoryOrders: vi.fn(),
  getHistoryOrderDetail: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { AppError } from "../../../lib/app-error.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import { env } from "../../../config/env.js";
import * as historyService from "../history.service.js";

const app = createApp("http://localhost:5173");

function tokenFor(role: "ADMIN" | "ATENDENTE" | "CAIXA" | "PRODUCAO", userId = "user-1"): string {
  return jwt.sign({ id: userId, username: "user", name: "Usuário", role }, env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

const caixaToken = tokenFor("CAIXA", "caixa-1");
const adminToken = tokenFor("ADMIN", "admin-1");
const atendenteToken = tokenFor("ATENDENTE", "atendente-1");
const producaoToken = tokenFor("PRODUCAO", "producao-1");

const listResultFixture = {
  orders: [
    {
      id: "order-1",
      serviceNumber: 27,
      customerName: "Maria",
      channel: "BALCAO" as const,
      consumptionType: "LOCAL" as const,
      createdAt: new Date("2026-01-01T09:00:00.000Z"),
      paymentStatus: "PAGO" as const,
      paidAt: new Date("2026-01-01T09:30:00.000Z"),
      deliveredAt: new Date("2026-01-01T10:00:00.000Z"),
      cancelledAt: null,
      totalCents: 1000,
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

const detailFixture = {
  id: "order-1",
  serviceNumber: 27,
  customerName: "Maria",
  channel: "BALCAO" as const,
  consumptionType: "LOCAL" as const,
  pickupTime: null,
  createdAt: new Date("2026-01-01T09:00:00.000Z"),
  paymentStatus: "PAGO" as const,
  paidAt: new Date("2026-01-01T09:30:00.000Z"),
  deliveredAt: new Date("2026-01-01T10:00:00.000Z"),
  cancelledAt: null,
  cancelReason: null,
  totalCents: 1000,
  items: [],
  history: [],
};

describe("/api/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/history/orders", () => {
    it("retorna 401 sem autenticação", async () => {
      const response = await request(app).get("/api/history/orders");

      expect(response.status).toBe(401);
      expect(response.body.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    it("retorna 403 para ATENDENTE", async () => {
      const response = await request(app)
        .get("/api/history/orders")
        .set("Authorization", `Bearer ${atendenteToken}`);

      expect(response.status).toBe(403);
      expect(historyService.listHistoryOrders).not.toHaveBeenCalled();
    });

    it("retorna 403 para PRODUCAO", async () => {
      const response = await request(app)
        .get("/api/history/orders")
        .set("Authorization", `Bearer ${producaoToken}`);

      expect(response.status).toBe(403);
      expect(historyService.listHistoryOrders).not.toHaveBeenCalled();
    });

    it("permite CAIXA consultar a lista", async () => {
      vi.mocked(historyService.listHistoryOrders).mockResolvedValue(listResultFixture);

      const response = await request(app)
        .get("/api/history/orders")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(200);
      expect(response.body.orders).toHaveLength(1);
    });

    it("permite ADMIN consultar a lista", async () => {
      vi.mocked(historyService.listHistoryOrders).mockResolvedValue(listResultFixture);

      const response = await request(app)
        .get("/api/history/orders")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it("usa page=1 e pageSize=20 por padrão", async () => {
      vi.mocked(historyService.listHistoryOrders).mockResolvedValue(listResultFixture);

      await request(app).get("/api/history/orders").set("Authorization", `Bearer ${caixaToken}`);

      expect(historyService.listHistoryOrders).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 20 }),
      );
    });

    it("repassa search, status, from, to, page e pageSize para o service", async () => {
      vi.mocked(historyService.listHistoryOrders).mockResolvedValue(listResultFixture);

      await request(app)
        .get(
          "/api/history/orders?search=%2327&status=ENTREGUE&from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.999Z&page=2&pageSize=10",
        )
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(historyService.listHistoryOrders).toHaveBeenCalledWith({
        search: "#27",
        status: "ENTREGUE",
        from: new Date("2026-01-01T00:00:00.000Z"),
        to: new Date("2026-01-31T23:59:59.999Z"),
        page: 2,
        pageSize: 10,
      });
    });

    it("retorna 400 VALIDATION_ERROR para status inválido", async () => {
      const response = await request(app)
        .get("/api/history/orders?status=QUALQUERCOISA")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(historyService.listHistoryOrders).not.toHaveBeenCalled();
    });

    it("retorna 400 VALIDATION_ERROR para from com data inválida", async () => {
      const response = await request(app)
        .get("/api/history/orders?from=não-é-uma-data")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(historyService.listHistoryOrders).not.toHaveBeenCalled();
    });

    it("retorna 400 VALIDATION_ERROR para page não inteiro/positivo", async () => {
      const response = await request(app)
        .get("/api/history/orders?page=0")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(historyService.listHistoryOrders).not.toHaveBeenCalled();
    });

    it("limita pageSize ao máximo permitido em vez de rejeitar", async () => {
      vi.mocked(historyService.listHistoryOrders).mockResolvedValue(listResultFixture);

      await request(app)
        .get("/api/history/orders?pageSize=99999")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(historyService.listHistoryOrders).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 100 }),
      );
    });
  });

  describe("GET /api/history/orders/:orderId", () => {
    it("retorna 401 sem autenticação", async () => {
      const response = await request(app).get("/api/history/orders/order-1");

      expect(response.status).toBe(401);
      expect(historyService.getHistoryOrderDetail).not.toHaveBeenCalled();
    });

    it("retorna 403 para ATENDENTE", async () => {
      const response = await request(app)
        .get("/api/history/orders/order-1")
        .set("Authorization", `Bearer ${atendenteToken}`);

      expect(response.status).toBe(403);
      expect(historyService.getHistoryOrderDetail).not.toHaveBeenCalled();
    });

    it("retorna 403 para PRODUCAO", async () => {
      const response = await request(app)
        .get("/api/history/orders/order-1")
        .set("Authorization", `Bearer ${producaoToken}`);

      expect(response.status).toBe(403);
      expect(historyService.getHistoryOrderDetail).not.toHaveBeenCalled();
    });

    it("permite CAIXA consultar o detalhe", async () => {
      vi.mocked(historyService.getHistoryOrderDetail).mockResolvedValue(detailFixture);

      const response = await request(app)
        .get("/api/history/orders/order-1")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe("order-1");
      expect(historyService.getHistoryOrderDetail).toHaveBeenCalledWith("order-1");
    });

    it("permite ADMIN consultar o detalhe", async () => {
      vi.mocked(historyService.getHistoryOrderDetail).mockResolvedValue(detailFixture);

      const response = await request(app)
        .get("/api/history/orders/order-1")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it("mapeia ORDER_NOT_FOUND do service para 404", async () => {
      vi.mocked(historyService.getHistoryOrderDetail).mockRejectedValue(
        new AppError("Pedido não encontrado.", 404, ErrorCode.ORDER_NOT_FOUND),
      );

      const response = await request(app)
        .get("/api/history/orders/inexistente")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe(ErrorCode.ORDER_NOT_FOUND);
    });
  });
});
