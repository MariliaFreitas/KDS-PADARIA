import type { Prisma } from "@prisma/client";

/**
 * Um número operacional só volta a ficar disponível 7 horas depois do
 * pagamento do pedido que o usava — nunca imediatamente após pagar.
 */
export const SERVICE_NUMBER_REUSE_DELAY_MS = 7 * 60 * 60 * 1000;

type TransactionClient = Prisma.TransactionClient;

/**
 * Tenta reivindicar o menor número já liberado (reusableAt no passado).
 * O updateMany repete a condição reusableAt<=now do próprio findFirst: se
 * outra transação concorrente já tiver reivindicado esse slot entre as
 * duas consultas, count vem 0 — nesse caso não desistimos direto para um
 * número novo, tentamos o próximo menor slot ainda elegível (excluindo os
 * que já perdemos a corrida). Não há limite de tentativas: o conjunto de
 * candidatos ainda não tentados só diminui a cada volta (cada perda entra
 * em lostSlotIds e nunca mais é considerada), então o loop sempre termina
 * — no máximo depois de esgotar todos os slots reutilizáveis que existiam
 * no banco no início da chamada — e só desiste de reaproveitar quando uma
 * consulta nova confirma que não sobrou nenhum candidato elegível.
 */
async function claimReusableSlot(tx: TransactionClient, orderId: string): Promise<number | null> {
  const now = new Date();
  const lostSlotIds: string[] = [];

  for (;;) {
    const candidate = await tx.serviceNumberSlot.findFirst({
      where: { reusableAt: { lte: now }, id: { notIn: [...lostSlotIds] } },
      orderBy: { number: "asc" },
    });

    if (!candidate) {
      return null;
    }

    const claim = await tx.serviceNumberSlot.updateMany({
      where: { id: candidate.id, reusableAt: { lte: now } },
      data: { orderId, reusableAt: null },
    });

    if (claim.count === 1) {
      return candidate.number;
    }

    lostSlotIds.push(candidate.id);
  }
}

/**
 * Cria um slot novo com o próximo número da sequência (maior número + 1,
 * ou 1 se ainda não existir nenhum). A constraint @unique em number é a
 * proteção final contra duas transações concorrentes calculando o mesmo
 * próximo número: a segunda falha aqui com violação de unicidade, e quem
 * chamou (createOrder) reinicia a transação inteira.
 */
async function createNewSlot(tx: TransactionClient, orderId: string): Promise<number> {
  const highest = await tx.serviceNumberSlot.findFirst({ orderBy: { number: "desc" } });
  const nextNumber = (highest?.number ?? 0) + 1;

  const slot = await tx.serviceNumberSlot.create({
    data: { number: nextNumber, orderId, reusableAt: null },
  });

  return slot.number;
}

/**
 * Aloca um número operacional para um pedido recém-criado: reaproveita o
 * menor número liberado, se houver, senão cria um novo. Precisa sempre
 * rodar dentro da transação que também cria o pedido (o chamador é quem
 * decide reiniciar tudo se uma corrida for perdida).
 */
export async function allocateServiceNumber(
  tx: TransactionClient,
  orderId: string,
): Promise<number> {
  const reused = await claimReusableSlot(tx, orderId);
  if (reused !== null) {
    return reused;
  }

  return createNewSlot(tx, orderId);
}

/**
 * Agenda a liberação do número operacional do pedido pago: só fica
 * elegível para reuso 7 horas depois de paidAt.
 */
export async function scheduleServiceNumberReuse(
  tx: TransactionClient,
  orderId: string,
  paidAt: Date,
): Promise<void> {
  const reusableAt = new Date(paidAt.getTime() + SERVICE_NUMBER_REUSE_DELAY_MS);

  await tx.serviceNumberSlot.update({
    where: { orderId },
    data: { reusableAt },
  });
}
