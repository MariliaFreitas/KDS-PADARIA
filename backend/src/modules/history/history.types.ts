import { z } from "zod";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * "27" e "#27" contam como o mesmo número operacional — mesmo formato de
 * busca do Caixa/Retirada (Etapas 13/14), reimplementado aqui porque o
 * histórico é um módulo independente. IMPORTANTE: diferente dos outros
 * módulos, aqui um match por serviceNumber pode (e deve) retornar mais de
 * um pedido — o número é reutilizável, então "#27" no histórico é uma
 * busca por todos os pedidos que já usaram o número 27, não um único
 * pedido.
 */
const searchSchema = z
  .union([z.string(), z.undefined()])
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed && trimmed !== "" ? trimmed : undefined;
  });

const statusFilterSchema = z
  .union([z.literal("ENTREGUE"), z.literal("CANCELADO"), z.string().length(0), z.undefined()])
  .transform((value) => (value === "ENTREGUE" || value === "CANCELADO" ? value : undefined));

/**
 * Filtro de período: "from"/"to" são timestamps ISO 8601 completos,
 * aplicados diretamente sobre Order.createdAt (data de CRIAÇÃO do pedido —
 * não a data de fechamento operacional, que é diferente para ENTREGUE
 * (deliveredAt) e CANCELADO (cancelledAt) e tornaria a semântica ambígua).
 * "from" vira createdAt >= from; "to" vira createdAt <= to, sem nenhuma
 * normalização implícita de fim de dia — quem quiser incluir o dia
 * inteiro de "to" deve mandar o timestamp no fim daquele dia
 * (ex: 2026-01-01T23:59:59.999Z).
 */
function dateQuerySchema(fieldName: string) {
  return z
    .union([z.string(), z.undefined()])
    .transform((value, ctx) => {
      const trimmed = value?.trim();
      if (!trimmed) return undefined;

      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${fieldName} deve ser uma data/hora ISO 8601 válida.`,
        });
        return z.NEVER;
      }
      return parsed;
    });
}

function paginationIntSchema(fieldName: string, fallback: number, max?: number) {
  return z
    .union([z.string(), z.undefined()])
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === "") return fallback;

      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${fieldName} deve ser um número inteiro maior que zero.`,
        });
        return z.NEVER;
      }
      if (max !== undefined && parsed > max) {
        return max;
      }
      return parsed;
    });
}

export const listHistoryOrdersQuerySchema = z.object({
  search: searchSchema,
  status: statusFilterSchema,
  from: dateQuerySchema("from"),
  to: dateQuerySchema("to"),
  page: paginationIntSchema("page", 1),
  pageSize: paginationIntSchema("pageSize", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
});

export type ListHistoryOrdersQuery = z.infer<typeof listHistoryOrdersQuerySchema>;

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
