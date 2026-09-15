import { describe, it, expect, vi } from "vitest";

/**
 * Testa a corrida real entre duas chamadas concorrentes de advanceItem na
 * MESMA transição do MESMO item — não apenas o caso "count=0 simulado" de
 * production.service.test.ts, mas as duas transações disputando a mesma
 * linha ao mesmo tempo. Mesmo mecanismo de fake DB usado em
 * order-item-payment-race.test.ts / delivery-concurrent-delivery.test.ts
 * (Etapas 13/14): como advanceItem agora roda tudo dentro de
 * prisma.$transaction (Etapa 15) e a reivindicação da transição usa
 * updateMany condicional (`where: { id, status: previousStatus }`), o fake
 * abaixo simula esse updateMany respeitando exatamente essa condição — só
 * a primeira chamada a de fato mudar o status consegue "ganhar" a
 * atualização; a segunda encontra o status já mudado e count=0.
 *
 * advanceItem não trava a linha do pedido/item com SELECT ... FOR UPDATE
 * (ao contrário de addOrderItem/confirmPayment/deliverItem) — a
 * concorrência-segurança vem inteiramente do updateMany condicional. Por
 * isso o fake db abaixo NÃO serializa as duas chamadas: as duas leituras
 * (findUnique) acontecem livremente, cada uma podendo enxergar o mesmo
 * status PENDENTE (exatamente como duas transações reais leriam o mesmo
 * estado antes de qualquer commit) — só o updateMany é uma seção crítica
 * (checa e muda o Map de forma síncrona, sem nenhum await no meio, então
 * nunca duas chamadas intercalam DENTRO dele), reproduzindo fielmente a
 * garantia real do Postgres: um UPDATE ... WHERE condicional revalida sua
 * condição no momento em que o lock de linha é obtido, não no momento em
 * que a aplicação leu o dado — então mesmo sem SELECT ... FOR UPDATE
 * nenhuma das duas chamadas pode corromper o estado.
 */

interface FakeItemRow {
  id: string;
  orderId: string;
  requiresProductionSnapshot: boolean;
  stationIdSnapshot: string | null;
  status: "PENDENTE" | "EM_PREPARO" | "PRONTO" | "CANCELADO";
  order: {
    channel: "BALCAO" | "WHATSAPP";
    consumptionType: "LOCAL" | "VIAGEM";
    paymentStatus: "PENDENTE" | "PAGO";
  };
}

function createRaceFakeDb() {
  const items = new Map<string, FakeItemRow>();
  const historyEntries: Array<{
    orderItemId: string;
    action: string;
    previousState: string | null;
    newState: string | null;
    userId: string;
  }> = [];
  const events: string[] = [];

  function makeTx() {
    return {
      orderItem: {
        async findUnique({ where: { id } }: { where: { id: string } }) {
          const item = items.get(id);
          if (!item) return null;
          return { ...item, additionals: [] };
        },
        async updateMany({
          where,
          data,
        }: {
          where: { id: string; status: FakeItemRow["status"] };
          data: Partial<FakeItemRow>;
        }) {
          const item = items.get(where.id);
          if (!item || item.status !== where.status) return { count: 0 };
          Object.assign(item, data);
          events.push(`advanced:${item.id}:${data.status}`);
          return { count: 1 };
        },
      },
      orderHistory: {
        async create({
          data,
        }: {
          data: {
            orderItemId: string;
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
    };
  }

  const prisma = {
    // Sem nenhum mutex: chama o callback direto, deixando as duas
    // transações concorrentes se intercalarem livremente pelo event loop —
    // é exatamente essa intercalação livre que o teste precisa para
    // reproduzir a corrida real.
    $transaction<T>(callback: (tx: ReturnType<typeof makeTx>) => Promise<T>): Promise<T> {
      return callback(makeTx());
    },
  };

  function seedItem(row: FakeItemRow) {
    items.set(row.id, row);
  }

  return { prisma, items, historyEntries, events, seedItem };
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

describe("corrida entre duas chamadas concorrentes de advanceItem na mesma transição", () => {
  it("só uma das duas chamadas avança o item; a outra perde a corrida com 409 ORDER_ITEM_ADVANCE_NOT_ALLOWED, sem duplicar histórico", async () => {
    const db = resetFakeDb();
    db.seedItem({
      id: "item-1",
      orderId: "order-1",
      requiresProductionSnapshot: true,
      stationIdSnapshot: "station-1",
      status: "PENDENTE",
      order: { channel: "BALCAO", consumptionType: "LOCAL", paymentStatus: "PAGO" },
    });

    const { advanceItem } = await import("../production.service.js");

    const [first, second] = await Promise.allSettled([
      advanceItem("station-1", "item-1", "producao-1"),
      advanceItem("station-1", "item-1", "producao-2"),
    ]);

    const fulfilled = [first, second].filter((result) => result.status === "fulfilled");
    const rejected = [first, second].filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toMatchObject({
        statusCode: 409,
        code: "ORDER_ITEM_ADVANCE_NOT_ALLOWED",
      });
    }

    expect(db.events.filter((event) => event.startsWith("advanced:item-1:"))).toHaveLength(1);
    expect(db.historyEntries).toHaveLength(1);
    expect(db.historyEntries[0]).toMatchObject({
      action: "ITEM_STATUS_CHANGED",
      previousState: "PENDENTE",
      newState: "EM_PREPARO",
    });
    expect(db.items.get("item-1")?.status).toBe("EM_PREPARO");
  });
});
