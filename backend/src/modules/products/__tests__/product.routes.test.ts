import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../product.service.js", () => ({
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { AppError } from "../../../lib/app-error.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import { env } from "../../../config/env.js";
import * as productService from "../product.service.js";

const app = createApp("http://localhost:5173");

function tokenFor(role: "ADMIN" | "ATENDENTE" | "CAIXA" | "PRODUCAO"): string {
  return jwt.sign(
    { id: "1", username: "user", name: "Usuário", role },
    env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

const adminToken = tokenFor("ADMIN");
const nonAdminToken = tokenFor("PRODUCAO");

const baseProduct = {
  id: "p1",
  name: "Pão francês",
  active: true,
  available: true,
  saleType: "UNIT",
  unitPriceCents: 50,
  pricePerKgCents: null,
  requiresProduction: false,
  stationId: null,
  station: null,
};

describe("/api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 sem token em GET, POST e PATCH", async () => {
    const getRes = await request(app).get("/api/products");
    const postRes = await request(app)
      .post("/api/products")
      .send({ name: "Pão", saleType: "UNIT", unitPriceCents: 50 });
    const patchRes = await request(app).patch("/api/products/1").send({ active: false });

    expect(getRes.status).toBe(401);
    expect(postRes.status).toBe(401);
    expect(patchRes.status).toBe(401);
  });

  it("retorna 403 para usuário autenticado que não é ADMIN", async () => {
    const response = await request(app)
      .get("/api/products")
      .set("Authorization", `Bearer ${nonAdminToken}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ErrorCode.FORBIDDEN);
  });

  it("lista produtos ativos e inativos", async () => {
    vi.mocked(productService.listProducts).mockResolvedValue([
      baseProduct,
      { ...baseProduct, id: "p2", name: "Bolo de fubá", active: false },
    ]);

    const response = await request(app)
      .get("/api/products")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
  });

  it("cria um produto UNIT válido", async () => {
    vi.mocked(productService.createProduct).mockResolvedValue(baseProduct);

    const response = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Pão francês", saleType: "UNIT", unitPriceCents: 50 });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe("Pão francês");
  });

  it("retorna 400 quando o nome é vazio", async () => {
    const response = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "   ", saleType: "UNIT", unitPriceCents: 50 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(productService.createProduct).not.toHaveBeenCalled();
  });

  it("retorna 400 quando saleType não é um valor válido", async () => {
    const response = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Pão", saleType: "KG" });

    expect(response.status).toBe(400);
    expect(productService.createProduct).not.toHaveBeenCalled();
  });

  it("propaga erro controlado do service (UNIT sem preço) como 400", async () => {
    vi.mocked(productService.createProduct).mockRejectedValue(
      new AppError(
        "Produto por unidade exige preço unitário (unitPriceCents).",
        400,
        ErrorCode.PRODUCT_PRICE_FIELDS_INVALID,
      ),
    );

    const response = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Pão francês", saleType: "UNIT" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.PRODUCT_PRICE_FIELDS_INVALID);
  });

  it("propaga erro controlado do service (produção sem estação) como 400", async () => {
    vi.mocked(productService.createProduct).mockRejectedValue(
      new AppError(
        "Produto que exige produção precisa de uma estação (stationId).",
        400,
        ErrorCode.PRODUCT_STATION_REQUIRED,
      ),
    );

    const response = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Pão francês", saleType: "UNIT", unitPriceCents: 50, requiresProduction: true });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.PRODUCT_STATION_REQUIRED);
  });

  it("propaga erro controlado do service (estação inexistente) como 404", async () => {
    vi.mocked(productService.createProduct).mockRejectedValue(
      new AppError("Estação não encontrada.", 404, ErrorCode.STATION_NOT_FOUND),
    );

    const response = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Pão francês",
        saleType: "UNIT",
        unitPriceCents: 50,
        requiresProduction: true,
        stationId: "inexistente",
      });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe(ErrorCode.STATION_NOT_FOUND);
  });

  it("edita o nome de um produto", async () => {
    vi.mocked(productService.updateProduct).mockResolvedValue({
      ...baseProduct,
      name: "Pão francês grande",
    });

    const response = await request(app)
      .patch("/api/products/p1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Pão francês grande" });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Pão francês grande");
  });

  it("retorna 400 quando o PATCH não envia nenhum campo", async () => {
    const response = await request(app)
      .patch("/api/products/p1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(productService.updateProduct).not.toHaveBeenCalled();
  });

  it("retorna 404 ao editar produto inexistente", async () => {
    vi.mocked(productService.updateProduct).mockRejectedValue(
      new AppError("Produto não encontrado.", 404, ErrorCode.PRODUCT_NOT_FOUND),
    );

    const response = await request(app)
      .patch("/api/products/inexistente")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ active: false });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
  });

  it("ativa/desativa e marca disponível/indisponível via PATCH", async () => {
    vi.mocked(productService.updateProduct).mockResolvedValue({
      ...baseProduct,
      active: false,
      available: false,
    });

    const response = await request(app)
      .patch("/api/products/p1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ active: false, available: false });

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(false);
    expect(response.body.available).toBe(false);
  });
});
