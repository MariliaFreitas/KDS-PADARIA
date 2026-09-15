import { describe, it, expect, vi } from "vitest";

/**
 * Testa a corrida real entre addOrderItem e confirmPayment no mesmo
 * pedido — não apenas o caso sequencial (pedido já PAGO), mas as duas
 * transações disputando o mesmo pedido ao mesmo tempo.
 *
 * O fake abaixo simula só o que interessa para essa corrida: uma tabela
 * de pedidos/itens em memória e um mutex por orderId que reproduz
 * exatamente a semântica de SELECT ... FOR UPDATE do Postgres — quem
 * chama a trava primeiro só libera quando a transação inteira (o
 * callback passado a $transaction) termina, e quem perde fica bloqueado
 * até lá. Como addOrderItem e confirmPayment travam a linha do pedido
 * como a primeira coisa que fazem dentro da transação, a ordem em que as
 * duas chamadas são disparadas (a primeira do array de Promise.all
 * sempre executa, de forma síncrona, até a primeira espera real) decide
 * deterministicamente quem vence — sem precisar de nenhum sleep/timing.
 */

interface FakeOrderRow {
  id: string;
  paymentStatus: "PENDENTE" | "PAGO";
  cancelledAt: Date | null;
  deliveredAt: Date | null;
  paidAt: Date | null;
  paidByUserId: string | null;
  serviceNumber: number;
}

interface FakeItemRow {
  id: string;
  orderId: string;
  totalCents: number;
  status: "PENDENTE" | "CANCELADO";
  productNameSnapshot: string;
  quantity: number | null;
  weightGrams: number | null;
  variationNameSnapshot: string | null;
}

function createRaceFakeDb() {
  const orders = new Map<string, FakeOrderRow>();
  const items: FakeItemRow[] = [];
  const events: string[] = [];
  const lockQueues = new Map<string, Promise<void>>();
  let nextItemId = 1;

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
          // confirmPayment sempre pede include:{items:true}; addOrderItem
          // nunca lê .items — incluir sempre é inofensivo para os dois.
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
          return { count: 1 };
        },
      },
      orderItem: {
        async create({
          data,
        }: {
          data: { orderId: string; totalCents: number; productNameSnapshot: string };
        }) {
          const row: FakeItemRow = {
            id: `item-${nextItemId}`,
            orderId: data.orderId,
            totalCents: data.totalCents,
            status: "PENDENTE",
            productNameSnapshot: data.productNameSnapshot,
            quantity: 1,
            weightGrams: null,
            variationNameSnapshot: null,
          };
          nextItemId += 1;
          items.push(row);
          events.push(`item-created:${row.id}`);
          return { ...row, additionals: [] };
        },
      },
      product: {
        async findUnique() {
          return {
            id: "product-1",
            name: "Coxinha",
            active: true,
            available: true,
            saleType: "UNIT" as const,
            unitPriceCents: 1000,
            pricePerKgCents: null,
            requiresProduction: false,
            stationId: null,
            station: null,
          };
        },
      },
      productVariation: { async findUnique() { return null; } },
      additional: { async findUnique() { return null; } },
      serviceNumberSlot: {
        async update() {
          return { id: "slot-1", number: 5, orderId: "order-1", reusableAt: new Date() };
        },
      },
      orderHistory: {
        async create({ data }: { data: { orderItemId: string | null; action: string; userId: string } }) {
          events.push(`history-created:${data.action}`);
          return { id: "history-1", ...data };
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

  return { prisma, orders, items, events, seedOrder, seedItem };
}

const fakeDbHolder: { current: ReturnType<typeof createRaceFakeDb> | null } = { current: null };

function currentDb(): ReturnType<typeof createRaceFakeDb> {
  if (!fakeDbHolder.current) {
    throw new Error("fake db não inicializado — chame resetFakeDb() antes do teste");
  }
  return fakeDbHolder.current;
}

// Só $transaction precisa ser redirecionado dinamicamente: é o único
// método que addOrderItem/confirmPayment chamam direto em `prisma` — tudo
// o resto (order, orderItem, product...) só é acessado via `tx`, que o
// $transaction de cada fake db constrói do zero a cada chamada.
vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      currentDb().prisma.$transaction(callback),
  },
}));

