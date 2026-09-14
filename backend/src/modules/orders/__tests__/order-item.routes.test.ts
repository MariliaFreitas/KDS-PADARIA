import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../order-item.service.js", () => ({
  addOrderItem: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { AppError } from "../../../lib/app-error.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import { env } from "../../../config/env.js";
import * as orderItemService from "../order-item.service.js";

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

const createdItemFixture = {
  id: "item-1",
  orderId: "order-1",
  productId: "product-1",
  productNameSnapshot: "Pão francês",
  saleType: "UNIT",
  basePriceCentsSnapshot: 500,
  requiresProductionSnapshot: false,
  quantity: 2,
  weightGrams: null,
  variationId: null,
  variationNameSnapshot: null,
  stationIdSnapshot: null,
  stationNameSnapshot: null,
  status: "PENDENTE",
  totalCents: 1000,
  observation: null,
  includedAt: "2026-01-01T00:00:00.000Z",
  additionals: [],
};

describe("POST /api/orders/:orderId/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 sem autenticação", async () => {
    const response = await request(app)
      .post("/api/orders/order-1/items")
      .send({ productId: "product-1", quantity: 1 });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it("retorna 403 para PRODUCAO", async () => {
    const response = await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${producaoToken}`)
      .send({ productId: "product-1", quantity: 1 });

    expect(response.status).toBe(403);
    expect(orderItemService.addOrderItem).not.toHaveBeenCalled();
  });

  it("retorna 403 para CAIXA", async () => {
    const response = await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${caixaToken}`)
      .send({ productId: "product-1", quantity: 1 });

    expect(response.status).toBe(403);
    expect(orderItemService.addOrderItem).not.toHaveBeenCalled();
  });

  it("permite ATENDENTE adicionar item", async () => {
    vi.mocked(orderItemService.addOrderItem).mockResolvedValue(createdItemFixture as never);

    const response = await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${atendenteToken}`)
      .send({ productId: "product-1", quantity: 1 });

    expect(response.status).toBe(201);
    expect(response.body.totalCents).toBe(1000);
  });

  it("permite ADMIN adicionar item", async () => {
    vi.mocked(orderItemService.addOrderItem).mockResolvedValue(createdItemFixture as never);

    const response = await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ productId: "product-1", quantity: 1 });

    expect(response.status).toBe(201);
  });

  it("retorna 400 quando productId está ausente", async () => {
    const response = await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${atendenteToken}`)
      .send({ quantity: 1 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(orderItemService.addOrderItem).not.toHaveBeenCalled();
  });

  it("retorna 400 para quantity zero", async () => {
    const response = await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${atendenteToken}`)
      .send({ productId: "product-1", quantity: 0 });

    expect(response.status).toBe(400);
    expect(orderItemService.addOrderItem).not.toHaveBeenCalled();
  });

  it("retorna 400 para quantity decimal", async () => {
    const response = await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${atendenteToken}`)
      .send({ productId: "product-1", quantity: 1.5 });

    expect(response.status).toBe(400);
    expect(orderItemService.addOrderItem).not.toHaveBeenCalled();
  });

  it("retorna 400 para weightGrams decimal", async () => {
    const response = await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${atendenteToken}`)
      .send({ productId: "product-1", weightGrams: 100.5 });

    expect(response.status).toBe(400);
    expect(orderItemService.addOrderItem).not.toHaveBeenCalled();
  });

  it("retorna 400 para additionalId duplicado no mesmo item", async () => {
    const response = await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${atendenteToken}`)
      .send({
        productId: "product-1",
        quantity: 1,
        additionals: [
          { additionalId: "additional-1", quantity: 1 },
          { additionalId: "additional-1", quantity: 2 },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(orderItemService.addOrderItem).not.toHaveBeenCalled();
  });

  it("normaliza observation vazia para null e aplica trim", async () => {
    vi.mocked(orderItemService.addOrderItem).mockResolvedValue(createdItemFixture as never);

    await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${atendenteToken}`)
      .send({ productId: "product-1", quantity: 1, observation: "   " });

    expect(orderItemService.addOrderItem).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({ observation: null }),
    );
  });

  it("não aceita campos protegidos do cliente como fonte de verdade", async () => {
    vi.mocked(orderItemService.addOrderItem).mockResolvedValue(createdItemFixture as never);

    await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${atendenteToken}`)
      .send({
        productId: "product-1",
        quantity: 1,
        saleType: "WEIGHT",
        basePriceCentsSnapshot: 1,
        totalCents: 999999,
        status: "PRONTO",
        includedAt: "2020-01-01T00:00:00.000Z",
        stationIdSnapshot: "forjado",
        requiresProductionSnapshot: true,
        stationId: "forjado",
        stationName: "Estação forjada",
        stationNameSnapshot: "forjado",
      });

    const call = vi.mocked(orderItemService.addOrderItem).mock.calls[0][1];
    expect(call).not.toHaveProperty("saleType");
    expect(call).not.toHaveProperty("basePriceCentsSnapshot");
    expect(call).not.toHaveProperty("totalCents");
    expect(call).not.toHaveProperty("status");
    expect(call).not.toHaveProperty("includedAt");
    expect(call).not.toHaveProperty("stationIdSnapshot");
    expect(call).not.toHaveProperty("requiresProductionSnapshot");
    expect(call).not.toHaveProperty("stationId");
    expect(call).not.toHaveProperty("stationName");
    expect(call).not.toHaveProperty("stationNameSnapshot");
  });

  it("mapeia ORDER_NOT_FOUND do service para 404", async () => {
    vi.mocked(orderItemService.addOrderItem).mockRejectedValue(
      new AppError("Pedido não encontrado.", 404, ErrorCode.ORDER_NOT_FOUND),
    );

    const response = await request(app)
      .post("/api/orders/inexistente/items")
      .set("Authorization", `Bearer ${atendenteToken}`)
      .send({ productId: "product-1", quantity: 1 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "Pedido não encontrado.",
      code: ErrorCode.ORDER_NOT_FOUND,
    });
  });

  it("mapeia ORDER_NOT_OPEN do service para 409", async () => {
    vi.mocked(orderItemService.addOrderItem).mockRejectedValue(
      new AppError("Pedido fechado.", 409, ErrorCode.ORDER_NOT_OPEN),
    );

    const response = await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${atendenteToken}`)
      .send({ productId: "product-1", quantity: 1 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe(ErrorCode.ORDER_NOT_OPEN);
  });

  it("mapeia PRODUCT_NOT_AVAILABLE do service para 400", async () => {
    vi.mocked(orderItemService.addOrderItem).mockRejectedValue(
      new AppError("Produto indisponível.", 400, ErrorCode.PRODUCT_NOT_AVAILABLE),
    );

    const response = await request(app)
      .post("/api/orders/order-1/items")
      .set("Authorization", `Bearer ${atendenteToken}`)
      .send({ productId: "product-1", quantity: 1 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.PRODUCT_NOT_AVAILABLE);
  });
});
