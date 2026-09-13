import { z } from "zod";

const priceCentsSchema = z
  .number({ invalid_type_error: "Valor deve ser um número inteiro em centavos." })
  .int("Valor deve ser um número inteiro em centavos.")
  .nonnegative("Valor não pode ser negativo.");

export const createVariationSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  priceCents: priceCentsSchema,
});

export type CreateVariationInput = z.infer<typeof createVariationSchema>;

export const updateVariationSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório").optional(),
    priceCents: priceCentsSchema.optional(),
  })
  .refine((data) => data.name !== undefined || data.priceCents !== undefined, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type UpdateVariationInput = z.infer<typeof updateVariationSchema>;
