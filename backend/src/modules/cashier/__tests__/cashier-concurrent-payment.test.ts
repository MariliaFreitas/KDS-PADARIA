import { describe, it, expect, vi } from "vitest";

/**
 * Testa a corrida real entre duas confirmações concorrentes do MESMO
 * pagamento — não apenas o caso sequencial (pagamento já confirmado), mas
 * as duas transações disputando a mesma linha do pedido ao mesmo tempo.
 * Mesmo mecanismo de fake DB usado em order-item-payment-race.test.ts e
 * delivery-concurrent-delivery.test.ts (Etapas 13/14): um mutex por
 * orderId que reproduz a semântica de SELECT ... FOR UPDATE do Postgres —
 * como confirmPayment trava a linha do pedido como a primeira coisa que
 * faz dentro da transação, a ordem em que as duas chamadas são disparadas
 * decide deterministicamente quem vence.
 */

interface FakeOrderRow {
  id: string;
  paymentStatus: "PENDENTE" | "PAGO";
  cancelledAt: Date | null;
  paidAt: Date | null;
  paidByUserId: string | null;
  serviceNumber: number;
}

interface FakeItemRow {
  id: string;
  orderId: string;
  totalCents: number;
  status: "PENDENTE" | "CANCELADO";
}

function createRaceFakeDb() {
  const orders = new Map<string, FakeOrderRow>();
  const items: FakeItemRow[] = [];
  const historyEntries: Array<{
    orderId: string;
    orderItemId: string | null;
    action: string;
    previousState: string | null;
    newState: string | null;
    userId: string;
  }> = [];
  const events: string[] = [];
  const lockQueues = new Map<string, Promise<void>>();

  async function acquireOrderLock(orderId: string, registerRelease: (release: () => void) => void) {
    const previousTail = lockQueues.get(orderId) ?? Promise.resolve();
    let release!: () => void;
    const myTurn = new Promise<void>((resolve) => {
      release = resolve;
    });
    lockQueues.set(
      orderId,
      previousTail.then(() => myTurn),
    );
    await previousTail;
    registerRelease(release);
  }

  function makeTx(locksHeld: Array<() => void>) {
    return {
      async $queryRaw(_strings: TemplateStringsArray, orderId: string) {
        await acquireOrderLock(orderId, (release) => locksHeld.push(release));
        return [{ id: orderId }];
      },
      order: {
        async findUnique({ where: { id } }: { where: { id: string } }) {
          const order = orders.get(id);
          if (!order) return null;
          return { ...order, items: items.filter((item) => item.orderId === id) };
        },
        async updateMany({
          where,
          data,
        }: {
          where: { id: string; paymentStatus: string; cancelledAt: null };
          data: Partial<FakeOrderRow>;
        }) {
          const order = orders.get(where.id);
          if (!order || order.paymentStatus !== where.paymentStatus || order.cancelledAt !== null) {
            return { count: 0 };
          }
          Object.assign(order, data);
          events.push(`paid:${order.id}`);
          return { count: 1 };
        },
      },
      orderHistory: {
        async create({
          data,
        }: {
          data: {
            orderId: string;
            orderItemId: string | null;
            action: string;
            previousState: string | null;
            newState: string | null;
            userId: string;
          };
        }) {
          historyEntries.push(data);
          return { id: `history-${historyEntries.length}`, ...data };
        },
      },
      serviceNumberSlot: {
        async update() {
          return { id: "slot-1", number: 5, orderId: "order-1", reusableAt: new Date() };
        },
      },
    };
  }

  const prisma = {
    async $transaction<T>(callback: (tx: ReturnType<typeof makeTx>) => Promise<T>): Promise<T> {
      const locksHeld: Array<() => void> = [];
      try {
        const tx = makeTx(locksHeld);
        const result = await callback(tx);
        events.push("commit");
        return result;
      } finally {
        locksHeld.forEach((release) => release());
      }
    },
  };

  function seedOrder(row: FakeOrderRow) {
    orders.set(row.id, row);
  }

  function seedItem(row: FakeItemRow) {
    items.push(row);
  }

  return { prisma, orders, items, historyEntries, events, seedOrder, seedItem };
}

const fakeDbHolder: { current: ReturnType<typeof createRaceFakeDb> | null } = { current: null };

function currentDb(): ReturnType<typeof createRaceFakeDb> {
  if (!fakeDbHolder.current) {
    throw new Error("fake db não inicializado — chame resetFakeDb() antes do teste");
  }
  return fakeDbHolder.current;
}

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      currentDb().prisma.$transaction(callback),
  },
}));

function resetFakeDb() {
  const db = createRaceFakeDb();
  fakeDbHolder.current = db;
  return db;
}

describe("corrida entre duas confirmações concorrentes do mesmo pagamento", () => {
  it("uma das duas chamadas confirma o pagamento; a outra perde a corrida e recebe 409 PAYMENT_ALREADY_CONFIRMED, sem duplicar histórico", async () => {
    const db = resetFakeDb();
    db.seedOrder({
      id: "order-1",
      paymentStatus: "PENDENTE",
      cancelledAt: null,
      paidAt: null,
      paidByUserId: null,
      serviceNumber: 5,
    });
    db.seedItem({ id: "item-1", orderId: "order-1", totalCents: 1000, status: "PENDENTE" });

    const { confirmPayment } = await import("../cashier.service.js");

    const [first, second] = await Promise.allSettled([
      confirmPayment("order-1", "caixa-1"),
      confirmPayment("order-1", "caixa-2"),
    ]);

    const fulfilled = [first, second].filter((result) => result.status === "fulfilled");
    const rejected = [first, second].filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toMatchObject({
        statusCode: 409,
        code: "PAYMENT_ALREADY_CONFIRMED",
      });
    }

    expect(db.events.filter((event) => event.startsWith("paid:"))).toHaveLength(1);
    expect(db.historyEntries).toHaveLength(1);
    expect(db.historyEntries[0]).toMatchObject({
      orderId: "order-1",
      orderItemId: null,
      action: "PAYMENT_CONFIRMED",
      previousState: "PENDENTE",
      newState: "PAGO",
    });
    expect(db.orders.get("order-1")?.paymentStatus).toBe("PAGO");
  });
});
