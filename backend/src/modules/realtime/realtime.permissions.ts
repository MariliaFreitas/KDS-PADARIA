import type { UserRole } from "@prisma/client";
import type { RealtimeEvent, RealtimeScope } from "./realtime.types.js";

/** Mesmo mapeamento de authorize() nas rotas REST de cada módulo. */
const SCOPES_BY_ROLE: Record<UserRole, RealtimeScope[]> = {
  ATENDENTE: ["orders"],
  PRODUCAO: ["production"],
  CAIXA: ["cashier", "delivery"],
  ADMIN: ["orders", "production", "cashier"],
};

/**
 * Reduz um evento aos escopos que o papel pode assinar. Sem nenhum escopo
 * autorizado, devolve null — nada deve ser mandado ao assinante. stationId
 * só identifica uma fila de produção, então só acompanha o evento quando
 * "production" sobrevive ao filtro, mesmo que orderId permaneça.
 */
export function filterEventForRole(event: RealtimeEvent, role: UserRole): RealtimeEvent | null {
  const allowedScopes = SCOPES_BY_ROLE[role];
  const scopes = event.scopes.filter((scope) => allowedScopes.includes(scope));

  if (scopes.length === 0) {
    return null;
  }

  return {
    scopes,
    timestamp: event.timestamp,
    ...(event.orderId !== undefined ? { orderId: event.orderId } : {}),
    ...(scopes.includes("production") && event.stationId !== undefined
      ? { stationId: event.stationId }
      : {}),
  };
}
