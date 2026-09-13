import { z } from "zod";

const priceCentsSchema = z
  .number({ invalid_type_error: "Valor deve ser um número inteiro em centavos." })
  .int("Valor deve ser um número inteiro em centavos.")
  .nonnegative("Valor não pode ser negativo.");

export const createAdditionalSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  priceCents: priceCentsSchema,
});

export type CreateAdditionalInput = z.infer<typeof createAdditionalSchema>;

export const updateAdditionalSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório").optional(),
    priceCents: priceCentsSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined || data.priceCents !== undefined || data.active !== undefined,
    { message: "Informe ao menos um campo para atualizar." },
  );

export type UpdateAdditionalInput = z.infer<typeof updateAdditionalSchema>;
