import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

/**
 * D7 — este teste também serve de verificação do desacoplamento: ele monta o
 * app inteiro e não deve exigir que o Prisma Client esteja gerado, porque
 * /health não toca o banco. Se voltar a falhar com "@prisma/client did not
 * initialize yet", o acoplamento foi reintroduzido.
 */
describe("GET /health", () => {
  it("retorna status ok", async () => {
    const app = createApp("http://localhost:5173");
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "kds-padaria-backend" });
  });
});
