/**
 * Códigos de erro estáveis da API.
 *
 * O cliente deve decidir o que fazer olhando para o `code`, nunca para a
 * mensagem: a mensagem é texto de interface e pode ser reescrita a qualquer
 * momento sem aviso; o código é contrato e só muda de forma deliberada.
 *
 * Toda resposta de erro da API tem o formato:
 *
 *   { "error": "mensagem em português", "code": "CODIGO_ESTAVEL" }
 *
 * Erros de validação acrescentam um campo `details` com os problemas por campo.
 */
export const ErrorCode = {
  /** Corpo da requisição não passou na validação de schema (Zod). */
  VALIDATION_ERROR: "VALIDATION_ERROR",
  /** Corpo enviado não é um JSON válido. */
  INVALID_JSON: "INVALID_JSON",
  /** Rota inexistente. */
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  /** Token ausente ou com formato inválido no header Authorization. */
  UNAUTHENTICATED: "UNAUTHENTICATED",
  /** Token válido em formato, mas com prazo de validade vencido. */
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  /** Token presente, mas o perfil não tem permissão para a ação. */
  FORBIDDEN: "FORBIDDEN",
  /** Usuário/senha inválidos, ou usuário inativo. */
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  /** Falha não prevista. */
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
