import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../additional.service.js", () => ({
  listAdditionals: vi.fn(),
  createAdditional: vi.fn(),
  updateAdditional: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { AppError } from "../../../lib/app-error.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import { env } from "../../../config/env.js";
import * as additionalService from "../additional.service.js";

const app = createApp("http://localhost:5173");

function tokenFor(role: "ADMIN" | "ATENDENTE" | "CAIXA" | "PRODUCAO"): string {
  return jwt.sign(
    { id: "1", username: "user", name: "Usuário", role },
    env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

const adminToken = tokenFor("ADMIN");
const nonAdminToken = tokenFor("CAIXA");

const baseAdditional = {
  id: "add-1",
  name: "Queijo extra",
  priceCents: 300,
  active: true,
};

describe("/api/additionals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 sem token em GET, POST e PATCH", async () => {
    const getRes = await request(app).get("/api/additionals");
    const postRes = await request(app)
      .post("/api/additionals")
      .send({ name: "Queijo extra", priceCents: 300 });
    const patchRes = await request(app)
      .patch("/api/additionals/add-1")
      .send({ active: false });

    expect(getRes.status).toBe(401);
    expect(postRes.status).toBe(401);
    expect(patchRes.status).toBe(401);
    expect(getRes.body).toEqual({
      error: expect.any(String),
      code: ErrorCode.UNAUTHENTICATED,
    });
  });

  it("retorna 403 para usuário autenticado que não é ADMIN", async () => {
    const response = await request(app)
      .get("/api/additionals")
      .set("Authorization", `Bearer ${nonAdminToken}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ErrorCode.FORBIDDEN);
  });

  it("lista adicionais ordenados por nome", async () => {
    vi.mocked(additionalService.listAdditionals).mockResolvedValue([
      baseAdditional,
      { id: "add-2", name: "Bacon", priceCents: 400, active: false },
    ]);

    const response = await request(app)
      .get("/api/additionals")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
  });

  it("cria um adicional válido", async () => {
    vi.mocked(additionalService.createAdditional).mockResolvedValue(baseAdditional);

    const response = await request(app)
      .post("/api/additionals")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Queijo extra", priceCents: 300 });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe("Queijo extra");
    expect(additionalService.createAdditional).toHaveBeenCalledWith({
      name: "Queijo extra",
      priceCents: 300,
    });
  });

  it("retorna 400 quando o nome é vazio", async () => {
    const response = await request(app)
      .post("/api/additionals")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "   ", priceCents: 300 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(additionalService.createAdditional).not.toHaveBeenCalled();
  });

  it("retorna 400 quando priceCents é negativo", async () => {
    const response = await request(app)
      .post("/api/additionals")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Queijo extra", priceCents: -100 });

    expect(response.status).toBe(400);
    expect(additionalService.createAdditional).not.toHaveBeenCalled();
  });

  it("retorna 400 quando priceCents não é inteiro", async () => {
    const response = await request(app)
      .post("/api/additionals")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Queijo extra", priceCents: 3.5 });

    expect(response.status).toBe(400);
    expect(additionalService.createAdditional).not.toHaveBeenCalled();
  });

  it("edita o nome de um adicional", async () => {
    vi.mocked(additionalService.updateAdditional).mockResolvedValue({
      ...baseAdditional,
      name: "Queijo extra premium",
    });

    const response = await request(app)
      .patch("/api/additionals/add-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Queijo extra premium" });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Queijo extra premium");
  });

  it("edita o preço de um adicional", async () => {
    vi.mocked(additionalService.updateAdditional).mockResolvedValue({
      ...baseAdditional,
      priceCents: 350,
    });

    const response = await request(app)
      .patch("/api/additionals/add-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ priceCents: 350 });

    expect(response.status).toBe(200);
    expect(response.body.priceCents).toBe(350);
  });

  it("ativa/desativa um adicional", async () => {
    vi.mocked(additionalService.updateAdditional).mockResolvedValue({
      ...baseAdditional,
      active: false,
    });

    const response = await request(app)
      .patch("/api/additionals/add-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ active: false });

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(false);
  });

  it("retorna 400 quando o PATCH não envia nenhum campo", async () => {
    const response = await request(app)
      .patch("/api/additionals/add-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(additionalService.updateAdditional).not.toHaveBeenCalled();
  });

  it("retorna 404 ao editar adicional inexistente", async () => {
    vi.mocked(additionalService.updateAdditional).mockRejectedValue(
      new AppError("Adicional não encontrado.", 404, ErrorCode.ADDITIONAL_NOT_FOUND),
    );

    const response = await request(app)
      .patch("/api/additionals/inexistente")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ active: false });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "Adicional não encontrado.",
      code: ErrorCode.ADDITIONAL_NOT_FOUND,
    });
  });
});
