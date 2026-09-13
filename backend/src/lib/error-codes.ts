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
  /** Já existe uma estação com esse nome (Etapa 4). */
  STATION_NAME_ALREADY_EXISTS: "STATION_NAME_ALREADY_EXISTS",
  /** Estação inexistente (Etapa 4; também usado quando um produto referencia uma estação inexistente na Etapa 5). */
  STATION_NOT_FOUND: "STATION_NOT_FOUND",
  /** Combinação inválida entre saleType e unitPriceCents/pricePerKgCents (Etapa 5). */
  PRODUCT_PRICE_FIELDS_INVALID: "PRODUCT_PRICE_FIELDS_INVALID",
  /** requiresProduction=true sem stationId informado (Etapa 5). */
  PRODUCT_STATION_REQUIRED: "PRODUCT_STATION_REQUIRED",
  /** Produto inexistente (Etapa 5). */
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  /** Produto existe, mas saleType não é VARIATION (Etapa 6). */
  PRODUCT_DOES_NOT_ACCEPT_VARIATIONS: "PRODUCT_DOES_NOT_ACCEPT_VARIATIONS",
  /** Variação inexistente, ou existente mas de outro produto (Etapa 6). */
  PRODUCT_VARIATION_NOT_FOUND: "PRODUCT_VARIATION_NOT_FOUND",
  /** Falha não prevista. */
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
