import { z } from "zod";

/**
 * Adicionais do item (Etapa 9): cada entrada só precisa do id e da
 * quantidade — nome/preço são sempre resolvidos no service a partir do
 * cadastro atual, nunca aceitos do cliente. additionalId duplicado no
 * mesmo item é rejeitado aqui, antes de qualquer consulta ao banco.
 */
const additionalInputSchema = z.object({
  additionalId: z.string().trim().min(1, "additionalId é obrigatório."),
  quantity: z
    .number({ invalid_type_error: "Quantidade do adicional deve ser um número inteiro." })
    .int("Quantidade do adicional deve ser um número inteiro.")
    .positive("Quantidade do adicional deve ser maior que zero."),
});

const additionalsInputSchema = z
  .array(additionalInputSchema)
  .optional()
  .superRefine((additionals, ctx) => {
    if (!additionals) return;

    const seen = new Set<string>();
    for (const item of additionals) {
      if (seen.has(item.additionalId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "additionalId duplicado no mesmo item.",
          path: ["additionals"],
        });
        return;
      }
      seen.add(item.additionalId);
    }
  });

const observationSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  });

/**
 * Validação de FORMATO do corpo (Etapa 9). A exigência/proibição de
 * quantity/weightGrams/variationId conforme o saleType do produto depende
 * de uma consulta ao banco (o cliente não pode dizer o saleType), então
 * essa parte fica no service — aqui só garantimos os tipos e sinais
 * corretos quando os campos estão presentes.
 *
 * Campos protegidos (saleType, preços, totalCents, snapshots,
 * stationIdSnapshot, status, includedAt, requiresProductionSnapshot) não
 * aparecem neste schema de propósito: o Zod descarta qualquer campo extra
 * enviado pelo cliente.
 */
export const createOrderItemSchema = z.object({
  productId: z.string().trim().min(1, "productId é obrigatório."),
  quantity: z
    .number({ invalid_type_error: "quantity deve ser um número inteiro." })
    .int("quantity deve ser um número inteiro.")
    .positive("quantity deve ser maior que zero.")
    .optional(),
  weightGrams: z
    .number({ invalid_type_error: "weightGrams deve ser um número inteiro." })
    .int("weightGrams deve ser um número inteiro.")
    .positive("weightGrams deve ser maior que zero.")
    .optional(),
  variationId: z.string().trim().min(1, "variationId inválido.").optional(),
  additionals: additionalsInputSchema,
  observation: observationSchema,
});

export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>;
