import { z } from "zod";

export const createStationSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
});

export type CreateStationInput = z.infer<typeof createStationSchema>;

export const updateStationSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório").optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => data.name !== undefined || data.active !== undefined, {
    message: "Informe ao menos um campo para atualizar (name e/ou active).",
  });

export type UpdateStationInput = z.infer<typeof updateStationSchema>;
