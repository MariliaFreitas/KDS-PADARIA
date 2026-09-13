import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    station: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../../../lib/prisma.js";
import { createStation, listStations, updateStation } from "../station.service.js";

describe("station.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listStations", () => {
    it("lista estações ordenadas por nome, ativas e inativas", async () => {
      const stations = [
        { id: "1", name: "Chapa", active: true },
        { id: "2", name: "Forno", active: false },
      ];
      vi.mocked(prisma.station.findMany).mockResolvedValue(stations);

      const result = await listStations();

      expect(prisma.station.findMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
      expect(result).toEqual(stations);
    });
  });

  describe("createStation", () => {
    it("cria uma estação quando o nome ainda não existe", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(null);
      const created = { id: "1", name: "Forno", active: true };
      vi.mocked(prisma.station.create).mockResolvedValue(created);

      const result = await createStation({ name: "Forno" });

      expect(prisma.station.create).toHaveBeenCalledWith({ data: { name: "Forno" } });
      expect(result).toEqual(created);
    });

    it("rejeita nome duplicado com erro controlado (409)", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue({
        id: "existing",
        name: "Forno",
        active: true,
      });

      await expect(createStation({ name: "Forno" })).rejects.toMatchObject({
        statusCode: 409,
        code: "STATION_NAME_ALREADY_EXISTS",
      });
      expect(prisma.station.create).not.toHaveBeenCalled();
    });
  });

  describe("updateStation", () => {
    it("atualiza o nome quando a estação existe e o novo nome está livre", async () => {
      vi.mocked(prisma.station.findUnique)
        .mockResolvedValueOnce({ id: "1", name: "Forno", active: true }) // busca por id
        .mockResolvedValueOnce(null); // checagem de nome duplicado
      const updated = { id: "1", name: "Forno a lenha", active: true };
      vi.mocked(prisma.station.update).mockResolvedValue(updated);

      const result = await updateStation("1", { name: "Forno a lenha" });

      expect(prisma.station.update).toHaveBeenCalledWith({
        where: { id: "1" },
        data: { name: "Forno a lenha" },
      });
      expect(result).toEqual(updated);
    });

    it("ativa/desativa sem checar duplicidade de nome", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValueOnce({
        id: "1",
        name: "Forno",
        active: true,
      });
      const updated = { id: "1", name: "Forno", active: false };
      vi.mocked(prisma.station.update).mockResolvedValue(updated);

      const result = await updateStation("1", { active: false });

      expect(result.active).toBe(false);
      expect(prisma.station.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.station.update).toHaveBeenCalledWith({
        where: { id: "1" },
        data: { active: false },
      });
    });

    it("permite manter o mesmo nome sem disparar checagem de duplicidade", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValueOnce({
        id: "1",
        name: "Forno",
        active: true,
      });
      vi.mocked(prisma.station.update).mockResolvedValue({
        id: "1",
        name: "Forno",
        active: false,
      });

      await updateStation("1", { name: "Forno", active: false });

      expect(prisma.station.findUnique).toHaveBeenCalledTimes(1);
    });

    it("rejeita estação inexistente com erro controlado (404)", async () => {
      vi.mocked(prisma.station.findUnique).mockResolvedValue(null);

      await expect(updateStation("inexistente", { active: false })).rejects.toMatchObject({
        statusCode: 404,
        code: "STATION_NOT_FOUND",
      });
      expect(prisma.station.update).not.toHaveBeenCalled();
    });

    it("rejeita renomear para um nome já usado por outra estação (409)", async () => {
      vi.mocked(prisma.station.findUnique)
        .mockResolvedValueOnce({ id: "1", name: "Forno", active: true })
        .mockResolvedValueOnce({ id: "2", name: "Chapa", active: true });

      await expect(updateStation("1", { name: "Chapa" })).rejects.toMatchObject({
        statusCode: 409,
        code: "STATION_NAME_ALREADY_EXISTS",
      });
      expect(prisma.station.update).not.toHaveBeenCalled();
    });
  });
});
