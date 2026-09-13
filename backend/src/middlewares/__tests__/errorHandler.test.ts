import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { z } from "zod";
import { errorHandler } from "../errorHandler.js";
import { notFoundHandler } from "../notFoundHandler.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";
import { asyncHandler } from "../../lib/async-handler.js";

function buildApp() {
  const app = express();
  app.use(express.json());

  app.post("/zod", (req, res) => {
    z.object({ nome: z.string().min(1) }).parse(req.body);
    res.json({ ok: true });
  });

  app.get("/app-error", () => {
    throw new AppError("Estação não encontrada.", 404, ErrorCode.ROUTE_NOT_FOUND);
  });

  app.get(
    "/erro-desconhecido",
    asyncHandler(async () => {
      throw new Error("falha inesperada");
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("contrato de erro da API", () => {
  it("ZodError vira 400 com code VALIDATION_ERROR e details", async () => {
    const res = await request(buildApp()).post("/zod").send({ nome: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(res.body.error).toBe("Dados inválidos.");
    expect(res.body.details).toHaveProperty("nome");
  });

  it("AppError preserva statusCode e code", async () => {
    const res = await request(buildApp()).get("/app-error");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.ROUTE_NOT_FOUND);
    expect(res.body.error).toBe("Estação não encontrada.");
  });

  it("erro desconhecido vira 500 com code INTERNAL_ERROR e não vaza detalhes", async () => {
    const res = await request(buildApp()).get("/erro-desconhecido");

    expect(res.status).toBe(500);
    expect(res.body.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(res.body.error).toBe("Erro interno do servidor.");
    expect(JSON.stringify(res.body)).not.toContain("falha inesperada");
  });

  it("toda resposta de erro tem os campos error e code", async () => {
    const app = buildApp();
    const respostas = await Promise.all([
      request(app).post("/zod").send({ nome: "" }),
      request(app).get("/app-error"),
      request(app).get("/erro-desconhecido"),
      request(app).get("/rota-inexistente"),
    ]);

    for (const res of respostas) {
      expect(typeof res.body.error).toBe("string");
      expect(typeof res.body.code).toBe("string");
    }
  });
});

// D1 — antes desta correção, corpo malformado devolvia 500.
describe("D1 — corpo JSON malformado", () => {
  it("devolve 400 em JSON com code INVALID_JSON", async () => {
    const res = await request(buildApp())
      .post("/zod")
      .set("Content-Type", "application/json")
      .send('{"nome": "teste",,,}');

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.code).toBe(ErrorCode.INVALID_JSON);
  });
});

// D2 — antes desta correção, rota inexistente devolvia página HTML.
describe("D2 — rota inexistente", () => {
  it("devolve 404 em JSON com code ROUTE_NOT_FOUND", async () => {
    const res = await request(buildApp()).get("/api/nao-existe");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.code).toBe(ErrorCode.ROUTE_NOT_FOUND);
  });

  it("não engole rotas válidas registradas antes dele", async () => {
    const res = await request(buildApp()).post("/zod").send({ nome: "válido" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
