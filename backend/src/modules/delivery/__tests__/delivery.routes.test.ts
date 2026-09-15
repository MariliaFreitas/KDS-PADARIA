import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../delivery.service.js", () => ({
  listPendingDeliveryOrders: vi.fn(),
  deliverItem: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { AppError } from "../../../lib/app-error.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import { env } from "../../../config/env.js";
import * as deliveryService from "../delivery.service.js";

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

const deliveryOrderFixture = {
  id: "order-1",
  serviceNumber: 27,
  customerName: "Maria",
  channel: "BALCAO" as const,
  consumptionType: "LOCAL" as const,
  paymentStatus: "PENDENTE" as const,
  createdAt: new Date("2026-01-01T09:00:00.000Z"),
  items: [
    {
      id: "item-1",
      productNameSnapshot: "Coxinha",
      quantity: 2,
      weightGrams: null,
      variationNameSnapshot: null,
      additionals: [],
      requiresProductionSnapshot: true,
      status: "PRONTO" as const,
      deliveredAt: null,
    },
  ],
};

const deliveredItemFixture = {
  id: "item-1",
  orderId: "order-1",
  productId: "product-1",
  productNameSnapshot: "Coxinha",
  saleType: "UNIT" as const,
  basePriceCentsSnapshot: 500,
  requiresProductionSnapshot: true,
  quantity: 2,
  weightGrams: null,
  variationId: null,
  variationNameSnapshot: null,
  stationIdSnapshot: "station-1",
  stationNameSnapshot: "Estação 1",
  status: "PRONTO" as const,
  totalCents: 1000,
  observation: null,
  includedAt: new Date("2026-01-01T10:00:00.000Z"),
  deliveredAt: new Date("2026-01-01T12:00:00.000Z"),
};

