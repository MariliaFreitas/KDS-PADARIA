export type RealtimeScope = "orders" | "production" | "cashier" | "delivery";

/**
 * Sinal mínimo de invalidação vindo do stream — nunca carrega dado de
 * pedido (preço, nome de cliente, adicionais, pagamento). Quem
 * recebe decide, com esses campos, SE precisa refazer o GET que já faz
 * normalmente; o conteúdo em si sempre vem da resposta REST.
 */
export interface RealtimeEvent {
  scopes: RealtimeScope[];
  orderId?: string;
  stationId?: string;
  timestamp: string;
}

/**
 * "connecting": primeira tentativa, ainda sem nenhuma conexão bem-sucedida.
 * "connected": stream aberto e recebendo eventos normalmente.
 * "reconnecting": a conexão caiu e está tentando voltar (backoff).
 * "stopped": parou de tentar de propósito (401/403 — sessão inválida/expirada).
 *   Não tenta mais sozinho; REST e o botão "Atualizar" continuam funcionando.
 */
export type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "stopped";
