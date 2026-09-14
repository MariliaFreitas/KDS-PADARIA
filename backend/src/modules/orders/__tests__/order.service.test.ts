import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    order: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    serviceNumberSlot: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../../lib/prisma.js";
import { createOrder, getOrderById } from "../order.service.js";

function uniqueConstraintError(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed on the fields: (`number`)"), {
    code: "P2002",
  });
}

// Fixture com todos os campos reais do model Order — os de pagamento,
// cancelamento e entrega começam nulos, conforme o cabeçalho recém-criado
// (Etapa 8 não implementa nenhuma dessas funcionalidades ainda).
// serviceNumber usa o placeholder 0 aqui: é exatamente o valor que
// prisma.order.create devolve antes de createOrder sobrescrevê-lo dentro
// da mesma transação.
const baseOrder = {
  id: "order-1",
  orderNumber: 154,
  serviceNumber: 0,
  customerName: "Maria",
  channel: "BALCAO" as const,
  consumptionType: "LOCAL" as const,
  pickupTime: null,
  paymentStatus: "PENDENTE" as const,
  paidAt: null,
  paidByUserId: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledByUserId: null,
  deliveredAt: null,
  createdByUserId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("order.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // $transaction roda o callback direto com o mesmo client mockado —
    // suficiente para testar a lógica de alocação, que só chama métodos
    // de model do Prisma, nunca comportamento específico de transação.
    vi.mocked(prisma.$transaction).mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      Promise.resolve(callback(prisma)),
    );
  });

  describe("createOrder", () => {
    beforeEach(() => {
      vi.mocked(prisma.order.create).mockResolvedValue(baseOrder);
    });

    it("cria o cabeçalho do pedido com os dados informados e o usuário autenticado", async () => {
      vi.mocked(prisma.serviceNumberSlot.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceNumberSlot.create).mockResolvedValue({
        id: "slot-1",
        number: 1,
        orderId: "order-1",
        reusableAt: null,
      });
      vi.mocked(prisma.order.update).mockResolvedValue({ ...baseOrder, serviceNumber: 1 });

      const result = await createOrder(
        {
          customerName: "Maria",
          channel: "BALCAO",
          consumptionType: "LOCAL",
          pickupTime: null,
        },
        "user-1",
      );

      expect(prisma.order.create).toHaveBeenCalledWith({
        data: {
          customerName: "Maria",
          channel: "BALCAO",
          consumptionType: "LOCAL",
          pickupTime: null,
          createdByUserId: "user-1",
        },
      });
      expect(result.serviceNumber).toBe(1);
    });

    it("não envia orderNumber, serviceNumber, paymentStatus ou createdAt ao Prisma", async () => {
      vi.mocked(prisma.serviceNumberSlot.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceNumberSlot.create).mockResolvedValue({
        id: "slot-1",
        number: 1,
        orderId: "order-1",
        reusableAt: null,
      });
      vi.mocked(prisma.order.update).mockResolvedValue({ ...baseOrder, serviceNumber: 1 });

      await createOrder(
        { customerName: "João", channel: "WHATSAPP", consumptionType: "VIAGEM", pickupTime: null },
        "user-2",
      );

      const call = vi.mocked(prisma.order.create).mock.calls[0][0];
      expect(call.data).not.toHaveProperty("orderNumber");
      expect(call.data).not.toHaveProperty("serviceNumber");
      expect(call.data).not.toHaveProperty("paymentStatus");
      expect(call.data).not.toHaveProperty("createdAt");
      expect(call.data).not.toHaveProperty("id");
    });

    it("repassa o horário de retirada quando informado", async () => {
      const pickupTime = new Date("2026-02-01T18:00:00.000Z");
      vi.mocked(prisma.order.create).mockResolvedValue({ ...baseOrder, pickupTime });
      vi.mocked(prisma.serviceNumberSlot.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceNumberSlot.create).mockResolvedValue({
        id: "slot-1",
        number: 1,
        orderId: "order-1",
        reusableAt: null,
      });
      vi.mocked(prisma.order.update).mockResolvedValue({
        ...baseOrder,
        pickupTime,
        serviceNumber: 1,
      });

      await createOrder(
        {
          customerName: "Ana",
          channel: "WHATSAPP",
          consumptionType: "LOCAL",
          pickupTime,
        },
        "user-1",
      );

      expect(prisma.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ pickupTime }),
      });
    });

    it("aloca o número 1 quando não existe nenhum slot ainda (primeiro pedido)", async () => {
      vi.mocked(prisma.serviceNumberSlot.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceNumberSlot.create).mockResolvedValue({
        id: "slot-1",
        number: 1,
        orderId: "order-1",
        reusableAt: null,
      });
      vi.mocked(prisma.order.update).mockResolvedValue({ ...baseOrder, serviceNumber: 1 });

      await createOrder(
        { customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL", pickupTime: null },
        "user-1",
      );

      expect(prisma.serviceNumberSlot.create).toHaveBeenCalledWith({
        data: { number: 1, orderId: "order-1", reusableAt: null },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: { serviceNumber: 1 },
      });
    });

    it("reaproveita o menor número já liberado em vez de criar um novo", async () => {
      vi.mocked(prisma.serviceNumberSlot.findFirst).mockResolvedValue({
        id: "slot-3",
        number: 3,
        orderId: "order-antigo",
        reusableAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      vi.mocked(prisma.serviceNumberSlot.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.order.update).mockResolvedValue({ ...baseOrder, serviceNumber: 3 });

      const result = await createOrder(
        { customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL", pickupTime: null },
        "user-1",
      );

      expect(prisma.serviceNumberSlot.create).not.toHaveBeenCalled();
      expect(prisma.serviceNumberSlot.updateMany).toHaveBeenCalledWith({
        where: { id: "slot-3", reusableAt: { lte: expect.any(Date) } },
        data: { orderId: "order-1", reusableAt: null },
      });
      expect(result.serviceNumber).toBe(3);
    });

    it("tenta a transação inteira de novo quando duas criações concorrentes colidem no mesmo número novo", async () => {
      vi.mocked(prisma.serviceNumberSlot.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceNumberSlot.create)
        .mockRejectedValueOnce(uniqueConstraintError())
        .mockResolvedValueOnce({ id: "slot-1", number: 1, orderId: "order-1", reusableAt: null });
      vi.mocked(prisma.order.update).mockResolvedValue({ ...baseOrder, serviceNumber: 1 });

      const result = await createOrder(
        { customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL", pickupTime: null },
        "user-1",
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(result.serviceNumber).toBe(1);
    });

    it("relança o erro depois de esgotar as tentativas de alocação", async () => {
      vi.mocked(prisma.serviceNumberSlot.findFirst).mockResolvedValue(null);
      const conflict = uniqueConstraintError();
      vi.mocked(prisma.serviceNumberSlot.create).mockRejectedValue(conflict);

      await expect(
        createOrder(
          { customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL", pickupTime: null },
          "user-1",
        ),
      ).rejects.toBe(conflict);
    });

    it("propaga imediatamente um erro que não é de violação de unicidade", async () => {
      vi.mocked(prisma.serviceNumberSlot.findFirst).mockRejectedValue(new Error("Falha de conexão"));

      await expect(
        createOrder(
          { customerName: "Maria", channel: "BALCAO", consumptionType: "LOCAL", pickupTime: null },
          "user-1",
        ),
      ).rejects.toThrow("Falha de conexão");
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("getOrderById", () => {
    it("retorna o pedido sem itens (pedido novo, antes da Etapa 9 adicionar algum)", async () => {
      const orderWithItems = { ...baseOrder, serviceNumber: 1, items: [] };
      vi.mocked(prisma.order.findUnique).mockResolvedValue(orderWithItems);

      const result = await getOrderById("order-1");

      expect(prisma.order.findUnique).toHaveBeenCalledWith({
        where: { id: "order-1" },
        include: {
          items: {
            orderBy: { includedAt: "asc" },
            include: { additionals: true },
          },
        },
      });
      expect(result.items).toEqual([]);
    });

    it("retorna os itens reais ordenados por includedAt, cada um com seus additionals", async () => {
      const item1 = {
        id: "item-1",
        orderId: "order-1",
        productId: "product-1",
        productNameSnapshot: "Pão francês",
        saleType: "UNIT" as const,
        basePriceCentsSnapshot: 500,
        requiresProductionSnapshot: false,
        quantity: 2,
        weightGrams: null,
        variationId: null,
        variationNameSnapshot: null,
        stationIdSnapshot: null,
        stationNameSnapshot: null,
        status: "PENDENTE" as const,
        totalCents: 1000,
        observation: null,
        includedAt: new Date("2026-01-01T10:00:00.000Z"),
        additionals: [
          {
            id: "add-1",
            orderItemId: "item-1",
            additionalId: "additional-1",
            nameSnapshot: "Manteiga",
            priceCentsSnapshot: 150,
            quantity: 1,
          },
        ],
      };
      const orderWithItems = { ...baseOrder, serviceNumber: 1, items: [item1] };
      vi.mocked(prisma.order.findUnique).mockResolvedValue(orderWithItems);

      const result = await getOrderById("order-1");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].additionals).toHaveLength(1);
      expect(result.items[0].additionals[0].nameSnapshot).toBe("Manteiga");
    });

    it("rejeita pedido inexistente com 404 ORDER_NOT_FOUND", async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

      await expect(getOrderById("inexistente")).rejects.toMatchObject({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    });
  });
});
