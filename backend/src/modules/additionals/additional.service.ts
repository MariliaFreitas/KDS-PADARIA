import type { Additional } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";
import type { CreateAdditionalInput, UpdateAdditionalInput } from "./additional.types.js";

/**
 * Additional é cadastro global (Etapa 7): não existe relação Product<->
 * Additional no schema atual, então não há filtro por produto aqui — é a
 * lista completa, igual estações.
 */
export async function listAdditionals(): Promise<Additional[]> {
  return prisma.additional.findMany({ orderBy: { name: "asc" } });
}

export async function createAdditional(input: CreateAdditionalInput): Promise<Additional> {
  return prisma.additional.create({
    data: {
      name: input.name,
      priceCents: input.priceCents,
      // active não é passado: o default(true) do schema cuida disso.
    },
  });
}

export async function updateAdditional(
  id: string,
  input: UpdateAdditionalInput,
): Promise<Additional> {
  const existing = await prisma.additional.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Adicional não encontrado.", 404, ErrorCode.ADDITIONAL_NOT_FOUND);
  }

  return prisma.additional.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}
