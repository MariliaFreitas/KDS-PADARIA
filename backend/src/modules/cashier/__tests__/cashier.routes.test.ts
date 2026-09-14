import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../cashier.service.js", () => ({
  listOpenOrders: vi.fn(),
  confirmPayment: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { AppError } from "../../../lib/app-error.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import { env } from "../../../config/env.js";
import * as cashierService from "../cashier.service.js";

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

const cashierOrderFixture = {
  id: "order-1",
  serviceNumber: 7,
  customerName: "Maria",
  channel: "BALCAO" as const,
  consumptionType: "LOCAL" as const,
  createdAt: new Date("2026-01-01T09:00:00.000Z"),
  items: [
    {
      id: "item-1",
      productNameSnapshot: "Coxinha",
      quantity: 2,
      weightGrams: null,
      variationNameSnapshot: null,
      additionals: [],
    },
  ],
  totalCents: 1500,
};

const paidOrderFixture = {
  id: "order-1",
  orderNumber: 100,
  serviceNumber: 7,
  customerName: "Maria",
  channel: "BALCAO" as const,
  consumptionType: "LOCAL" as const,
  pickupTime: null,
  paymentStatus: "PAGO" as const,
  paidAt: new Date("2026-01-05T12:00:00.000Z"),
  paidByUserId: "caixa-1",
  cancelledAt: null,
  cancelReason: null,
  cancelledByUserId: null,
  deliveredAt: null,
  createdByUserId: "atendente-1",
  createdAt: new Date("2026-01-01T09:00:00.000Z"),
};

describe("/api/cashier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/cashier/orders", () => {
    it("retorna 401 sem autenticação", async () => {
      const response = await request(app).get("/api/cashier/orders");

      expect(response.status).toBe(401);
      expect(response.body.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    it("retorna 403 para ATENDENTE", async () => {
      const response = await request(app)
        .get("/api/cashier/orders")
        .set("Authorization", `Bearer ${atendenteToken}`);

      expect(response.status).toBe(403);
      expect(cashierService.listOpenOrders).not.toHaveBeenCalled();
    });

    it("retorna 403 para PRODUCAO", async () => {
      const response = await request(app)
        .get("/api/cashier/orders")
        .set("Authorization", `Bearer ${producaoToken}`);

      expect(response.status).toBe(403);
      expect(cashierService.listOpenOrders).not.toHaveBeenCalled();
    });

    it("permite CAIXA consultar a lista", async () => {
      vi.mocked(cashierService.listOpenOrders).mockResolvedValue([cashierOrderFixture]);

      const response = await request(app)
        .get("/api/cashier/orders")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(cashierService.listOpenOrders).toHaveBeenCalledWith(undefined);
    });

    it("permite ADMIN consultar a lista", async () => {
      vi.mocked(cashierService.listOpenOrders).mockResolvedValue([]);

      const response = await request(app)
        .get("/api/cashier/orders")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it("repassa o parâmetro search para o service", async () => {
      vi.mocked(cashierService.listOpenOrders).mockResolvedValue([]);

      await request(app)
        .get("/api/cashier/orders?search=Maria")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(cashierService.listOpenOrders).toHaveBeenCalledWith("Maria");
    });

    it("normaliza search em branco para undefined", async () => {
      vi.mocked(cashierService.listOpenOrders).mockResolvedValue([]);

      await request(app)
        .get("/api/cashier/orders?search=   ")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(cashierService.listOpenOrders).toHaveBeenCalledWith(undefined);
    });
  });

  describe("PATCH /api/cashier/orders/:orderId/confirm-payment", () => {
    it("retorna 401 sem autenticação", async () => {
      const response = await request(app).patch("/api/cashier/orders/order-1/confirm-payment");

      expect(response.status).toBe(401);
      expect(cashierService.confirmPayment).not.toHaveBeenCalled();
    });

    it("retorna 403 para ATENDENTE", async () => {
      const response = await request(app)
        .patch("/api/cashier/orders/order-1/confirm-payment")
        .set("Authorization", `Bearer ${atendenteToken}`);

      expect(response.status).toBe(403);
      expect(cashierService.confirmPayment).not.toHaveBeenCalled();
    });

    it("permite CAIXA confirmar pagamento, usando o id do usuário autenticado", async () => {
      vi.mocked(cashierService.confirmPayment).mockResolvedValue(paidOrderFixture);

      const response = await request(app)
        .patch("/api/cashier/orders/order-1/confirm-payment")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(200);
      expect(response.body.paymentStatus).toBe("PAGO");
      expect(cashierService.confirmPayment).toHaveBeenCalledWith("order-1", "caixa-1");
    });

    it("permite ADMIN confirmar pagamento", async () => {
      vi.mocked(cashierService.confirmPayment).mockResolvedValue(paidOrderFixture);

      const response = await request(app)
        .patch("/api/cashier/orders/order-1/confirm-payment")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it("não aceita nenhum total vindo do corpo da requisição", async () => {
      vi.mocked(cashierService.confirmPayment).mockResolvedValue(paidOrderFixture);

      await request(app)
        .patch("/api/cashier/orders/order-1/confirm-payment")
        .set("Authorization", `Bearer ${caixaToken}`)
        .send({ totalCents: 1 });

      expect(cashierService.confirmPayment).toHaveBeenCalledWith("order-1", "caixa-1");
    });

    it("mapeia ORDER_NOT_FOUND do service para 404", async () => {
      vi.mocked(cashierService.confirmPayment).mockRejectedValue(
        new AppError("Pedido não encontrado.", 404, ErrorCode.ORDER_NOT_FOUND),
      );

      const response = await request(app)
        .patch("/api/cashier/orders/inexistente/confirm-payment")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe(ErrorCode.ORDER_NOT_FOUND);
    });

    it("mapeia PAYMENT_ALREADY_CONFIRMED do service para 409", async () => {
      vi.mocked(cashierService.confirmPayment).mockRejectedValue(
        new AppError("Pagamento já confirmado.", 409, ErrorCode.PAYMENT_ALREADY_CONFIRMED),
      );

      const response = await request(app)
        .patch("/api/cashier/orders/order-1/confirm-payment")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe(ErrorCode.PAYMENT_ALREADY_CONFIRMED);
    });

    it("mapeia ORDER_CANCELLED do service para 409", async () => {
      vi.mocked(cashierService.confirmPayment).mockRejectedValue(
        new AppError("Pedido cancelado.", 409, ErrorCode.ORDER_CANCELLED),
      );

      const response = await request(app)
        .patch("/api/cashier/orders/order-1/confirm-payment")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe(ErrorCode.ORDER_CANCELLED);
    });

    it("mapeia PAYMENT_NOTHING_TO_CHARGE do service para 409", async () => {
      vi.mocked(cashierService.confirmPayment).mockRejectedValue(
        new AppError("Nada a cobrar.", 409, ErrorCode.PAYMENT_NOTHING_TO_CHARGE),
      );

      const response = await request(app)
        .patch("/api/cashier/orders/order-1/confirm-payment")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe(ErrorCode.PAYMENT_NOTHING_TO_CHARGE);
    });
  });
});
