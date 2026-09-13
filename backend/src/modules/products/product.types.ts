import { z } from "zod";

/**
 * Etapa 5 não implementa variações (isso é Etapa 6) — apenas as três formas
 * de venda já existentes no schema. Usamos z.enum com a lista literal, e não
 * o objeto de runtime exportado pelo Prisma, pelo mesmo motivo do resto do
 * projeto: o restante do código também não depende do valor de runtime dos
 * enums do Prisma, só do tipo (ver UserRole em auth.types.ts).
 */
const saleTypeSchema = z.enum(["UNIT", "VARIATION", "WEIGHT"]);

const priceCentsSchema = z
  .number({ invalid_type_error: "Valor deve ser um número inteiro em centavos." })
  .int("Valor deve ser um número inteiro em centavos.")
  .nonnegative("Valor não pode ser negativo.");

const stationIdSchema = z.string().trim().min(1, "Estação inválida");

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  saleType: saleTypeSchema,
  unitPriceCents: priceCentsSchema.nullable().optional(),
  pricePerKgCents: priceCentsSchema.nullable().optional(),
  requiresProduction: z.boolean().optional(),
  stationId: stationIdSchema.nullable().optional(),
  active: z.boolean().optional(),
  available: z.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório").optional(),
    saleType: saleTypeSchema.optional(),
    unitPriceCents: priceCentsSchema.nullable().optional(),
    pricePerKgCents: priceCentsSchema.nullable().optional(),
    requiresProduction: z.boolean().optional(),
    stationId: stationIdSchema.nullable().optional(),
    active: z.boolean().optional(),
    available: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Informe ao menos um campo para atualizar.",
  });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
