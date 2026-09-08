import type { Request, Response } from "express";
import { ErrorCode } from "../lib/error-codes.js";

/**
 * Responde 404 em JSON para qualquer rota não registrada.
 *
 * Sem isto, o Express devolve uma página HTML padrão — o cliente da API
 * receberia HTML onde espera JSON e ficaria sem mensagem utilizável.
 *
 * ORDEM IMPORTA: precisa ser registrado DEPOIS de todas as rotas e ANTES do
 * errorHandler. Toda rota nova (Etapa 4 em diante) deve ser registrada acima
 * dele, ou passará a cair aqui.
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: "Rota não encontrada.",
    code: ErrorCode.ROUTE_NOT_FOUND,
  });
}
