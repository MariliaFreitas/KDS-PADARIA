import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import { authorize } from "../authorize.js";
import { AppError } from "../../lib/app-error.js";
import type { AuthenticatedUser } from "../../modules/auth/auth.types.js";

function buildRequest(role?: AuthenticatedUser["role"]): Request {
  const user: AuthenticatedUser | undefined = role
    ? { id: "1", username: "x", name: "X", role }
    : undefined;
  return { user } as unknown as Request;
}

describe("authorize middleware", () => {
  it("chama next() quando o perfil está na lista permitida", () => {
    const middleware = authorize("ADMIN", "CAIXA");
    const req = buildRequest("CAIXA");
    let nextCalled = false;

    middleware(req, {} as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it("lança AppError 403 quando o perfil não está autorizado", () => {
    const middleware = authorize("ADMIN");
    const req = buildRequest("ATENDENTE");

    expect(() => middleware(req, {} as Response, () => undefined)).toThrow(AppError);
  });

  it("lança AppError 401 quando não há usuário autenticado em req", () => {
    const middleware = authorize("ADMIN");
    const req = buildRequest(undefined);

    expect(() => middleware(req, {} as Response, () => undefined)).toThrow(AppError);
  });
});
