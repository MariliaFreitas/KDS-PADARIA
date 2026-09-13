import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { authenticate } from "../authenticate.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";
import { env } from "../../config/env.js";

function buildRequest(authorizationHeader?: string): Request {
  return { headers: { authorization: authorizationHeader } } as unknown as Request;
}

describe("authenticate middleware", () => {
  it("chama next() e anexa req.user quando o token é válido", () => {
    const token = jwt.sign(
      { id: "1", username: "admin", name: "Administrador", role: "ADMIN" },
      env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const req = buildRequest(`Bearer ${token}`);
    let nextCalled = false;

    authenticate(req, {} as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.user?.username).toBe("admin");
  });

  it("lança AppError 401 quando o token está ausente", () => {
    const req = buildRequest(undefined);

    expect(() => authenticate(req, {} as Response, () => undefined)).toThrow(AppError);
  });

  it("lança AppError 401 quando o token é inválido", () => {
    const req = buildRequest("Bearer token-invalido");

    expect(() => authenticate(req, {} as Response, () => undefined)).toThrow(AppError);
  });

  it("lança AppError 401 quando o token está expirado", () => {
    const expiredToken = jwt.sign(
      { id: "1", username: "admin", name: "Administrador", role: "ADMIN" },
      env.JWT_SECRET,
      { expiresIn: -10 }, // já expirado no momento da emissão
    );
    const req = buildRequest(`Bearer ${expiredToken}`);

    expect(() => authenticate(req, {} as Response, () => undefined)).toThrow(AppError);
  });

  it("lança AppError 401 quando o header Authorization não usa o prefixo Bearer", () => {
    const token = jwt.sign(
      { id: "1", username: "admin", name: "Administrador", role: "ADMIN" },
      env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    // Header malformado: token presente, mas sem o prefixo "Bearer ".
    const req = buildRequest(token);

    expect(() => authenticate(req, {} as Response, () => undefined)).toThrow(AppError);
  });

  it("lança AppError 401 quando o header usa outro esquema de autenticação (ex: Basic)", () => {
    const req = buildRequest("Basic dXNlcjpwYXNz");

    expect(() => authenticate(req, {} as Response, () => undefined)).toThrow(AppError);
  });
  it("usa o code TOKEN_EXPIRED quando o token está expirado", () => {
    const expiredToken = jwt.sign(
      { id: "1", username: "admin", name: "Administrador", role: "ADMIN" },
      env.JWT_SECRET,
      { expiresIn: -10 },
    );
    const req = buildRequest(`Bearer ${expiredToken}`);

    try {
      authenticate(req, {} as Response, () => undefined);
      throw new Error("deveria ter lançado");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.TOKEN_EXPIRED);
    }
  });

  it("usa o code UNAUTHENTICATED quando o token é inválido", () => {
    const req = buildRequest("Bearer token-invalido");

    try {
      authenticate(req, {} as Response, () => undefined);
      throw new Error("deveria ter lançado");
    } catch (error) {
      expect((error as AppError).code).toBe(ErrorCode.UNAUTHENTICATED);
    }
  });
});
