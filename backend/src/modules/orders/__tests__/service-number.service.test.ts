import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Prisma } from "@prisma/client";

vi.mock("../../../lib/prisma.js", () => ({ prisma: {} }));

import {
  allocateServiceNumber,
  scheduleServiceNumberReuse,
  SERVICE_NUMBER_REUSE_DELAY_MS,
} from "../service-number.service.js";

interface SlotFixture {
  id: string;
  number: number;
  orderId: string;
  reusableAt: Date | null;
}

function slot(overrides: Partial<SlotFixture> = {}): SlotFixture {
  return { id: "slot-1", number: 1, orderId: "order-1", reusableAt: null, ...overrides };
}

function fakeTx(): {
  serviceNumberSlot: {
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
} {
  return {
    serviceNumberSlot: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe("service-number.service (mocks diretos)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("allocateServiceNumber", () => {
    it("reivindica o menor número liberado quando existe um disponível", async () => {
      const tx = fakeTx();
      const reusable = slot({ id: "slot-3", number: 3, reusableAt: new Date("2026-01-01T00:00:00.000Z") });
      tx.serviceNumberSlot.findFirst.mockResolvedValue(reusable);
      tx.serviceNumberSlot.updateMany.mockResolvedValue({ count: 1 });

      const result = await allocateServiceNumber(tx as unknown as Prisma.TransactionClient, "order-novo");

      expect(result).toBe(3);
      expect(tx.serviceNumberSlot.findFirst).toHaveBeenCalledWith({
        where: { reusableAt: { lte: expect.any(Date) }, id: { notIn: [] } },
        orderBy: { number: "asc" },
      });
      expect(tx.serviceNumberSlot.updateMany).toHaveBeenCalledWith({
        where: { id: "slot-3", reusableAt: { lte: expect.any(Date) } },
        data: { orderId: "order-novo", reusableAt: null },
      });
      expect(tx.serviceNumberSlot.create).not.toHaveBeenCalled();
    });

    it("cria um número novo (1) quando não existe nenhum slot ainda", async () => {
      const tx = fakeTx();
      tx.serviceNumberSlot.findFirst.mockResolvedValue(null);
      tx.serviceNumberSlot.create.mockResolvedValue(slot({ id: "slot-1", number: 1 }));

      const result = await allocateServiceNumber(tx as unknown as Prisma.TransactionClient, "order-1");

      expect(result).toBe(1);
      expect(tx.serviceNumberSlot.create).toHaveBeenCalledWith({
        data: { number: 1, orderId: "order-1", reusableAt: null },
      });
    });

    it("cria maior número + 1 quando existem slots mas nenhum reutilizável", async () => {
      const tx = fakeTx();
      // findFirst é chamado duas vezes nesse caminho: primeiro a busca por
      // reutilizável (nenhum), depois a busca pelo maior número existente.
      tx.serviceNumberSlot.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(slot({ id: "slot-5", number: 5 }));
      tx.serviceNumberSlot.create.mockResolvedValue(slot({ id: "slot-6", number: 6 }));

      const result = await allocateServiceNumber(tx as unknown as Prisma.TransactionClient, "order-1");

      expect(result).toBe(6);
      expect(tx.serviceNumberSlot.create).toHaveBeenCalledWith({
        data: { number: 6, orderId: "order-1", reusableAt: null },
      });
    });

    it("perde a corrida pelo número 3 mas reaproveita o número 4, também elegível, antes de criar um novo", async () => {
      const tx = fakeTx();
      const slot3 = slot({ id: "slot-3", number: 3, reusableAt: new Date("2026-01-01T00:00:00.000Z") });
      const slot4 = slot({ id: "slot-4", number: 4, reusableAt: new Date("2026-01-01T00:00:00.000Z") });
      tx.serviceNumberSlot.findFirst
        .mockResolvedValueOnce(slot3)
        .mockResolvedValueOnce(slot4);
      tx.serviceNumberSlot.updateMany
        .mockResolvedValueOnce({ count: 0 }) // outra transação levou o slot 3 primeiro
        .mockResolvedValueOnce({ count: 1 }); // slot 4 reivindicado com sucesso

      const result = await allocateServiceNumber(tx as unknown as Prisma.TransactionClient, "order-1");

      expect(result).toBe(4);
      expect(tx.serviceNumberSlot.findFirst).toHaveBeenNthCalledWith(1, {
        where: { reusableAt: { lte: expect.any(Date) }, id: { notIn: [] } },
        orderBy: { number: "asc" },
      });
      expect(tx.serviceNumberSlot.findFirst).toHaveBeenNthCalledWith(2, {
        where: { reusableAt: { lte: expect.any(Date) }, id: { notIn: ["slot-3"] } },
        orderBy: { number: "asc" },
      });
      expect(tx.serviceNumberSlot.create).not.toHaveBeenCalled();
    });

    it("perde a corrida mais de cinco vezes seguidas e ainda assim reaproveita o próximo slot elegível, sem cair para criar um número novo", async () => {
      const tx = fakeTx();
      // Seis candidatos perdidos em sequência (mais do que qualquer limite
      // fixo de tentativas) e um sétimo, ainda elegível, que finalmente é
      // reivindicado com sucesso — prova que o loop não desiste antes disso.
      const losingSlots = Array.from({ length: 6 }, (_, index) =>
        slot({ id: `slot-loss-${index + 1}`, number: index + 2, reusableAt: new Date("2026-01-01T00:00:00.000Z") }),
      );
      const winningSlot = slot({ id: "slot-win", number: 99, reusableAt: new Date("2026-01-01T00:00:00.000Z") });

      tx.serviceNumberSlot.findFirst.mockImplementation((args: { where: { id: { notIn: string[] } } }) => {
        const tried = new Set(args.where.id.notIn);
        const next = [...losingSlots, winningSlot].find((candidate) => !tried.has(candidate.id));
        return Promise.resolve(next ?? null);
      });
      tx.serviceNumberSlot.updateMany.mockImplementation((args: { where: { id: string } }) => {
        const count = args.where.id === winningSlot.id ? 1 : 0;
        return Promise.resolve({ count });
      });

      const result = await allocateServiceNumber(tx as unknown as Prisma.TransactionClient, "order-1");

      expect(result).toBe(99);
      expect(tx.serviceNumberSlot.findFirst).toHaveBeenCalledTimes(7);
      expect(tx.serviceNumberSlot.updateMany).toHaveBeenCalledTimes(7);
      expect(tx.serviceNumberSlot.create).not.toHaveBeenCalled();
    });

    it("cai para criar um número novo quando não há mais nenhum slot reutilizável elegível", async () => {
      const tx = fakeTx();
      tx.serviceNumberSlot.findFirst
        .mockResolvedValueOnce(slot({ id: "slot-3", number: 3, reusableAt: new Date() })) // único disponível
        .mockResolvedValueOnce(null) // nenhum outro elegível depois de perder a corrida pelo 3
        .mockResolvedValueOnce(slot({ id: "slot-9", number: 9 })); // busca do maior número em createNewSlot
      tx.serviceNumberSlot.updateMany.mockResolvedValue({ count: 0 });
      tx.serviceNumberSlot.create.mockResolvedValue(slot({ id: "slot-10", number: 10 }));

      const result = await allocateServiceNumber(tx as unknown as Prisma.TransactionClient, "order-1");

      expect(result).toBe(10);
      expect(tx.serviceNumberSlot.create).toHaveBeenCalledWith({
        data: { number: 10, orderId: "order-1", reusableAt: null },
      });
    });
  });

  describe("scheduleServiceNumberReuse", () => {
    it("agenda reusableAt para exatamente 7 horas depois de paidAt", async () => {
      const tx = fakeTx();
      tx.serviceNumberSlot.update.mockResolvedValue(slot());
      const paidAt = new Date("2026-01-01T12:00:00.000Z");

      await scheduleServiceNumberReuse(tx as unknown as Prisma.TransactionClient, "order-1", paidAt);

      expect(SERVICE_NUMBER_REUSE_DELAY_MS).toBe(7 * 60 * 60 * 1000);
      expect(tx.serviceNumberSlot.update).toHaveBeenCalledWith({
        where: { orderId: "order-1" },
        data: { reusableAt: new Date("2026-01-01T19:00:00.000Z") },
      });
    });
  });
});