describe("/api/delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/delivery/orders", () => {
    it("retorna 401 sem autenticação", async () => {
      const response = await request(app).get("/api/delivery/orders");

      expect(response.status).toBe(401);
      expect(response.body.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    it("retorna 403 para ATENDENTE", async () => {
      const response = await request(app)
        .get("/api/delivery/orders")
        .set("Authorization", `Bearer ${atendenteToken}`);

      expect(response.status).toBe(403);
      expect(deliveryService.listPendingDeliveryOrders).not.toHaveBeenCalled();
    });

    it("retorna 403 para PRODUCAO", async () => {
      const response = await request(app)
        .get("/api/delivery/orders")
        .set("Authorization", `Bearer ${producaoToken}`);

      expect(response.status).toBe(403);
      expect(deliveryService.listPendingDeliveryOrders).not.toHaveBeenCalled();
    });

    it("retorna 403 para ADMIN — acesso não é concedido automaticamente nesta etapa", async () => {
      const response = await request(app)
        .get("/api/delivery/orders")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(403);
      expect(deliveryService.listPendingDeliveryOrders).not.toHaveBeenCalled();
    });

    it("permite CAIXA consultar a lista", async () => {
      vi.mocked(deliveryService.listPendingDeliveryOrders).mockResolvedValue([deliveryOrderFixture]);

      const response = await request(app)
        .get("/api/delivery/orders")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(deliveryService.listPendingDeliveryOrders).toHaveBeenCalledWith(undefined);
    });

    it("repassa o parâmetro search para o service", async () => {
      vi.mocked(deliveryService.listPendingDeliveryOrders).mockResolvedValue([]);

      await request(app)
        .get("/api/delivery/orders?search=%2327")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(deliveryService.listPendingDeliveryOrders).toHaveBeenCalledWith("#27");
    });
  });

  describe("PATCH /api/delivery/orders/:orderId/items/:itemId/deliver", () => {
    it("retorna 401 sem autenticação", async () => {
      const response = await request(app).patch(
        "/api/delivery/orders/order-1/items/item-1/deliver",
      );

      expect(response.status).toBe(401);
      expect(deliveryService.deliverItem).not.toHaveBeenCalled();
    });

    it("retorna 403 para ATENDENTE", async () => {
      const response = await request(app)
        .patch("/api/delivery/orders/order-1/items/item-1/deliver")
        .set("Authorization", `Bearer ${atendenteToken}`);

      expect(response.status).toBe(403);
      expect(deliveryService.deliverItem).not.toHaveBeenCalled();
    });

    it("retorna 403 para PRODUCAO", async () => {
      const response = await request(app)
        .patch("/api/delivery/orders/order-1/items/item-1/deliver")
        .set("Authorization", `Bearer ${producaoToken}`);

      expect(response.status).toBe(403);
      expect(deliveryService.deliverItem).not.toHaveBeenCalled();
    });

    it("retorna 403 para ADMIN — acesso não é concedido automaticamente nesta etapa", async () => {
      const response = await request(app)
        .patch("/api/delivery/orders/order-1/items/item-1/deliver")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(403);
      expect(deliveryService.deliverItem).not.toHaveBeenCalled();
    });

    it("permite CAIXA entregar um item, usando o id do usuário autenticado", async () => {
      vi.mocked(deliveryService.deliverItem).mockResolvedValue(deliveredItemFixture);

      const response = await request(app)
        .patch("/api/delivery/orders/order-1/items/item-1/deliver")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(200);
      expect(response.body.deliveredAt).not.toBeNull();
      expect(deliveryService.deliverItem).toHaveBeenCalledWith("order-1", "item-1", "caixa-1");
    });

    it("mapeia ORDER_NOT_FOUND do service para 404", async () => {
      vi.mocked(deliveryService.deliverItem).mockRejectedValue(
        new AppError("Pedido não encontrado.", 404, ErrorCode.ORDER_NOT_FOUND),
      );

      const response = await request(app)
        .patch("/api/delivery/orders/inexistente/items/item-1/deliver")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe(ErrorCode.ORDER_NOT_FOUND);
    });

    it("mapeia ORDER_ITEM_NOT_FOUND do service para 404", async () => {
      vi.mocked(deliveryService.deliverItem).mockRejectedValue(
        new AppError("Item não encontrado.", 404, ErrorCode.ORDER_ITEM_NOT_FOUND),
      );

      const response = await request(app)
        .patch("/api/delivery/orders/order-1/items/inexistente/deliver")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe(ErrorCode.ORDER_ITEM_NOT_FOUND);
    });

    it("mapeia ORDER_CANCELLED do service para 409", async () => {
      vi.mocked(deliveryService.deliverItem).mockRejectedValue(
        new AppError("Pedido cancelado.", 409, ErrorCode.ORDER_CANCELLED),
      );

      const response = await request(app)
        .patch("/api/delivery/orders/order-1/items/item-1/deliver")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe(ErrorCode.ORDER_CANCELLED);
    });

    it("mapeia ORDER_ITEM_CANCELLED do service para 409", async () => {
      vi.mocked(deliveryService.deliverItem).mockRejectedValue(
        new AppError("Item cancelado.", 409, ErrorCode.ORDER_ITEM_CANCELLED),
      );

      const response = await request(app)
        .patch("/api/delivery/orders/order-1/items/item-1/deliver")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe(ErrorCode.ORDER_ITEM_CANCELLED);
    });

    it("mapeia ORDER_ITEM_ALREADY_DELIVERED do service para 409", async () => {
      vi.mocked(deliveryService.deliverItem).mockRejectedValue(
        new AppError("Já entregue.", 409, ErrorCode.ORDER_ITEM_ALREADY_DELIVERED),
      );

      const response = await request(app)
        .patch("/api/delivery/orders/order-1/items/item-1/deliver")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe(ErrorCode.ORDER_ITEM_ALREADY_DELIVERED);
    });

    it("mapeia ORDER_ITEM_NOT_READY_FOR_DELIVERY do service para 409", async () => {
      vi.mocked(deliveryService.deliverItem).mockRejectedValue(
        new AppError("Ainda não está pronto.", 409, ErrorCode.ORDER_ITEM_NOT_READY_FOR_DELIVERY),
      );

      const response = await request(app)
        .patch("/api/delivery/orders/order-1/items/item-1/deliver")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe(ErrorCode.ORDER_ITEM_NOT_READY_FOR_DELIVERY);
    });

    it("mapeia PAYMENT_REQUIRED_FOR_DELIVERY do service para 409", async () => {
      vi.mocked(deliveryService.deliverItem).mockRejectedValue(
        new AppError("Falta pagar.", 409, ErrorCode.PAYMENT_REQUIRED_FOR_DELIVERY),
      );

      const response = await request(app)
        .patch("/api/delivery/orders/order-1/items/item-1/deliver")
        .set("Authorization", `Bearer ${caixaToken}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe(ErrorCode.PAYMENT_REQUIRED_FOR_DELIVERY);
    });
  });
});
