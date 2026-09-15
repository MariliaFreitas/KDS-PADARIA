import { describe, it, expect, vi } from "vitest";

/**
 * Testa a corrida real entre duas chamadas concorrentes de deliverItem no
 * MESMO item — não apenas o caso sequencial (item já entregue), mas as
 * duas transações disputando a mesma linha do pedido ao mesmo tempo.
 *
 * Mesmo mecanismo de fake DB usado em
 * order-item-payment-race.test.ts (Etapa 13): um mutex por orderId que
 * reproduz a semântica de SELECT ... FOR UPDATE do Postgres. Como
 * deliverItem trava a linha do pedido como a primeira coisa que faz dentro
 * da transação, a ordem em que as duas chamadas são disparadas (a primeira
 * do array de Promise.all sempre executa, de forma síncrona, até a
 * primeira espera real) decide deterministicamente quem vence.
 */

interface FakeOrderRow {
  id: string;
  cancelledAt: Date | null;
  consumptionType: "LOCAL" | "VIAGEM";
  paymentStatus: "PENDENTE" | "PAGO";
  deliveredAt: Date | null;
}

interface FakeItemRow {
  id: string;
  orderId: string;
  status: "PENDENTE" | "EM_PREPARO" | "PRONTO" | "CANCELADO";
  requiresProductionSnapshot: boolean;
  deliveredAt: Date | null;
}

function createRaceFakeDb() {
  const orders = new Map<string, FakeOrderRow>();
  const items = new Map<string, FakeItemRow>();
  const historyEntries: Array<{ orderItemId: string | null; action: string; userId: string }> = [];
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
          return { ...order, items: [...items.values()].filter((item) => item.orderId === id) };
        },
        async updateMany({
          where,
          data,
        }: {
          where: { id: string; deliveredAt: null };
          data: Partial<FakeOrderRow>;
        }) {
          const order = orders.get(where.id);
          if (!order || order.deliveredAt !== null) return { count: 0 };
          Object.assign(order, data);
          return { count: 1 };
        },
      },
      orderItem: {
        async updateMany({
          where,
          data,
        }: {
          where: { id: string; deliveredAt: null };
          data: Partial<FakeItemRow>;
        }) {
          const item = items.get(where.id);
          if (!item || item.deliveredAt !== null) return { count: 0 };
          Object.assign(item, data);
          events.push(`item-delivered:${item.id}`);
          return { count: 1 };
        },
        async findUnique({ where: { id } }: { where: { id: string } }) {
          const item = items.get(id);
          return item ? { ...item } : null;
        },
      },
      orderHistory: {
        async create({
          data,
        }: {
          data: { orderItemId: string | null; action: string; userId: string };
        }) {
          historyEntries.push(data);
          return { id: `history-${historyEntries.length}`, ...data };
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
    items.set(row.id, row);
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

describe("corrida entre duas entregas concorrentes do mesmo item", () => {
  it("uma das duas chamadas entrega o item; a outra perde a corrida e recebe 409 ORDER_ITEM_ALREADY_DELIVERED, sem duplicar histórico", async () => {
    const db = resetFakeDb();
    db.seedOrder({
      id: "order-1",
      cancelledAt: null,
      consumptionType: "LOCAL",
      paymentStatus: "PENDENTE",
      deliveredAt: null,
    });
    db.seedItem({
      id: "item-1",
      orderId: "order-1",
      status: "PENDENTE",
      requiresProductionSnapshot: false,
      deliveredAt: null,
    });

    const { deliverItem } = await import("../delivery.service.js");

    const [first, second] = await Promise.allSettled([
      deliverItem("order-1", "item-1", "caixa-1"),
      deliverItem("order-1", "item-1", "caixa-2"),
    ]);

    // Sem anotação explícita de predicate: a partir do TS 5.5, o próprio
    // compilador infere o type predicate de um .filter() que só testa uma
    // propriedade discriminante como "status" — e infere pelo tipo real de
    // retorno de deliverItem (via Promise.allSettled), nunca um "unknown"
    // inventado que não bate com PromiseFulfilledResult/PromiseRejectedResult.
    const fulfilled = [first, second].filter((result) => result.status === "fulfilled");
    const rejected = [first, second].filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_ALREADY_DELIVERED",
      });
    }

    // Só uma entrega de verdade aconteceu; a segunda chamada nunca chega a
    // escrever nada. Como este era o único (e último) item válido do
    // pedido, a chamada vencedora também fecha o pedido na mesma
    // transação — por isso o histórico tem ITEM_DELIVERED + ORDER_DELIVERED
    // (2 entradas), nunca duplicado pela segunda chamada.
    expect(db.events.filter((event) => event.startsWith("item-delivered:"))).toHaveLength(1);
    expect(db.historyEntries).toHaveLength(2);
    expect(db.historyEntries.map((entry) => entry.action).sort()).toEqual([
      "ITEM_DELIVERED",
      "ORDER_DELIVERED",
    ]);
    expect(db.orders.get("order-1")?.deliveredAt).not.toBeNull();
  });

  it("quando o pedido tem mais de um item, a entrega do último item gera ORDER_DELIVERED exatamente uma vez mesmo sob duas chamadas concorrentes no mesmo item", async () => {
    const db = resetFakeDb();
    db.seedOrder({
      id: "order-1",
      cancelledAt: null,
      consumptionType: "LOCAL",
      paymentStatus: "PENDENTE",
      deliveredAt: null,
    });
    // item-2 já entregue de antemão: item-1 é o último item válido ainda
    // pendente — entregá-lo é o que fecha o pedido.
    db.seedItem({
      id: "item-1",
      orderId: "order-1",
      status: "PENDENTE",
      requiresProductionSnapshot: false,
      deliveredAt: null,
    });
    db.seedItem({
      id: "item-2",
      orderId: "order-1",
      status: "PENDENTE",
      requiresProductionSnapshot: false,
      deliveredAt: new Date("2026-01-01T09:00:00.000Z"),
    });

    const { deliverItem } = await import("../delivery.service.js");

    await Promise.allSettled([
      deliverItem("order-1", "item-1", "caixa-1"),
      deliverItem("order-1", "item-1", "caixa-2"),
    ]);

    const orderDeliveredEntries = db.historyEntries.filter(
      (entry) => entry.action === "ORDER_DELIVERED",
    );
    expect(orderDeliveredEntries).toHaveLength(1);
    expect(db.orders.get("order-1")?.deliveredAt).not.toBeNull();
  });
});