// -----------------------------------------------------------------------
// Concorrência real: em vez de mocks vi.fn(), roda allocateServiceNumber
// contra um "banco" em memória com pontos de interleaving explícitos
// (await Promise.resolve() antes de cada leitura/escrita), simulando duas
// transações concorrentes de verdade. A garantia de segurança do pool não
// vem de nenhum lock em memória: vem só da constraint @unique em number,
// reproduzida aqui pelo create() rejeitando um número duplicado — o mesmo
// mecanismo que o Postgres aplicaria numa corrida real.
// -----------------------------------------------------------------------
describe("service-number.service (concorrência simulada)", () => {
  interface FakeRow {
    id: string;
    number: number;
    orderId: string;
    reusableAt: Date | null;
  }

  function createFakeServiceNumberTx() {
    const rows: FakeRow[] = [];
    let nextId = 1;

    return {
      serviceNumberSlot: {
        async findFirst(args: {
          where?: { reusableAt?: { lte: Date } };
          orderBy?: { number: "asc" | "desc" };
        }) {
          await Promise.resolve();
          let candidates = rows;
          const cutoff = args.where?.reusableAt?.lte;
          if (cutoff) {
            candidates = candidates.filter((row) => row.reusableAt !== null && row.reusableAt <= cutoff);
          }
          const sorted = [...candidates].sort((a, b) =>
            args.orderBy?.number === "desc" ? b.number - a.number : a.number - b.number,
          );
          return sorted[0] ?? null;
        },
        async updateMany(args: {
          where: { id: string; reusableAt?: { lte: Date } };
          data: { orderId: string; reusableAt: Date | null };
        }) {
          await Promise.resolve();
          const row = rows.find((candidate) => candidate.id === args.where.id);
          if (!row) return { count: 0 };
          const cutoff = args.where.reusableAt?.lte;
          const stillEligible = cutoff ? row.reusableAt !== null && row.reusableAt <= cutoff : true;
          if (!stillEligible) return { count: 0 };
          row.orderId = args.data.orderId;
          row.reusableAt = args.data.reusableAt;
          return { count: 1 };
        },
        async create(args: { data: { number: number; orderId: string; reusableAt: Date | null } }) {
          await Promise.resolve();
          if (rows.some((row) => row.number === args.data.number)) {
            throw Object.assign(new Error("Unique constraint failed on the fields: (`number`)"), {
              code: "P2002",
            });
          }
          const row: FakeRow = { id: `slot-${nextId}`, ...args.data };
          nextId += 1;
          rows.push(row);
          return row;
        },
      },
    };
  }

  it("duas criações concorrentes sem nenhum slot existente nunca recebem o mesmo número novo", async () => {
    const tx = createFakeServiceNumberTx() as unknown as Prisma.TransactionClient;

    const results = await Promise.allSettled([
      allocateServiceNumber(tx, "order-A"),
      allocateServiceNumber(tx, "order-B"),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<number> => result.status === "fulfilled",
    );
    const rejected = results.filter((result) => result.status === "rejected");

    // As duas nunca podem ter tido sucesso com o mesmo número: ou os dois
    // números alocados são diferentes, ou uma das duas perdeu a corrida e
    // foi rejeitada pela constraint de unicidade (cabe a quem chama, no
    // createOrder real, reiniciar a transação inteira nesse caso).
    if (fulfilled.length === 2) {
      expect(fulfilled[0].value).not.toBe(fulfilled[1].value);
    } else {
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    }
  });

  it("duas criações concorrentes disputando o único slot reutilizável: só uma o reivindica, a outra recebe um número novo", async () => {
    const tx = createFakeServiceNumberTx();
    // Pré-semeia um único slot já liberado (pago há mais de 7h).
    await tx.serviceNumberSlot.create({
      data: { number: 5, orderId: "order-antigo", reusableAt: null },
    });
    const seeded = await tx.serviceNumberSlot.updateMany({
      where: { id: "slot-1" },
      data: { orderId: "order-antigo", reusableAt: new Date("2020-01-01T00:00:00.000Z") },
    });
    expect(seeded.count).toBe(1);

    const typedTx = tx as unknown as Prisma.TransactionClient;
    const [numberA, numberB] = await Promise.all([
      allocateServiceNumber(typedTx, "order-A"),
      allocateServiceNumber(typedTx, "order-B"),
    ]);

    const numbers = [numberA, numberB].sort((a, b) => a - b);
    // Um dos dois pedidos ficou com o número reutilizado (5); o outro,
    // como perdeu a corrida pelo slot, recebeu um número novo — nunca os
    // dois com o mesmo número 5.
    expect(numbers[0]).toBe(5);
    expect(numbers[1]).not.toBe(5);
    expect(numberA).not.toBe(numberB);
  });
});
