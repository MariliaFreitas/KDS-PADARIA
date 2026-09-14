import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    product: { findMany: vi.fn() },
    additional: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma.js";
import { getCatalog } from "../catalog.service.js";

describe("catalog.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    vi.mocked(prisma.additional.findMany).mockResolvedValue([]);
  });

  it("busca somente produtos active+available, ordenados por nome, com variações ordenadas", async () => {
    await getCatalog();

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { active: true, available: true },
      orderBy: { name: "asc" },
      include: {
        variations: { orderBy: { name: "asc" } },
      },
    });
  });

  it("busca somente adicionais ativos, ordenados por nome", async () => {
    await getCatalog();

    expect(prisma.additional.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { name: "asc" },
    });
  });

  it("retorna produtos e adicionais no formato esperado", async () => {
    const product = {
      id: "product-1",
      name: "Pão francês",
      active: true,
      available: true,
      saleType: "UNIT" as const,
      unitPriceCents: 500,
      pricePerKgCents: null,
      requiresProduction: false,
      stationId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      variations: [],
    };
    const additional = { id: "additional-1", name: "Manteiga", priceCents: 150, active: true };
    vi.mocked(prisma.product.findMany).mockResolvedValue([product]);
    vi.mocked(prisma.additional.findMany).mockResolvedValue([additional]);

    const result = await getCatalog();

    expect(result.products).toEqual([product]);
    expect(result.additionals).toEqual([additional]);
  });
});
