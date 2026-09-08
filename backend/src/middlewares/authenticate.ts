import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { ErrorCode } from "../lib/error-codes.js";
import type { AuthenticatedUser } from "../modules/auth/auth.types.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const BEARER_PREFIX = "Bearer ";

/**
 * Exige um token JWT válido no header Authorization.
 * Em caso de sucesso, anexa os dados do usuário em req.user.
 *
 * Token expirado recebe um código próprio (TOKEN_EXPIRED) para que o cliente
 * consiga distinguir "sua sessão acabou, faça login de novo" de "esse token
 * não presta". As duas situações continuam devolvendo 401.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw new AppError(
      "Token de autenticação ausente.",
      401,
      ErrorCode.UNAUTHENTICATED,
    );
  }

  const token = header.slice(BEARER_PREFIX.length);

  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as AuthenticatedUser;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(
        "Sua sessão expirou. Entre novamente.",
        401,
        ErrorCode.TOKEN_EXPIRED,
      );
    }

    throw new AppError(
      "Token de autenticação inválido.",
      401,
      ErrorCode.UNAUTHENTICATED,
    );
  }

  next();
}
