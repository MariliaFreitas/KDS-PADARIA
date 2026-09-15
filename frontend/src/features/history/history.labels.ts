import type { HistoryEvent, HistoryOrderItem, HistoryOrderSummary } from "./history.types.js";

export const CHANNEL_LABEL: Record<HistoryOrderSummary["channel"], string> = {
  BALCAO: "Balcão",
  WHATSAPP: "WhatsApp",
};

export const CONSUMPTION_LABEL: Record<HistoryOrderSummary["consumptionType"], string> = {
  LOCAL: "Consumo no local",
  VIAGEM: "Para viagem",
};

export const PAYMENT_LABEL: Record<HistoryOrderSummary["paymentStatus"], string> = {
  PENDENTE: "Pagamento pendente",
  PAGO: "Pago",
};

export const ITEM_STATUS_LABEL: Record<HistoryOrderItem["status"], string> = {
  PENDENTE: "Pendente",
  EM_PREPARO: "Em preparo",
  PRONTO: "Pronto",
  CANCELADO: "Cancelado",
};

export const ROLE_LABEL: Record<HistoryEvent["user"]["role"], string> = {
  ATENDENTE: "Atendente",
  PRODUCAO: "Produção",
  CAIXA: "Caixa",
  ADMIN: "Administrador",
};

/**
 * Mapa de ação técnica (persistida em OrderHistory.action, ver backend) para
 * texto legível na tela — só a apresentação muda aqui, o valor técnico
 * continua sendo o que foi realmente gravado (nunca reescrito). Uma ação
 * fora deste mapa (histórico futuro, ou dado legado) cai no fallback que
 * mostra o texto técnico bruto, em vez de esconder o evento.
 */
const ACTION_LABEL: Record<string, string> = {
  ORDER_CREATED: "Pedido criado",
  ITEM_ADDED: "Item incluído",
  ITEM_STATUS_CHANGED: "Status do item alterado",
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  ITEM_DELIVERED: "Item entregue",
  ORDER_DELIVERED: "Pedido entregue",
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

/** Status operacional do pedido para exibição no resumo da lista. */
export function operationalStatusLabel(order: HistoryOrderSummary): string {
  if (order.cancelledAt !== null) return "Cancelado";
  if (order.deliveredAt !== null) return "Entregue";
  return "Em aberto";
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
