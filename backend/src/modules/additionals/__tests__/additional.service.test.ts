import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    additional: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../../../lib/prisma.js";
import {
  createAdditional,
  listAdditionals,
  updateAdditional,
} from "../additional.service.js";

// Fixture com os 4 campos reais do model Additional (id, name, priceCents,
// active) — sem createdAt, sem unique constraint, conforme o schema atual.
const existingAdditional = {
  id: "add-1",
  name: "Queijo extra",
  priceCents: 300,
  active: true,
};

describe("additional.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listAdditionals", () => {
    it("lista adicionais ordenados por nome, incluindo inativos", async () => {
      const additionals = [
        existingAdditional,
        { id: "add-2", name: "Bacon", priceCents: 400, active: false },
      ];
      vi.mocked(prisma.additional.findMany).mockResolvedValue(additionals);

      const result = await listAdditionals();

      expect(prisma.additional.findMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
      expect(result).toEqual(additionals);
    });
  });

  describe("createAdditional", () => {
    it("cria um adicional com os dados informados", async () => {
      vi.mocked(prisma.additional.create).mockResolvedValue(existingAdditional);

      const result = await createAdditional({ name: "Queijo extra", priceCents: 300 });

      expect(prisma.additional.create).toHaveBeenCalledWith({
        data: { name: "Queijo extra", priceCents: 300 },
      });
      expect(result).toEqual(existingAdditional);
    });
  });

  describe("updateAdditional", () => {
    it("edita o nome", async () => {
      vi.mocked(prisma.additional.findUnique).mockResolvedValue(existingAdditional);
      const updated = { ...existingAdditional, name: "Queijo extra premium" };
      vi.mocked(prisma.additional.update).mockResolvedValue(updated);

      const result = await updateAdditional("add-1", { name: "Queijo extra premium" });

      expect(prisma.additional.update).toHaveBeenCalledWith({
        where: { id: "add-1" },
        data: { name: "Queijo extra premium" },
      });
      expect(result.name).toBe("Queijo extra premium");
    });

    it("edita o preço", async () => {
      vi.mocked(prisma.additional.findUnique).mockResolvedValue(existingAdditional);
      const updated = { ...existingAdditional, priceCents: 350 };
      vi.mocked(prisma.additional.update).mockResolvedValue(updated);

      const result = await updateAdditional("add-1", { priceCents: 350 });

      expect(result.priceCents).toBe(350);
    });

    it("ativa/desativa", async () => {
      vi.mocked(prisma.additional.findUnique).mockResolvedValue(existingAdditional);
      const updated = { ...existingAdditional, active: false };
      vi.mocked(prisma.additional.update).mockResolvedValue(updated);

      const result = await updateAdditional("add-1", { active: false });

      expect(result.active).toBe(false);
      expect(prisma.additional.update).toHaveBeenCalledWith({
        where: { id: "add-1" },
        data: { active: false },
      });
    });

    it("rejeita adicional inexistente com 404 ADDITIONAL_NOT_FOUND", async () => {
      vi.mocked(prisma.additional.findUnique).mockResolvedValue(null);

      await expect(updateAdditional("inexistente", { active: false })).rejects.toMatchObject({
        statusCode: 404,
        code: "ADDITIONAL_NOT_FOUND",
      });
      expect(prisma.additional.update).not.toHaveBeenCalled();
    });
  });
});
