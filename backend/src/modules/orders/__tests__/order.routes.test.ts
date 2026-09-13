import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../order.service.js", () => ({
  createOrder: vi.fn(),
  getOrderById: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { AppError } from "../../../lib/app-error.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import { env } from "../../../config/env.js";
import * as orderService from "../order.service.js";

const app = createApp("http://localhost:5173");

function tokenFor(
  role: "ADMIN" | "ATENDENTE" | "CAIXA" | "PRODUCAO",
  userId = "user-1",
): string {
  return jwt.sign(
    { id: userId, username: "user", name: "Usuário", role },
    env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

const adminToken = tokenFor("ADMIN", "admin-1");
const atendenteToken = tokenFor("ATENDENTE", "atendente-1");
const producaoToken = tokenFor("PRODUCAO", "producao-1");
const caixaToken = tokenFor("CAIXA", "caixa-1");

const baseOrder = {
  id: "order-1",
  orderNumber: 154,
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
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("/api/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/orders", () => {
    it("retorna 401 sem autenticação", async () => {
      const response = await request(app)
        .post("/api/orders")
        .send({ customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL" });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: expect.any(String),
        code: ErrorCode.UNAUTHENTICATED,
      });
    });

    it("retorna 403 para PRODUCAO", async () => {
      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${producaoToken}`)
        .send({ customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(ErrorCode.FORBIDDEN);
      expect(orderService.createOrder).not.toHaveBeenCalled();
    });

    it("retorna 403 para CAIXA", async () => {
      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${caixaToken}`)
        .send({ customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(ErrorCode.FORBIDDEN);
      expect(orderService.createOrder).not.toHaveBeenCalled();
    });

    it("permite ATENDENTE criar pedido", async () => {
      vi.mocked(orderService.createOrder).mockResolvedValue(baseOrder as never);

      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({ customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL" });

      expect(response.status).toBe(201);
      expect(orderService.createOrder).toHaveBeenCalledTimes(1);
    });

    it("permite ADMIN criar pedido", async () => {
      vi.mocked(orderService.createOrder).mockResolvedValue(baseOrder as never);

      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL" });

      expect(response.status).toBe(201);
    });

    it("retorna 400 quando o nome do cliente está ausente", async () => {
      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({ channel: "BALCAO", consumptionType: "LOCAL" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(orderService.createOrder).not.toHaveBeenCalled();
    });

    it("retorna 400 quando o nome do cliente está em branco", async () => {
      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({ customerName: "   ", channel: "BALCAO", consumptionType: "LOCAL" });

      expect(response.status).toBe(400);
      expect(orderService.createOrder).not.toHaveBeenCalled();
    });

    it("aplica trim no nome do cliente", async () => {
      vi.mocked(orderService.createOrder).mockResolvedValue(baseOrder as never);

      await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({ customerName: "  Maria  ", channel: "BALCAO", consumptionType: "LOCAL" });

      expect(orderService.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ customerName: "Maria" }),
        expect.any(String),
      );
    });

    it("retorna 400 para canal inválido", async () => {
      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({ customerName: "Maria", channel: "PIX", consumptionType: "LOCAL" });

      expect(response.status).toBe(400);
      expect(orderService.createOrder).not.toHaveBeenCalled();
    });

    it("retorna 400 para consumptionType inválido", async () => {
      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({ customerName: "Maria", channel: "BALCAO", consumptionType: "DELIVERY" });

      expect(response.status).toBe(400);
      expect(orderService.createOrder).not.toHaveBeenCalled();
    });

    it.each([
      ["BALCAO", "LOCAL"],
      ["BALCAO", "VIAGEM"],
      ["WHATSAPP", "LOCAL"],
      ["WHATSAPP", "VIAGEM"],
    ])("cria pedido com canal %s e consumo %s", async (channel, consumptionType) => {
      vi.mocked(orderService.createOrder).mockResolvedValue({
        ...baseOrder,
        channel,
        consumptionType,
      } as never);

      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({ customerName: "Maria", channel, consumptionType });

      expect(response.status).toBe(201);
      expect(orderService.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ channel, consumptionType }),
        expect.any(String),
      );
    });

    it("aceita pedido sem pickupTime (omitido)", async () => {
      vi.mocked(orderService.createOrder).mockResolvedValue(baseOrder as never);

      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({ customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL" });

      expect(response.status).toBe(201);
      expect(orderService.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ pickupTime: null }),
        expect.any(String),
      );
    });

    it("aceita pickupTime válido e converte para Date", async () => {
      vi.mocked(orderService.createOrder).mockResolvedValue(baseOrder as never);

      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({
          customerName: "Maria",
          channel: "WHATSAPP",
          consumptionType: "LOCAL",
          pickupTime: "2026-02-01T18:00:00.000Z",
        });

      expect(response.status).toBe(201);
      const call = vi.mocked(orderService.createOrder).mock.calls[0][0];
      expect(call.pickupTime).toBeInstanceOf(Date);
      expect((call.pickupTime as Date).toISOString()).toBe("2026-02-01T18:00:00.000Z");
    });

    it("retorna 400 para pickupTime inválido", async () => {
      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({
          customerName: "Maria",
          channel: "WHATSAPP",
          consumptionType: "LOCAL",
          pickupTime: "não-é-uma-data",
        });

      expect(response.status).toBe(400);
      expect(orderService.createOrder).not.toHaveBeenCalled();
    });

    it("usa o id do usuário autenticado como createdByUserId, ignorando o corpo", async () => {
      vi.mocked(orderService.createOrder).mockResolvedValue(baseOrder as never);

      await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({
          customerName: "Maria",
          channel: "BALCAO",
          consumptionType: "LOCAL",
          createdByUserId: "outro-usuario-forjado",
        });

      expect(orderService.createOrder).toHaveBeenCalledWith(
        expect.not.objectContaining({ createdByUserId: expect.anything() }),
        "atendente-1",
      );
    });

    it("retorna paymentStatus PENDENTE no pedido criado", async () => {
      vi.mocked(orderService.createOrder).mockResolvedValue(baseOrder as never);

      const response = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({ customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL" });

      expect(response.body.paymentStatus).toBe("PENDENTE");
    });

    it("ignora campos protegidos enviados pelo cliente (orderNumber, paymentStatus, createdAt, id)", async () => {
      vi.mocked(orderService.createOrder).mockResolvedValue(baseOrder as never);

      await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${atendenteToken}`)
        .send({
          customerName: "Maria",
          channel: "BALCAO",
          consumptionType: "LOCAL",
          id: "id-forjado",
          orderNumber: 999,
          paymentStatus: "PAGO",
          createdAt: "2020-01-01T00:00:00.000Z",
        });

      const call = vi.mocked(orderService.createOrder).mock.calls[0][0];
      expect(call).not.toHaveProperty("id");
      expect(call).not.toHaveProperty("orderNumber");
      expect(call).not.toHaveProperty("paymentStatus");
      expect(call).not.toHaveProperty("createdAt");
    });
  });

  describe("GET /api/orders/:orderId", () => {
    it("retorna o pedido existente", async () => {
      vi.mocked(orderService.getOrderById).mockResolvedValue({
        ...baseOrder,
        items: [],
      } as never);

      const response = await request(app)
        .get("/api/orders/order-1")
        .set("Authorization", `Bearer ${atendenteToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe("order-1");
      expect(response.body.items).toEqual([]);
    });

    it("retorna 404 ORDER_NOT_FOUND para pedido inexistente", async () => {
      vi.mocked(orderService.getOrderById).mockRejectedValue(
        new AppError("Pedido não encontrado.", 404, ErrorCode.ORDER_NOT_FOUND),
      );

      const response = await request(app)
        .get("/api/orders/inexistente")
        .set("Authorization", `Bearer ${atendenteToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: "Pedido não encontrado.",
        code: ErrorCode.ORDER_NOT_FOUND,
      });
    });

    it("retorna 401 sem autenticação", async () => {
      const response = await request(app).get("/api/orders/order-1");

      expect(response.status).toBe(401);
      expect(orderService.getOrderById).not.toHaveBeenCalled();
    });

    it("retorna 403 para role não autorizada (PRODUCAO)", async () => {
      const response = await request(app)
        .get("/api/orders/order-1")
        .set("Authorization", `Bearer ${producaoToken}`);

      expect(response.status).toBe(403);
      expect(orderService.getOrderById).not.toHaveBeenCalled();
    });
  });
});
