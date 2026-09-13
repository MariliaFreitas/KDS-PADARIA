import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { ErrorCode } from "../lib/error-codes.js";

/**
 * Restringe uma rota a uma lista de perfis, sem nenhuma hierarquia entre
 * eles (conforme decidido: ADMIN não "herda" acesso de outros perfis
 * automaticamente — cada rota declara explicitamente quem pode acessá-la).
 *
 * Deve ser usado sempre depois de `authenticate` na cadeia de middlewares.
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      // Só ocorre se authorize for usado sem authenticate antes — erro de
      // uso do middleware, não uma situação esperada em produção.
      throw new AppError(
        "Usuário não autenticado.",
        401,
        ErrorCode.UNAUTHENTICATED,
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        "Você não tem permissão para realizar esta ação.",
        403,
        ErrorCode.FORBIDDEN,
      );
    }

    next();
  };
}
