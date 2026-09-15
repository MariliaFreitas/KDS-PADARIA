import { z } from "zod";

/**
 * Busca da tela de Retirada/Entrega: campo único e opcional, usado tanto
 * para número operacional (aceita "27" e "#27") quanto para nome do
 * cliente (substring, sem diferenciar maiúsculas/minúsculas) — mesmo
 * formato de busca do Caixa (Etapa 13), reimplementado aqui porque os dois
 * módulos são independentes de propósito (ver delivery.service).
 */
export const listDeliveryOrdersQuerySchema = z.object({
  search: z
    .union([z.string(), z.undefined()])
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed && trimmed !== "" ? trimmed : undefined;
    }),
});

export type ListDeliveryOrdersQuery = z.infer<typeof listDeliveryOrdersQuerySchema>;
