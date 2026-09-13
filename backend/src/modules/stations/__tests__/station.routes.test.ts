import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../station.service.js", () => ({
  listStations: vi.fn(),
  createStation: vi.fn(),
  updateStation: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { AppError } from "../../../lib/app-error.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import { env } from "../../../config/env.js";
import * as stationService from "../station.service.js";

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

describe("/api/stations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 sem token em GET, POST e PATCH", async () => {
    const getRes = await request(app).get("/api/stations");
    const postRes = await request(app).post("/api/stations").send({ name: "Forno" });
    const patchRes = await request(app).patch("/api/stations/1").send({ active: false });

    expect(getRes.status).toBe(401);
    expect(postRes.status).toBe(401);
    expect(patchRes.status).toBe(401);
    expect(getRes.body.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it("retorna 403 para usuário autenticado que não é ADMIN", async () => {
    const response = await request(app)
      .get("/api/stations")
      .set("Authorization", `Bearer ${nonAdminToken}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ErrorCode.FORBIDDEN);
  });

  it("lista estações ativas e inativas", async () => {
    vi.mocked(stationService.listStations).mockResolvedValue([
      { id: "1", name: "Chapa", active: true },
      { id: "2", name: "Forno", active: false },
    ]);

    const response = await request(app)
      .get("/api/stations")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
  });

  it("cria uma estação com nome válido", async () => {
    vi.mocked(stationService.createStation).mockResolvedValue({
      id: "1",
      name: "Forno",
      active: true,
    });

    const response = await request(app)
      .post("/api/stations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Forno" });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe("Forno");
    expect(stationService.createStation).toHaveBeenCalledWith({ name: "Forno" });
  });

  it("retorna 400 quando o nome é vazio ou só espaços", async () => {
    const response = await request(app)
      .post("/api/stations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "   " });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(stationService.createStation).not.toHaveBeenCalled();
  });

  it("retorna 409 quando o nome já existe", async () => {
    vi.mocked(stationService.createStation).mockRejectedValue(
      new AppError(
        "Já existe uma estação com esse nome.",
        409,
        ErrorCode.STATION_NAME_ALREADY_EXISTS,
      ),
    );

    const response = await request(app)
      .post("/api/stations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Forno" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe(ErrorCode.STATION_NAME_ALREADY_EXISTS);
  });

  it("edita o nome de uma estação", async () => {
    vi.mocked(stationService.updateStation).mockResolvedValue({
      id: "1",
      name: "Forno a lenha",
      active: true,
    });

    const response = await request(app)
      .patch("/api/stations/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Forno a lenha" });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Forno a lenha");
    expect(stationService.updateStation).toHaveBeenCalledWith("1", { name: "Forno a lenha" });
  });

  it("ativa/desativa uma estação", async () => {
    vi.mocked(stationService.updateStation).mockResolvedValue({
      id: "1",
      name: "Forno",
      active: false,
    });

    const response = await request(app)
      .patch("/api/stations/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ active: false });

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(false);
  });

  it("retorna 400 quando o PATCH não envia nenhum campo", async () => {
    const response = await request(app)
      .patch("/api/stations/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(stationService.updateStation).not.toHaveBeenCalled();
  });

  it("retorna 404 ao editar estação inexistente", async () => {
    vi.mocked(stationService.updateStation).mockRejectedValue(
      new AppError("Estação não encontrada.", 404, ErrorCode.STATION_NOT_FOUND),
    );

    const response = await request(app)
      .patch("/api/stations/inexistente")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ active: false });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe(ErrorCode.STATION_NOT_FOUND);
  });
});
