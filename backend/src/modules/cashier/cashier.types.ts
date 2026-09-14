import { z } from "zod";

/**
 * Busca do caixa: campo único e opcional, usado tanto para número
 * operacional (quando o texto é inteiro) quanto para nome do cliente
 * (substring, sem diferenciar maiúsculas/minúsculas) — ver cashier.service.
 */
export const listCashierOrdersQuerySchema = z.object({
  search: z
    .union([z.string(), z.undefined()])
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed && trimmed !== "" ? trimmed : undefined;
    }),
});

export type ListCashierOrdersQuery = z.infer<typeof listCashierOrdersQuerySchema>;
