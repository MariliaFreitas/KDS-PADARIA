import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../auth.service.js", () => ({
  login: vi.fn(),
}));

import { createApp } from "../../../app.js";
import { AppError } from "../../../lib/app-error.js";
import { ErrorCode } from "../../../lib/error-codes.js";
import * as authService from "../auth.service.js";

const app = createApp("http://localhost:5173");

describe("POST /api/auth/login", () => {
  it("retorna 400 quando faltam campos obrigatórios", async () => {
    const response = await request(app).post("/api/auth/login").send({});

    expect(response.status).toBe(400);
  });

  it("retorna 400 quando o payload tem tipos inválidos", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: 123, password: null });

    expect(response.status).toBe(400);
  });

  it("retorna 400 quando username é uma string vazia", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "", password: "algo" });

    expect(response.status).toBe(400);
  });

  it("retorna 200 e o token quando as credenciais são válidas", async () => {
    vi.mocked(authService.login).mockResolvedValue({
      token: "fake-token",
      user: { id: "1", username: "admin", name: "Administrador", role: "ADMIN" },
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });

    expect(response.status).toBe(200);
    expect(response.body.token).toBe("fake-token");
    expect(response.body.user).not.toHaveProperty("passwordHash");
  });

  it("retorna 401 quando as credenciais são inválidas", async () => {
    vi.mocked(authService.login).mockRejectedValue(
      new AppError(
        "Usuário ou senha inválidos.",
        401,
        ErrorCode.INVALID_CREDENTIALS,
      ),
    );

    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "errada" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Usuário ou senha inválidos.");
    expect(response.body.code).toBe(ErrorCode.INVALID_CREDENTIALS);
  });
});
