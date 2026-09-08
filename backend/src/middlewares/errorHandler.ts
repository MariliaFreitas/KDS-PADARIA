import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/app-error.js";
import { ErrorCode } from "../lib/error-codes.js";

/**
 * Middleware de erro centralizado. Deve ser o último registrado no app.
 *
 * Toda resposta de erro sai no mesmo formato:
 *   { error: "mensagem", code: "CODIGO_ESTAVEL" }
 * Erros de validação acrescentam `details` com os problemas por campo.
 *
 * IMPORTANTE (segurança): nunca logar req.body aqui — pode conter senha em
 * texto puro (ex: corpo da requisição de login). Só o objeto de erro é
 * logado, nunca a requisição original.
 */

/**
 * Detecta o erro que o body-parser lança quando o corpo não é JSON válido.
 * A checagem é pela propriedade `type` e não por `instanceof` porque o
 * body-parser não exporta a classe do erro, e comparar por instância
 * quebraria numa troca de versão da dependência.
 */
function isJsonParseError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { type?: unknown }).type === "entity.parse.failed"
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Dados inválidos.",
      code: ErrorCode.VALIDATION_ERROR,
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (isJsonParseError(err)) {
    res.status(400).json({
      error: "O corpo da requisição não é um JSON válido.",
      code: ErrorCode.INVALID_JSON,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({
    error: "Erro interno do servidor.",
    code: ErrorCode.INTERNAL_ERROR,
  });
}
