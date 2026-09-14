import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../catalog.service.js", () => ({
  getCatalog: vi.fn(),
}));
vi.mock("../order.service.js", () => ({
  createOrder: vi.fn(),
  getOrderById: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import { env } from "../../../config/env.js";
import * as catalogService from "../catalog.service.js";
import * as orderService from "../order.service.js";

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

const catalogFixture = {
  products: [
    {
      id: "product-1",
      name: "Pão francês",
      active: true,
      available: true,
      saleType: "UNIT",
      unitPriceCents: 500,
      pricePerKgCents: null,
      requiresProduction: false,
      stationId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      variations: [],
    },
  ],
  additionals: [{ id: "additional-1", name: "Manteiga", priceCents: 150, active: true }],
};

describe("GET /api/orders/catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 sem autenticação", async () => {
    const response = await request(app).get("/api/orders/catalog");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it("retorna 403 para PRODUCAO", async () => {
    const response = await request(app)
      .get("/api/orders/catalog")
      .set("Authorization", `Bearer ${producaoToken}`);

    expect(response.status).toBe(403);
    expect(catalogService.getCatalog).not.toHaveBeenCalled();
  });

  it("retorna 403 para CAIXA", async () => {
    const response = await request(app)
      .get("/api/orders/catalog")
      .set("Authorization", `Bearer ${caixaToken}`);

    expect(response.status).toBe(403);
    expect(catalogService.getCatalog).not.toHaveBeenCalled();
  });

  it("permite ATENDENTE consultar o catálogo", async () => {
    vi.mocked(catalogService.getCatalog).mockResolvedValue(catalogFixture as never);

    const response = await request(app)
      .get("/api/orders/catalog")
      .set("Authorization", `Bearer ${atendenteToken}`);

    expect(response.status).toBe(200);
    expect(response.body.products).toHaveLength(1);
    expect(response.body.additionals).toHaveLength(1);
  });

  it("permite ADMIN consultar o catálogo", async () => {
    vi.mocked(catalogService.getCatalog).mockResolvedValue(catalogFixture as never);

    const response = await request(app)
      .get("/api/orders/catalog")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
  });

  it("resolve 'catalog' pela rota estática, sem tratá-lo como orderId", async () => {
    vi.mocked(catalogService.getCatalog).mockResolvedValue(catalogFixture as never);

    await request(app).get("/api/orders/catalog").set("Authorization", `Bearer ${adminToken}`);

    expect(catalogService.getCatalog).toHaveBeenCalledTimes(1);
    expect(orderService.getOrderById).not.toHaveBeenCalled();
  });
});
