import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../product-variation.service.js", () => ({
  listVariations: vi.fn(),
  createVariation: vi.fn(),
  updateVariation: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { AppError } from "../../../lib/app-error.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import { env } from "../../../config/env.js";
import * as variationService from "../product-variation.service.js";

const app = createApp("http://localhost:5173");

function tokenFor(role: "ADMIN" | "ATENDENTE" | "CAIXA" | "PRODUCAO"): string {
  return jwt.sign(
    { id: "1", username: "user", name: "Usuário", role },
    env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

const adminToken = tokenFor("ADMIN");
const nonAdminToken = tokenFor("ATENDENTE");

const baseVariation = {
  id: "var-1",
  productId: "prod-1",
  name: "Grande",
  priceCents: 2500,
};

const PRODUCT_PATH = "/api/products/prod-1/variations";

describe("/api/products/:productId/variations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 sem token em GET, POST e PATCH", async () => {
    const getRes = await request(app).get(PRODUCT_PATH);
    const postRes = await request(app).post(PRODUCT_PATH).send({ name: "Grande", priceCents: 2500 });
    const patchRes = await request(app)
      .patch(`${PRODUCT_PATH}/var-1`)
      .send({ priceCents: 3000 });

    expect(getRes.status).toBe(401);
    expect(postRes.status).toBe(401);
    expect(patchRes.status).toBe(401);
  });

  it("retorna 403 para usuário autenticado que não é ADMIN", async () => {
    const response = await request(app)
      .get(PRODUCT_PATH)
      .set("Authorization", `Bearer ${nonAdminToken}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ErrorCode.FORBIDDEN);
  });

  it("lista variações do produto", async () => {
    vi.mocked(variationService.listVariations).mockResolvedValue([baseVariation]);

    const response = await request(app)
      .get(PRODUCT_PATH)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(variationService.listVariations).toHaveBeenCalledWith("prod-1");
  });

  it("cria uma variação válida", async () => {
    vi.mocked(variationService.createVariation).mockResolvedValue(baseVariation);

    const response = await request(app)
      .post(PRODUCT_PATH)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Grande", priceCents: 2500 });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe("Grande");
    expect(variationService.createVariation).toHaveBeenCalledWith("prod-1", {
      name: "Grande",
      priceCents: 2500,
    });
  });

  it("retorna 400 quando o nome é vazio", async () => {
    const response = await request(app)
      .post(PRODUCT_PATH)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "   ", priceCents: 2500 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(variationService.createVariation).not.toHaveBeenCalled();
  });

  it("retorna 400 quando priceCents está ausente", async () => {
    const response = await request(app)
      .post(PRODUCT_PATH)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Grande" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(variationService.createVariation).not.toHaveBeenCalled();
  });

  it("retorna 400 quando priceCents é negativo", async () => {
    const response = await request(app)
      .post(PRODUCT_PATH)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Grande", priceCents: -100 });

    expect(response.status).toBe(400);
    expect(variationService.createVariation).not.toHaveBeenCalled();
  });

  it("retorna 400 quando priceCents não é inteiro", async () => {
    const response = await request(app)
      .post(PRODUCT_PATH)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Grande", priceCents: 25.5 });

    expect(response.status).toBe(400);
    expect(variationService.createVariation).not.toHaveBeenCalled();
  });

  it("propaga 404 do service quando o produto não existe", async () => {
    vi.mocked(variationService.createVariation).mockRejectedValue(
      new AppError("Produto não encontrado.", 404, ErrorCode.PRODUCT_NOT_FOUND),
    );

    const response = await request(app)
      .post(PRODUCT_PATH)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Grande", priceCents: 2500 });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
  });

  it("propaga 400 do service quando o produto não é VARIATION", async () => {
    vi.mocked(variationService.createVariation).mockRejectedValue(
      new AppError(
        "Este produto não aceita variações (a forma de venda não é VARIATION).",
        400,
        ErrorCode.PRODUCT_DOES_NOT_ACCEPT_VARIATIONS,
      ),
    );

    const response = await request(app)
      .post(PRODUCT_PATH)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Grande", priceCents: 2500 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.PRODUCT_DOES_NOT_ACCEPT_VARIATIONS);
  });

  it("edita o nome de uma variação", async () => {
    vi.mocked(variationService.updateVariation).mockResolvedValue({
      ...baseVariation,
      name: "Família",
    });

    const response = await request(app)
      .patch(`${PRODUCT_PATH}/var-1`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Família" });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Família");
    expect(variationService.updateVariation).toHaveBeenCalledWith("prod-1", "var-1", {
      name: "Família",
    });
  });

  it("edita o preço de uma variação", async () => {
    vi.mocked(variationService.updateVariation).mockResolvedValue({
      ...baseVariation,
      priceCents: 3200,
    });

    const response = await request(app)
      .patch(`${PRODUCT_PATH}/var-1`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ priceCents: 3200 });

    expect(response.status).toBe(200);
    expect(response.body.priceCents).toBe(3200);
  });

  it("retorna 400 quando o PATCH não envia nenhum campo", async () => {
    const response = await request(app)
      .patch(`${PRODUCT_PATH}/var-1`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(variationService.updateVariation).not.toHaveBeenCalled();
  });

  it("retorna 404 ao editar variação inexistente", async () => {
    vi.mocked(variationService.updateVariation).mockRejectedValue(
      new AppError("Variação não encontrada.", 404, ErrorCode.PRODUCT_VARIATION_NOT_FOUND),
    );

    const response = await request(app)
      .patch(`${PRODUCT_PATH}/inexistente`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ priceCents: 3200 });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe(ErrorCode.PRODUCT_VARIATION_NOT_FOUND);
  });

  it("retorna 404 ao tentar editar uma variação de outro produto", async () => {
    vi.mocked(variationService.updateVariation).mockRejectedValue(
      new AppError("Variação não encontrada.", 404, ErrorCode.PRODUCT_VARIATION_NOT_FOUND),
    );

    const response = await request(app)
      .patch(`${PRODUCT_PATH}/var-de-outro-produto`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ priceCents: 3200 });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe(ErrorCode.PRODUCT_VARIATION_NOT_FOUND);
  });
});
