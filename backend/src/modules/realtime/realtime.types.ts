/**
 * Escopos que uma tela operacional pode assinar. Conjunto pequeno de
 * propósito: cada mutação relevante publica um ou mais desses escopos,
 * nunca um tipo de evento por endpoint.
 */
export type RealtimeScope = "orders" | "production" | "cashier" | "delivery";

/**
 * Evento de invalidação. Não carrega nenhum dado de negócio — só o
 * suficiente para a tela decidir SE precisa refazer o GET que já faz hoje.
 * orderId/stationId são opcionais porque nem toda mutação está associada a
 * um pedido ou a uma estação específica.
 */
export interface RealtimeEvent {
  scopes: RealtimeScope[];
  orderId?: string;
  stationId?: string;
  timestamp: string;
}

export type RealtimeEventInput = Omit<RealtimeEvent, "timestamp">;
