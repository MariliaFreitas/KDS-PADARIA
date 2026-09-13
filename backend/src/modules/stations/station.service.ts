import type { Station } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";
import type { CreateStationInput, UpdateStationInput } from "./station.types.js";

const DUPLICATE_NAME_MESSAGE = "Já existe uma estação com esse nome.";

export async function listStations(): Promise<Station[]> {
  return prisma.station.findMany({ orderBy: { name: "asc" } });
}

export async function createStation(input: CreateStationInput): Promise<Station> {
  const existing = await prisma.station.findUnique({ where: { name: input.name } });
  if (existing) {
    throw new AppError(DUPLICATE_NAME_MESSAGE, 409, ErrorCode.STATION_NAME_ALREADY_EXISTS);
  }

  return prisma.station.create({ data: { name: input.name } });
}

export async function updateStation(
  id: string,
  input: UpdateStationInput,
): Promise<Station> {
  const station = await prisma.station.findUnique({ where: { id } });
  if (!station) {
    throw new AppError("Estação não encontrada.", 404, ErrorCode.STATION_NOT_FOUND);
  }

  if (input.name !== undefined && input.name !== station.name) {
    const nameInUse = await prisma.station.findUnique({ where: { name: input.name } });
    if (nameInUse) {
      throw new AppError(DUPLICATE_NAME_MESSAGE, 409, ErrorCode.STATION_NAME_ALREADY_EXISTS);
    }
  }

  return prisma.station.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}