vi.mock("../service-number.service.js", () => ({
  scheduleServiceNumberReuse: vi.fn().mockResolvedValue(undefined),
}));

function resetFakeDb() {
  const db = createRaceFakeDb();
  fakeDbHolder.current = db;
  return db;
}

describe("corrida entre inclusão de item e confirmação de pagamento", () => {
  it("quando a inclusão de item vence a corrida, o pagamento confirmado considera esse item", async () => {
    const db = resetFakeDb();
    db.seedOrder({
      id: "order-1",
      paymentStatus: "PENDENTE",
      cancelledAt: null,
      deliveredAt: null,
      paidAt: null,
      paidByUserId: null,
      serviceNumber: 5,
    });
    // Nenhum item ainda: se o pagamento visse o pedido sem esperar a
    // inclusão terminar, ele rejeitaria com PAYMENT_NOTHING_TO_CHARGE em
    // vez de confirmar — é essa diferença que a asserção abaixo verifica.

    const { addOrderItem } = await import("../order-item.service.js");
    const { confirmPayment } = await import("../../cashier/cashier.service.js");

    // addOrderItem aparece primeiro no array: é chamado primeiro, então é
    // quem trava a linha do pedido primeiro — vence a corrida por
    // construção, não por sorte.
    const [itemResult, paymentResult] = await Promise.all([
      addOrderItem(
        "order-1",
        {
          productId: "product-1",
          quantity: 1,
          observation: null,
        },
        "atendente-1",
      ),
      confirmPayment("order-1", "caixa-1"),
    ]);

    expect(itemResult).toMatchObject({ orderId: "order-1", totalCents: 1000 });
    expect(paymentResult.paymentStatus).toBe("PAGO");
    expect(db.items).toHaveLength(1);
    expect(db.events.indexOf("item-created:item-1")).toBeLessThan(
      db.events.lastIndexOf("commit"),
    );
  });

  it("quando o pagamento vence a corrida, a inclusão de item falha com 409 ORDER_ALREADY_PAID e nenhum item é criado", async () => {
    const db = resetFakeDb();
    db.seedOrder({
      id: "order-2",
      paymentStatus: "PENDENTE",
      cancelledAt: null,
      deliveredAt: null,
      paidAt: null,
      paidByUserId: null,
      serviceNumber: 6,
    });
    // Item pré-existente: sem ele, confirmPayment rejeitaria com
    // PAYMENT_NOTHING_TO_CHARGE independente da corrida, e o teste não
    // provaria nada sobre a trava.
    db.seedItem({
      id: "item-pre",
      orderId: "order-2",
      totalCents: 2000,
      status: "PENDENTE",
      productNameSnapshot: "Café",
      quantity: 1,
      weightGrams: null,
      variationNameSnapshot: null,
    });

    const { addOrderItem } = await import("../order-item.service.js");
    const { confirmPayment } = await import("../../cashier/cashier.service.js");

    // confirmPayment aparece primeiro: trava a linha primeiro, vence a
    // corrida por construção.
    const [paymentSettled, itemSettled] = await Promise.allSettled([
      confirmPayment("order-2", "caixa-1"),
      addOrderItem(
        "order-2",
        {
          productId: "product-1",
          quantity: 1,
          observation: null,
        },
        "atendente-1",
      ),
    ]);

    expect(paymentSettled.status).toBe("fulfilled");
    if (paymentSettled.status === "fulfilled") {
      expect(paymentSettled.value.paymentStatus).toBe("PAGO");
    }

    expect(itemSettled.status).toBe("rejected");
    if (itemSettled.status === "rejected") {
      expect(itemSettled.reason).toMatchObject({
        statusCode: 409,
        code: "ORDER_ALREADY_PAID",
      });
    }

    // Só o item pré-existente continua lá — nada foi criado depois do
    // fechamento financeiro.
    expect(db.items).toHaveLength(1);
    expect(db.items[0].id).toBe("item-pre");
  });
});
