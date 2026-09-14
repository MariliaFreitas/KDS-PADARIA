-- Número operacional reutilizável (serviceNumber) e o pool que o controla.
--
-- Esta migration também normaliza pedidos já existentes na mesma transação
-- em que a coluna é criada — não depende de nenhum passo manual posterior
-- para nenhum pedido terminar sem um serviceNumber válido. Nenhuma linha é
-- apagada ou recriada; orderNumber nunca é tocado.
--
-- BEGIN/COMMIT explícitos: não depende do runner de migrations envolver o
-- arquivo numa transação por conta própria. DDL (coluna e tabela novas) e o
-- backfill de dados são tratados aqui como uma única operação atômica — se
-- qualquer passo falhar, o ROLLBACK desfaz tudo, incluindo o backfill.
BEGIN;

-- 1. Coluna nova em orders, com placeholder técnico (0). Neste ponto, logo
-- após o ALTER TABLE, TODO pedido já existente está com serviceNumber=0 —
-- é exatamente esse fato que o passo 3 usa para o backfill ser seguro.
ALTER TABLE "orders" ADD COLUMN "serviceNumber" INTEGER NOT NULL DEFAULT 0;

-- 2. Pool de números operacionais reutilizáveis.
CREATE TABLE "service_number_slots" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "reusableAt" TIMESTAMP(3),

    CONSTRAINT "service_number_slots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_number_slots_number_key" ON "service_number_slots"("number");

CREATE UNIQUE INDEX "service_number_slots_orderId_key" ON "service_number_slots"("orderId");

ALTER TABLE "service_number_slots"
    ADD CONSTRAINT "service_number_slots_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Backfill determinístico dos pedidos existentes, na mesma transação.
--
-- orderNumber já é único e permanente (autoincrement de antes desta
-- migration), então usá-lo como serviceNumber inicial de cada pedido não
-- pode colidir com nenhum outro pedido — todos partem de 0 ao mesmo tempo
-- no passo 1, então não existe conflito a resolver aqui.
--
-- id do slot: usa o próprio orders.id do pedido, sem depender de nenhuma
-- extensão do Postgres para gerar um novo. Isso é seguro porque cada pedido
-- já tem um id único e recebe exatamente um ServiceNumberSlot aqui (a
-- constraint @unique em orderId garante isso daqui pra frente também).
-- Slots criados depois, pela aplicação, continuam usando o @default(uuid())
-- normal do Prisma — nunca reaproveitam o id de um pedido.
--
-- Elegibilidade de reuso por pedido:
--   * PAGO e com paidAt registrado -> reusableAt = paidAt + 7h
--   * qualquer outro caso (aberto, ou cancelado sem pagamento) -> NULL
-- Cancelamento sozinho não libera o número: esta etapa não define uma
-- política de liberação por cancelamento, só por pagamento confirmado.
UPDATE "orders" SET "serviceNumber" = "orderNumber";

INSERT INTO "service_number_slots" ("id", "number", "orderId", "reusableAt")
SELECT
    "id",
    "orderNumber",
    "id",
    CASE
        WHEN "paymentStatus" = 'PAGO'::"PaymentStatus" AND "paidAt" IS NOT NULL
            THEN "paidAt" + INTERVAL '7 hours'
        ELSE NULL
    END
FROM "orders";

COMMIT;
