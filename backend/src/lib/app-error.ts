import type { ErrorCodeValue } from "./error-codes.js";

/**
 * Erro de aplicação com status HTTP e código estável associados.
 * Lançado pelos services/middlewares e traduzido em resposta HTTP pelo
 * errorHandler.
 *
 * O `code` é obrigatório de propósito: é ele que o cliente usa para decidir
 * o que fazer. Deixá-lo opcional permitiria que um erro novo saísse sem
 * código e obrigasse o frontend a voltar a comparar mensagens de texto.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: ErrorCodeValue,
  ) {
    super(message);
    this.name = "AppError";
  }
}
